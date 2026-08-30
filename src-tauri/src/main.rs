#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::WebviewWindowBuilder,
    AppHandle, Emitter, Manager, Theme,
};

pub struct DbState(pub Mutex<Connection>);

const DEFAULT_GLOBAL_HOTKEY: &str = "cmdorctrl+shift+space";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub folder: String,
    pub favorite: bool,
    pub use_count: i64,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub autostart: bool,
    pub theme: String,
    pub language: String,
    pub advance_key: String,
    pub newline_key: String,
    pub back_key: String,
    pub auto_check_update: bool,
}

fn init_db(app: &AppHandle) -> Connection {
    let dir = app.path().app_data_dir().expect("无法获取数据目录");
    fs::create_dir_all(&dir).ok();
    let conn = Connection::open(dir.join("prompts.db")).expect("无法打开数据库");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]',
            folder TEXT NOT NULL DEFAULT '',
            favorite INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0,
            last_used_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );",
    )
    .expect("建表失败");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 0 {
        for p in default_prompts() {
            insert_prompt(&conn, &p).expect("写入默认 Prompt 失败");
        }
    }
    conn
}

fn insert_prompt(conn: &Connection, p: &Prompt) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO prompts (id,title,body,tags,folder,favorite,use_count,last_used_at,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            p.id,
            p.title,
            p.body,
            serde_json::to_string(&p.tags).unwrap_or_default(),
            p.folder,
            p.favorite as i32,
            p.use_count,
            p.last_used_at,
            p.created_at,
            p.updated_at
        ],
    )
    .map(|_| ())
}

