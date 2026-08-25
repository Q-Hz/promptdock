use std::fs;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager,
    webview::WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

pub struct DbState(pub Mutex<Connection>);

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub autostart: bool,
    pub theme: String,
}

fn init_db(app: &AppHandle) -> Connection {
    let dir = app
        .path()
        .app_data_dir()
        .expect("无法获取数据目录");
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
        );",
    )
    .expect("建表失败");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 0 {
        for p in default_prompts() {
            insert_prompt(&conn, &p);
        }
    }
    conn
}

fn insert_prompt(conn: &Connection, p: &Prompt) {
    let _ = conn.execute(
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
    );
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
                        body: p.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string(),
                        tags: p
                            .get("tags")
                            .and_then(|t| t.as_array())
                            .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
                            .unwrap_or_default(),
                        folder: p.get("folder").and_then(|f| f.as_str()).unwrap_or("").to_string(),
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
        .filter_map(|r| r.ok())
        .collect();
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
            .query_row("SELECT created_at FROM prompts WHERE id=?1", [&prompt.id], |r| r.get(0))
            .unwrap_or(now);
    }
    prompt.updated_at = now;
    insert_prompt(&conn, &prompt);
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
    let get = |k: &str| -> String {
        conn.query_row("SELECT v FROM settings WHERE k=?1", [k], |r| r.get(0))
            .unwrap_or_default()
    };
    Ok(Settings {
        hotkey: if get("hotkey").is_empty() { "ctrl+shift+space".into() } else { get("hotkey") },
        autostart: get("autostart") == "1",
        theme: {
            let t = get("theme");
            if t.is_empty() { "auto".into() } else { t }
        },
    })
}

#[tauri::command]
fn set_settings(app: AppHandle, state: tauri::State<DbState>, settings: Settings) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);")
            .map_err(|e| e.to_string())?;
        for (k, v) in [("hotkey", settings.hotkey.clone()), ("autostart", if settings.autostart { "1" } else { "0" }.into()), ("theme", settings.theme.clone())] {
            let _ = conn.execute("INSERT OR REPLACE INTO settings (k,v) VALUES (?1,?2)", params![k, v]);
        }
    }
    apply_hotkey(&app, &settings.hotkey)?;
    apply_autostart(&app, settings.autostart);
    Ok(())
}

fn apply_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let gs = app.global_shortcut();
    let current = get_settings_inner(app);
    if !current.hotkey.is_empty() {
        if let Ok(old) = Shortcut::try_from(current.hotkey.as_str()) {
            let _ = gs.unregister(old);
        }
    }
    let sc = Shortcut::try_from(hotkey).map_err(|e| e.to_string())?;
    gs.on_shortcut(sc, |app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            toggle_main(app);
        }
    })
    .map_err(|e| e.to_string())
}

fn get_settings_inner(app: &AppHandle) -> Settings {
    app.state::<DbState>()
        .0
        .lock()
        .ok()
        .and_then(|conn| {
            let get = |k: &str| -> String {
                conn.query_row("SELECT v FROM settings WHERE k=?1", [k], |r| r.get(0))
                    .unwrap_or_default()
            };
            Ok(Settings {
                hotkey: if get("hotkey").is_empty() { "ctrl+shift+space".into() } else { get("hotkey") },
                autostart: get("autostart") == "1",
                theme: {
                    let t = get("theme");
                    if t.is_empty() { "auto".into() } else { t }
                },
            })
        })
        .unwrap_or(Settings { hotkey: "ctrl+shift+space".into(), autostart: false, theme: "auto".into() })
}

fn apply_autostart(app: &AppHandle, enable: bool) {
    use tauri_plugin_autostart::{AutoLaunchManager, MacosLauncher};
    let manager = app.state::<AutoLaunchManager>();
    let _ = if enable { manager.enable() } else { manager.disable() };
}

fn toggle_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            if let Ok(monitor) = win.current_monitor() {
                if let Some(m) = monitor {
                    let _ = win.set_position(tauri::PhysicalPosition::new(
                        m.position().x + (m.size().width - win.outer_size().unwrap_or_default().width) / 2,
                        m.position().y + (m.size().height - win.outer_size().unwrap_or_default().height) / 3,
                    ));
                }
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
            .title("PromptDock 管理器")
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
    fs::write(&path, serde_json::to_string_pretty(&doc).unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_prompts(state: tauri::State<DbState>, path: String, replace: bool) -> Result<usize, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let prompts = prompts_from_json(&data);
    if prompts.is_empty() {
        return Err("文件中没有可导入的 Prompt".into());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if replace {
        conn.execute("DELETE FROM prompts", []).map_err(|e| e.to_string())?;
    }
    for p in &prompts {
        insert_prompt(&conn, p);
    }
    Ok(prompts.len())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            import_prompts
        ])
        .setup(|app| {
            let conn = init_db(app);
            app.manage(DbState(Mutex::new(conn)));

            let open = MenuItem::with_id(app, "open", "打开 Prompt 管理", true, None::<&str>)?;
            let call = MenuItem::with_id(app, "call", "调用 Prompt (Ctrl+Shift+Space)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &call, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("PromptDock")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_manager(app.clone()),
                    "call" => toggle_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            let settings = get_settings_inner(app);
            apply_hotkey(app, &settings.hotkey)?;
            apply_autostart(app, settings.autostart);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