fn row_to_prompt(row: &rusqlite::Row) -> rusqlite::Result<Prompt> {
    let tags: String = row.get(3)?;
    Ok(Prompt {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        folder: row.get(4)?,
        favorite: row.get::<_, i32>(5)? != 0,
        use_count: row.get(6)?,
        last_used_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

pub fn default_prompts() -> Vec<Prompt> {
    let json = include_str!("default-prompts.json");
    let data: serde_json::Value = serde_json::from_str(json).unwrap_or_default();
    prompts_from_json(&data)
}

fn prompts_from_json(data: &serde_json::Value) -> Vec<Prompt> {
    data.get("prompts")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    Some(Prompt {
                        id: p.get("id")?.as_str()?.to_string(),
                        title: p.get("title")?.as_str()?.to_string(),
                        body: p
                            .get("body")
                            .and_then(|b| b.as_str())
                            .unwrap_or("")
                            .to_string(),
                        tags: p
                            .get("tags")
                            .and_then(|t| t.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|t| t.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default(),
                        folder: p
                            .get("folder")
                            .and_then(|f| f.as_str())
                            .unwrap_or("")
                            .to_string(),
                        favorite: p.get("favorite").and_then(|f| f.as_bool()).unwrap_or(false),
                        use_count: p.get("useCount").and_then(|v| v.as_i64()).unwrap_or(0),
                        last_used_at: p.get("lastUsedAt").and_then(|v| v.as_i64()),
                        created_at: p.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0),
                        updated_at: p.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn list_prompts(state: tauri::State<DbState>) -> Result<Vec<Prompt>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,title,body,tags,folder,favorite,use_count,last_used_at,created_at,updated_at FROM prompts")
        .map_err(|e| e.to_string())?;
    let list = stmt
        .query_map([], row_to_prompt)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(list)
}

#[tauri::command]
fn save_prompt(state: tauri::State<DbState>, mut prompt: Prompt) -> Result<Prompt, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono_now();
    if prompt.id.is_empty() {
        prompt.id = uuid::Uuid::new_v4().to_string();
        prompt.created_at = now;
    } else {
        prompt.created_at = conn
            .query_row(
                "SELECT created_at FROM prompts WHERE id=?1",
                [&prompt.id],
                |r| r.get(0),
            )
            .unwrap_or(now);
    }
    prompt.updated_at = now;
    insert_prompt(&conn, &prompt).map_err(|e| e.to_string())?;
    Ok(prompt)
}

#[tauri::command]
fn delete_prompt(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM prompts WHERE id=?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn mark_used(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prompts SET use_count = use_count + 1, last_used_at = ?1 WHERE id = ?2",
        params![chrono_now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
fn get_settings(state: tauri::State<DbState>) -> Result<Settings, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(read_settings(&conn))
}

fn default_settings() -> Settings {
    Settings {
        hotkey: DEFAULT_GLOBAL_HOTKEY.into(),
        autostart: false,
        theme: "auto".into(),
        language: "auto".into(),
        advance_key: "enter".into(),
        newline_key: "shift+enter".into(),
        back_key: "escape".into(),
        auto_check_update: false,
    }
}

// 键位格式：可选的 ctrl/alt/shift/meta 修饰键 + 一个非修饰键，如 "shift+enter"
fn is_valid_key_binding(value: &str) -> bool {
    let mut key = String::new();
    for part in value.split('+') {
        let part = part.trim();
        if part.is_empty() {
            return false;
        }
        let lower = part.to_ascii_lowercase();
        if !matches!(lower.as_str(), "ctrl" | "alt" | "shift" | "meta") {
            if !key.is_empty() {
                return false;
            }
            key = lower;
        }
    }
    !key.is_empty()
}

fn read_settings(conn: &Connection) -> Settings {
    let get = |k: &str| -> String {
        conn.query_row("SELECT v FROM settings WHERE k=?1", [k], |r| r.get(0))
            .unwrap_or_default()
    };
    let get_or = |k: &str, default: &str| -> String {
        let value = get(k);
        if is_valid_key_binding(&value) {
            value
        } else {
            default.into()
        }
    };
    Settings {
        hotkey: {
            let value = get("hotkey");
            if value.is_empty() {
                DEFAULT_GLOBAL_HOTKEY.into()
            } else {
                value
            }
        },
        autostart: get("autostart") == "1",
        theme: {
            let value = get("theme");
            if matches!(value.as_str(), "auto" | "light" | "dark") {
                value
            } else {
                "auto".into()
            }
        },
        language: {
            let value = get("language");
            if matches!(value.as_str(), "auto" | "zh" | "en") {
                value
            } else {
                "auto".into()
            }
        },
        advance_key: get_or("advance_key", "enter"),
        newline_key: get_or("newline_key", "shift+enter"),
        back_key: get_or("back_key", "escape"),
        auto_check_update: get("auto_check_update") == "1",
    }
}

#[tauri::command]
fn set_settings(
    app: AppHandle,
    state: tauri::State<DbState>,
    settings: Settings,
) -> Result<(), String> {
    if !matches!(settings.theme.as_str(), "auto" | "light" | "dark") {
        return Err("settings.invalid_theme".into());
    }
    if !matches!(settings.language.as_str(), "auto" | "zh" | "en") {
        return Err("settings.invalid_language".into());
    }
    for value in [
        &settings.advance_key,
        &settings.newline_key,
        &settings.back_key,
    ] {
        if !is_valid_key_binding(value) {
            return Err("settings.invalid_key_binding".into());
        }
    }

    let previous = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        read_settings(&conn)
    };

    replace_hotkey(&app, &previous.hotkey, &settings.hotkey)?;

    if let Err(error) = apply_autostart(&app, settings.autostart) {
        let _ = replace_hotkey(&app, &settings.hotkey, &previous.hotkey);
        let _ = apply_autostart(&app, previous.autostart);
        return Err(format!("settings.autostart_failed:{error}"));
    }

    let save_result = (|| -> Result<(), String> {
        let mut conn = state.0.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (key, value) in [
            ("hotkey", settings.hotkey.clone()),
            (
                "autostart",
                if settings.autostart { "1" } else { "0" }.into(),
            ),
            ("theme", settings.theme.clone()),
            ("language", settings.language.clone()),
            ("advance_key", settings.advance_key.clone()),
            ("newline_key", settings.newline_key.clone()),
            ("back_key", settings.back_key.clone()),
            (
                "auto_check_update",
                if settings.auto_check_update { "1" } else { "0" }.into(),
            ),
        ] {
            tx.execute(
                "INSERT OR REPLACE INTO settings (k,v) VALUES (?1,?2)",
                params![key, value],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    })();

    if let Err(error) = save_result {
        let _ = replace_hotkey(&app, &settings.hotkey, &previous.hotkey);
        let _ = apply_autostart(&app, previous.autostart);
        return Err(error);
    }

    apply_window_preferences(&app, &settings);
    update_tray_menu(&app, &settings)?;
    app.emit("settings-changed", settings)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn register_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let sc = Shortcut::try_from(hotkey).map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(sc, |app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                toggle_main(app);
            }
        })
        .map_err(|e| e.to_string())
}

fn replace_hotkey(app: &AppHandle, old_hotkey: &str, new_hotkey: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let new_shortcut = Shortcut::try_from(new_hotkey).map_err(|e| e.to_string())?;
    if old_hotkey.eq_ignore_ascii_case(new_hotkey) {
        return Ok(());
    }

    if let Ok(old_shortcut) = Shortcut::try_from(old_hotkey) {
        app.global_shortcut()
            .unregister(old_shortcut)
            .map_err(|e| e.to_string())?;
    }

    let result = app
        .global_shortcut()
        .on_shortcut(new_shortcut, |app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                toggle_main(app);
            }
        });

    if let Err(error) = result {
        let _ = register_hotkey(app, old_hotkey);
        return Err(error.to_string());
    }
    Ok(())
}

fn get_settings_inner(app: &AppHandle) -> Settings {
    app.state::<DbState>()
        .0
        .lock()
        .ok()
        .map(|conn| read_settings(&conn))
        .unwrap_or_else(default_settings)
}

fn apply_autostart(app: &AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::AutoLaunchManager;
    let manager = app.state::<AutoLaunchManager>();
    if enable {
        manager.enable()
    } else {
        manager.disable()
    }
    .map_err(|error| error.to_string())
}

fn use_chinese(language: &str) -> bool {
    match language {
        "zh" => true,
        "en" => false,
        _ => sys_locale::get_locale()
            .map(|locale| locale.to_ascii_lowercase().starts_with("zh"))
            .unwrap_or(false),
    }
}

fn capitalize_hotkey_key(value: &str) -> String {
    match value {
        "escape" | "esc" => "Esc".into(),
        "space" => "Space".into(),
        "enter" => "Enter".into(),
        "tab" => "Tab".into(),
        "backspace" => "Backspace".into(),
        "delete" => "Delete".into(),
        _ if value.len() == 1 => value.to_ascii_uppercase(),
        _ => {
            let mut chars = value.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        }
    }
}

fn format_hotkey_for_display(value: &str, is_macos: bool) -> String {
    let mut modifiers: Vec<(&str, usize)> = Vec::new();
    let mut key = String::new();

    for part in value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        let lower = part.to_ascii_lowercase();
        let modifier = match lower.as_str() {
            "control" | "ctrl" => Some("ctrl"),
            "option" | "alt" => Some("alt"),
            "shift" => Some("shift"),
            "command" | "cmd" | "super" | "meta" | "win" | "windows" => Some("meta"),
            "commandorcontrol" | "commandorctrl" | "cmdorcontrol" | "cmdorctrl" => {
                Some("cmdorctrl")
            }
            _ => None,
        };

        if let Some(modifier) = modifier {
            let rank = if is_macos {
                match modifier {
                    "ctrl" => 0,
                    "alt" => 1,
                    "shift" => 2,
                    _ => 3,
                }
            } else {
                match modifier {
                    "ctrl" | "cmdorctrl" => 0,
                    "alt" => 1,
                    "shift" => 2,
                    _ => 3,
                }
            };
            modifiers.push((modifier, rank));
        } else {
            key = capitalize_hotkey_key(&lower);
        }
    }

    modifiers.sort_by_key(|(_, rank)| *rank);
    let mut display: Vec<String> = modifiers
        .into_iter()
        .map(|(modifier, _)| {
            if is_macos {
                match modifier {
                    "ctrl" => "⌃",
                    "alt" => "⌥",
                    "shift" => "⇧",
                    "meta" | "cmdorctrl" => "⌘",
                    _ => modifier,
                }
            } else {
                match modifier {
                    "ctrl" | "cmdorctrl" => "Ctrl",
                    "alt" => "Alt",
                    "shift" => "Shift",
                    "meta" => "Win",
                    _ => modifier,
                }
            }
            .to_string()
        })
        .collect();
    if !key.is_empty() {
        display.push(key);
    }
    display.join(if is_macos { "" } else { "+" })
}

#[cfg(target_os = "macos")]
fn set_manager_activation(app: &AppHandle, manager_visible: bool) {
    let policy = if manager_visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
    let _ = app.set_dock_visibility(manager_visible);
}

#[cfg(not(target_os = "macos"))]
fn set_manager_activation(_app: &AppHandle, _manager_visible: bool) {}

fn manager_title(settings: &Settings) -> &'static str {
    if use_chinese(&settings.language) {
        "PromptDock 管理器"
    } else {
        "PromptDock Manager"
    }
}

fn window_theme(theme: &str) -> Option<Theme> {
    match theme {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

fn apply_window_preferences(app: &AppHandle, settings: &Settings) {
    let theme = window_theme(&settings.theme);
    for window in app.webview_windows().values() {
        let _ = window.set_theme(theme);
    }
    if let Some(manager) = app.get_webview_window("manager") {
        let _ = manager.set_title(manager_title(settings));
    }
}

fn build_tray_menu(app: &AppHandle, settings: &Settings) -> tauri::Result<Menu<tauri::Wry>> {
    let hotkey = format_hotkey_for_display(&settings.hotkey, cfg!(target_os = "macos"));
    let (open_label, call_label, quit_label) = if use_chinese(&settings.language) {
        (
            "打开 Prompt 管理".to_string(),
            format!("调用 Prompt ({hotkey})"),
            "退出".to_string(),
        )
    } else {
        (
            "Open Prompt Manager".to_string(),
            format!("Call Prompt ({hotkey})"),
            "Quit".to_string(),
        )
    };
    let open = MenuItem::with_id(app, "open", open_label, true, None::<&str>)?;
    let call = MenuItem::with_id(app, "call", call_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &call, &quit])
}

fn update_tray_menu(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let menu = build_tray_menu(app, settings).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn toggle_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            if let Ok(Some(m)) = win.current_monitor() {
                let window_size = win.outer_size().unwrap_or_default();
                let _ = win.set_position(tauri::PhysicalPosition::new(
                    m.position().x + (m.size().width as i32 - window_size.width as i32) / 2,
                    m.position().y + (m.size().height as i32 - window_size.height as i32) / 3,
                ));
            }
            let _ = win.show();
            let _ = win.set_focus();
            let _ = app.emit("main-shown", ());
        }
    }
}

#[tauri::command]
fn hide_main(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn open_manager(app: AppHandle) {
    set_manager_activation(&app, true);
    let settings = get_settings_inner(&app);
    match app.get_webview_window("manager") {
        Some(win) => {
            let _ = win.show();
            let _ = win.set_focus();
        }
        None => {
            let _ = WebviewWindowBuilder::new(
                &app,
                "manager",
                tauri::WebviewUrl::App("index.html?window=manager".into()),
            )
            .title(manager_title(&settings))
            .theme(window_theme(&settings.theme))
            .inner_size(1080.0, 720.0)
            .min_inner_size(860.0, 560.0)
            .build();
        }
    }
}

#[tauri::command]
fn export_prompts(state: tauri::State<DbState>, path: String) -> Result<(), String> {
    let prompts = list_prompts(state)?;
    let doc = serde_json::json!({
        "format": "promptdeck",
        "version": 1,
        "exportedAt": chrono_now(),
        "prompts": prompts,
    });
    fs::write(
        &path,
        serde_json::to_string_pretty(&doc).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())
}

fn validate_import_document(data: &serde_json::Value) -> Result<Vec<Prompt>, String> {
    let format = data
        .get("format")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "import.missing_format".to_string())?;
    if !matches!(format, "promptdeck" | "promptdock") {
        return Err("import.unsupported_format".into());
    }
    if data.get("version").and_then(|value| value.as_u64()) != Some(1) {
        return Err("import.unsupported_version".into());
    }
    let prompt_values = data
        .get("prompts")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "import.missing_prompts".to_string())?;
    let prompts: Vec<Prompt> = prompt_values
        .iter()
        .cloned()
        .map(serde_json::from_value)
        .collect::<Result<_, _>>()
        .map_err(|_| "import.invalid_prompt".to_string())?;
    if prompts.is_empty() {
        return Err("import.no_prompts".into());
    }
    Ok(prompts)
}

#[tauri::command]
fn import_prompts(
    state: tauri::State<DbState>,
    path: String,
    replace: bool,
) -> Result<usize, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("import.read_failed:{e}"))?;
    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|_| "import.invalid_json".to_string())?;
    let prompts = validate_import_document(&data)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if replace {
        tx.execute("DELETE FROM prompts", [])
            .map_err(|e| e.to_string())?;
    }
    for p in &prompts {
        // 同名但 id 不同的旧条目：保留其 id 与使用记录，内容更新为文件版本
        let conflicting_id: Option<String> = tx
            .query_row(
                "SELECT id FROM prompts WHERE title = ?1 AND id <> ?2",
                params![p.title, p.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(old_id) = conflicting_id {
            tx.execute(
                "UPDATE prompts SET body = ?2, tags = ?3, folder = ?4, favorite = ?5, updated_at = ?6
                 WHERE id = ?1",
                params![
                    old_id,
                    p.body,
                    serde_json::to_string(&p.tags).unwrap_or_default(),
                    p.folder,
                    p.favorite as i32,
                    chrono_now(),
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            insert_prompt(&tx, p).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(prompts.len())
}

pub struct PendingUpdate(pub Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let pending_state = app.state::<PendingUpdate>();
    let mut pending = pending_state.0.lock().map_err(|e| e.to_string())?;
    match update {
        Some(update) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
            };
            *pending = Some(update);
            Ok(Some(info))
        }
        None => {
            *pending = None;
            Ok(None)
        }
    }
}

async fn install_pending_update(app: &AppHandle) -> Result<(), String> {
    let update = {
        let pending_state = app.state::<PendingUpdate>();
        let mut pending = pending_state.0.lock().map_err(|e| e.to_string())?;
        pending
            .take()
            .ok_or_else(|| "update.not_pending".to_string())?
    };
    let emitter = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = emitter.emit(
                    "update-download-progress",
                    serde_json::json!({ "chunkLength": chunk_length, "contentLength": content_length }),
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    install_pending_update(&app).await
}

// 自动检查发现新版本时弹出原生对话框确认，托盘常驻场景下不依赖任何窗口
fn prompt_install_update(app: &AppHandle, version: &str) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let settings = get_settings_inner(app);
    let (title, message) = if use_chinese(&settings.language) {
        (
            "PromptDock 更新".to_string(),
            format!("发现新版本 {version}，是否立即安装？\n安装完成后应用将自动重启。"),
        )
    } else {
        (
            "PromptDock Update".to_string(),
            format!("Version {version} is available. Install it now?\nThe app will restart automatically when done."),
        )
    };
    let app_handle = app.clone();
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNo)
        .show(move |confirmed| {
            if confirmed {
                tauri::async_runtime::spawn(async move {
                    let _ = install_pending_update(&app_handle).await;
                });
            }
        });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_manager(app.clone());
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "macos")]
            if _window.label() == "manager" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                    api.prevent_close();
                    let _ = _window.hide();
                    set_manager_activation(_window.app_handle(), false);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_prompts,
            save_prompt,
            delete_prompt,
            mark_used,
            copy_text,
            get_settings,
            set_settings,
            hide_main,
            open_manager,
            export_prompts,
            import_prompts,
            check_for_updates,
            install_update
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let conn = init_db(&app_handle);
            app.manage(DbState(Mutex::new(conn)));
            app.manage(PendingUpdate(Mutex::new(None)));

            let settings = get_settings_inner(&app_handle);
            let menu = build_tray_menu(&app_handle, &settings)?;

            #[cfg(target_os = "macos")]
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-iconTemplate@2x.png"
            ))?;
            #[cfg(not(target_os = "macos"))]
            let tray_icon = app.default_window_icon().unwrap().clone();

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(cfg!(target_os = "macos"))
                .menu(&menu)
                .tooltip("PromptDock")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_manager(app.clone()),
                    "call" => toggle_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            set_manager_activation(&app_handle, false);
            register_hotkey(&app_handle, &settings.hotkey)?;
            let _ = apply_autostart(&app_handle, settings.autostart);
            apply_window_preferences(&app_handle, &settings);

            if settings.auto_check_update {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    let Ok(updater) = handle.updater() else {
                        return;
                    };
                    let Ok(Some(update)) = updater.check().await else {
                        return;
                    };
                    let info = UpdateInfo {
                        version: update.version.clone(),
                        body: update.body.clone(),
                    };
                    if let Ok(mut pending) = handle.state::<PendingUpdate>().0.lock() {
                        *pending = Some(update);
                    }
                    prompt_install_update(&handle, &info.version);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn import_document(format: Option<&str>, version: u64) -> serde_json::Value {
        let mut document = serde_json::json!({
            "version": version,
            "prompts": [{
                "id": "test-id",
                "title": "Test prompt",
                "body": "Hello {{name}}",
                "tags": ["test"],
                "folder": "Tests",
                "favorite": false,
                "useCount": 0,
                "lastUsedAt": null,
                "createdAt": 1,
                "updatedAt": 1
            }]
        });
        if let Some(format) = format {
            document["format"] = serde_json::Value::String(format.into());
        }
        document
    }

    #[test]
    fn bundled_defaults_contain_only_the_five_approved_prompts() {
        let prompts = default_prompts();
        let titles: HashSet<_> = prompts.iter().map(|prompt| prompt.title.as_str()).collect();
        let expected = HashSet::from([
            "提示词标准化",
            "Code review",
            "Explain this code",
            "Brainstorm ideas",
            "Cold outreach email",
        ]);
        assert_eq!(prompts.len(), 5);
        assert_eq!(titles, expected);
    }

    #[test]
    fn import_accepts_promptdeck_and_promptdock_v1() {
        assert!(validate_import_document(&import_document(Some("promptdeck"), 1)).is_ok());
        assert!(validate_import_document(&import_document(Some("promptdock"), 1)).is_ok());
    }

    #[test]
    fn import_rejects_missing_unknown_and_unsupported_formats() {
        assert_eq!(
            validate_import_document(&import_document(None, 1)).unwrap_err(),
            "import.missing_format"
        );
        assert_eq!(
            validate_import_document(&import_document(Some("other"), 1)).unwrap_err(),
            "import.unsupported_format"
        );
        assert_eq!(
            validate_import_document(&import_document(Some("promptdeck"), 2)).unwrap_err(),
            "import.unsupported_version"
        );

        let mut invalid_prompt = import_document(Some("promptdeck"), 1);
        invalid_prompt["prompts"][0]
            .as_object_mut()
            .unwrap()
            .remove("body");
        assert_eq!(
            validate_import_document(&invalid_prompt).unwrap_err(),
            "import.invalid_prompt"
        );
    }

    #[test]
    fn old_databases_receive_safe_setting_defaults() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);")
            .unwrap();
        let settings = read_settings(&conn);
        assert_eq!(settings.hotkey, DEFAULT_GLOBAL_HOTKEY);
        assert_eq!(settings.theme, "auto");
        assert_eq!(settings.language, "auto");
        assert!(!settings.autostart);
        assert_eq!(settings.advance_key, "enter");
        assert_eq!(settings.newline_key, "shift+enter");
        assert_eq!(settings.back_key, "escape");
        assert!(!settings.auto_check_update);
    }

    #[test]
    fn key_binding_validation_accepts_modifier_combinations_and_rejects_partial_input() {
        assert!(is_valid_key_binding("enter"));
        assert!(is_valid_key_binding("shift+enter"));
        assert!(is_valid_key_binding("Ctrl+Alt+Space"));
        assert!(is_valid_key_binding("escape"));
        assert!(!is_valid_key_binding(""));
        assert!(!is_valid_key_binding("+"));
        assert!(!is_valid_key_binding("ctrl+shift"));
        assert!(!is_valid_key_binding("ctrl+enter+x"));
    }

    #[test]
    fn hotkey_display_uses_platform_modifier_names() {
        assert_eq!(
            format_hotkey_for_display("cmdorctrl+shift+space", false),
            "Ctrl+Shift+Space"
        );
        assert_eq!(
            format_hotkey_for_display("cmdorctrl+shift+space", true),
            "⇧⌘Space"
        );
        assert_eq!(format_hotkey_for_display("command+alt+k", true), "⌥⌘K");
    }
}
