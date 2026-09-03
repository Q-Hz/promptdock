#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod import_logic;
#[cfg(test)]
mod manager_regression_tests;
mod organization;

use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Mutex;

use organization::Organization;
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

// 所有读取 Prompt 的语句共用同一列顺序，row_to_prompt 依赖这些下标。
pub(crate) const PROMPT_COLUMNS: &str =
    "id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub folder: String,
    pub favorite: bool,
    // 旧版导出文件没有该字段：缺失时按不置顶处理（PRD FR-05）
    #[serde(default)]
    pub pinned: bool,
    pub use_count: i64,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub prompts: Vec<Prompt>,
    pub organization: Organization,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptUpdate {
    pub prompt: Prompt,
    pub organization: Organization,
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
    let mut conn = Connection::open(dir.join("prompts.db")).expect("无法打开数据库");
    initialize_db(&mut conn).expect("数据库初始化失败");
    conn
}

// 建表、旧库迁移、默认数据及顺序初始化必须作为一个整体提交。
fn initialize_db(connection: &mut Connection) -> Result<(), String> {
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]',
            folder TEXT NOT NULL DEFAULT '',
            favorite INTEGER NOT NULL DEFAULT 0,
            pinned INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0,
            last_used_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS organization (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ui_prefs (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    migrate_db(&conn).map_err(|e| e.to_string())?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        for p in default_prompts() {
            insert_prompt(&conn, &p).map_err(|e| e.to_string())?;
        }
    }
    ensure_organization(&conn)?;
    conn.commit().map_err(|e| e.to_string())
}

// 旧库升级必须幂等：只补缺失的列与顺序数据，不改动已有内容、收藏和历史。
fn migrate_db(conn: &Connection) -> rusqlite::Result<()> {
    let has_pinned = conn
        .prepare("SELECT name FROM pragma_table_info('prompts')")?
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|name| name == "pinned");
    if !has_pinned {
        conn.execute(
            "ALTER TABLE prompts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

pub(crate) fn insert_prompt(conn: &Connection, p: &Prompt) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO prompts (id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            p.id,
            p.title,
            p.body,
            serde_json::to_string(&p.tags).unwrap_or_default(),
            p.folder,
            p.favorite as i32,
            p.pinned as i32,
            p.use_count,
            p.last_used_at,
            p.created_at,
            p.updated_at
        ],
    )
    .map(|_| ())
}

pub(crate) fn row_to_prompt(row: &rusqlite::Row) -> rusqlite::Result<Prompt> {
    let tags: String = row.get(3)?;
    Ok(Prompt {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        folder: row.get(4)?,
        favorite: row.get::<_, i32>(5)? != 0,
        pinned: row.get::<_, i32>(6)? != 0,
        use_count: row.get(7)?,
        last_used_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(crate) fn read_prompts(conn: &Connection) -> Result<Vec<Prompt>, String> {
    let mut stmt = conn
        .prepare(&format!("SELECT {PROMPT_COLUMNS} FROM prompts"))
        .map_err(|e| e.to_string())?;
    let list = stmt
        .query_map([], row_to_prompt)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(list)
}

pub(crate) fn load_organization(conn: &Connection) -> Result<Organization, String> {
    let stored: String = conn
        .query_row("SELECT data FROM organization WHERE id = 1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if stored.is_empty() {
        return Ok(Organization::default());
    }
    serde_json::from_str(&stored).map_err(|e| e.to_string())
}

pub(crate) fn store_organization(
    conn: &Connection,
    organization: &Organization,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO organization (id, data) VALUES (1, ?1)",
        [serde_json::to_string(organization).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// 读取时始终与真实数据对齐，因此新文件夹追加到末尾、陈旧 ID 被丢弃，
// 而顺序偏好只在用户明确操作时才写回。
pub(crate) fn read_organization(
    conn: &Connection,
    prompts: &[Prompt],
) -> Result<Organization, String> {
    let mut organization = load_organization(conn)?;
    organization.normalize(prompts);
    Ok(organization)
}

// 顺序初始化只做一次：已存在记录时后续启动不得重排。
fn ensure_organization(conn: &Connection) -> Result<(), String> {
    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM organization", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Ok(());
    }
    let prompts = read_prompts(conn)?;
    let organization = Organization::legacy(&prompts);
    store_organization(conn, &organization)
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
                        pinned: p.get("pinned").and_then(|f| f.as_bool()).unwrap_or(false),
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
fn load_library(state: tauri::State<DbState>) -> Result<Library, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let prompts = read_prompts(&conn)?;
    let organization = read_organization(&conn, &prompts)?;
    Ok(Library {
        prompts,
        organization,
    })
}

#[tauri::command]
fn save_prompt(state: tauri::State<DbState>, prompt: Prompt) -> Result<Prompt, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    save_prompt_impl(&mut conn, prompt)
}

fn save_prompt_impl(connection: &mut Connection, mut prompt: Prompt) -> Result<Prompt, String> {
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    let now = chrono_now();
    // 保存前的归属与置顶状态决定顺序如何变化，必须先读取
    let previous = if prompt.id.is_empty() {
        None
    } else {
        let stored = read_prompt_by_id(&conn, &prompt.id)?;
        // 编辑保存不能覆盖启动器刚更新的使用历史。
        prompt.created_at = stored.created_at;
        prompt.use_count = stored.use_count;
        prompt.last_used_at = stored.last_used_at;
        Some((stored.folder, stored.pinned))
    };
    if prompt.id.is_empty() {
        prompt.id = uuid::Uuid::new_v4().to_string();
        prompt.created_at = now;
    }
    prompt.updated_at = now;
    insert_prompt(&conn, &prompt).map_err(|e| e.to_string())?;

    let prompts = read_prompts(&conn)?;
    let mut organization = load_organization(&conn)?;
    match previous {
        None => organization.add_prompt(&prompt),
        Some((folder, was_pinned)) => {
            if folder != prompt.folder {
                // 编辑器修改归属属于明确的跨文件夹移动，追加到目标末尾（PRD 4.4.3）
                organization.move_prompt(&prompt.id, &folder, &prompt.folder, None);
            }
            if was_pinned != prompt.pinned {
                organization.set_pinned(&prompt.id, prompt.pinned);
            }
        }
    }
    organization.normalize(&prompts);
    store_organization(&conn, &organization)?;
    conn.commit().map_err(|e| e.to_string())?;
    Ok(prompt)
}

#[tauri::command]
fn delete_prompt(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    delete_prompt_impl(&mut conn, &id)
}

fn delete_prompt_impl(connection: &mut Connection, id: &str) -> Result<(), String> {
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    let folder: String = conn
        .query_row("SELECT folder FROM prompts WHERE id=?1", [&id], |r| {
            r.get(0)
        })
        .unwrap_or_default();
    conn.execute("DELETE FROM prompts WHERE id=?1", [&id])
        .map_err(|e| e.to_string())?;
    let prompts = read_prompts(&conn)?;
    let mut organization = load_organization(&conn)?;
    organization.remove_prompt(&id, &folder);
    organization.normalize(&prompts);
    store_organization(&conn, &organization)?;
    conn.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn mark_used(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // 使用记录不得改变任何顺序或归属（PRD 4.4.2）
    conn.execute(
        "UPDATE prompts SET use_count = use_count + 1, last_used_at = ?1 WHERE id = ?2",
        params![chrono_now(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// 目标字段更新：只提交本次组织操作，不顺带写入编辑草稿（PRD 6.1）
#[tauri::command]
fn set_favorite(
    state: tauri::State<DbState>,
    id: String,
    favorite: bool,
) -> Result<Prompt, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prompts SET favorite=?1 WHERE id=?2",
        params![favorite as i32, id],
    )
    .map_err(|e| e.to_string())?;
    read_prompt_by_id(&conn, &id)
}

#[tauri::command]
fn set_pinned(
    state: tauri::State<DbState>,
    id: String,
    pinned: bool,
) -> Result<PromptUpdate, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    set_pinned_impl(&mut conn, &id, pinned)
}

fn set_pinned_impl(
    connection: &mut Connection,
    id: &str,
    pinned: bool,
) -> Result<PromptUpdate, String> {
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prompts SET pinned=?1 WHERE id=?2",
        params![pinned as i32, id],
    )
    .map_err(|e| e.to_string())?;
    let prompts = read_prompts(&conn)?;
    let mut organization = load_organization(&conn)?;
    organization.set_pinned(&id, pinned);
    organization.normalize(&prompts);
    store_organization(&conn, &organization)?;
    let prompt = prompts
        .into_iter()
        .find(|prompt| prompt.id == id)
        .ok_or_else(|| "prompt.not_found".to_string())?;
    conn.commit().map_err(|e| e.to_string())?;
    Ok(PromptUpdate {
        prompt,
        organization,
    })
}

fn read_prompt_by_id(conn: &Connection, id: &str) -> Result<Prompt, String> {
    conn.query_row(
        &format!("SELECT {PROMPT_COLUMNS} FROM prompts WHERE id=?1"),
        [id],
        row_to_prompt,
    )
    .map_err(|_| "prompt.not_found".to_string())
}

fn write_order(
    conn: &Connection,
    expected: &Organization,
    apply: impl FnOnce(&mut Organization),
) -> Result<Organization, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let prompts = read_prompts(&tx)?;
    let mut organization = read_organization(&tx, &prompts)?;
    require_current_organization(&organization, expected)?;
    apply(&mut organization);
    organization.normalize(&prompts);
    store_organization(&tx, &organization)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(organization)
}

#[tauri::command]
fn set_folder_order(
    state: tauri::State<DbState>,
    order: Vec<String>,
    expected: Organization,
) -> Result<Organization, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    write_order(&conn, &expected, |organization| {
        organization.apply_folder_order(&order)
    })
}

#[tauri::command]
fn set_prompt_order(
    state: tauri::State<DbState>,
    folder: String,
    order: Vec<String>,
    expected: Organization,
) -> Result<Organization, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    write_order(&conn, &expected, |organization| {
        organization.apply_prompt_order(&folder, &order)
    })
}

#[tauri::command]
fn set_pinned_order(
    state: tauri::State<DbState>,
    order: Vec<String>,
    expected: Organization,
) -> Result<Organization, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    write_order(&conn, &expected, |organization| {
        organization.apply_pinned_order(&order)
    })
}

// 归属更新、源顺序移除与目标顺序插入在同一事务内完成，失败则全部回滚（PRD 6.2）
fn require_current_organization(
    current: &Organization,
    expected: &Organization,
) -> Result<(), String> {
    if current != expected {
        return Err("organization.stale".into());
    }
    Ok(())
}

fn move_prompt_impl(
    tx: &rusqlite::Transaction,
    id: &str,
    to_folder: &str,
    index: Option<usize>,
    now: i64,
) -> Result<PromptUpdate, String> {
    let current = read_prompt_by_id(tx, id)?;
    let before = read_prompts(tx)?;
    // 未分类始终可选；其它目标必须仍有真实成员，不能复活已经消失的文件夹。
    if !to_folder.is_empty() && !before.iter().any(|p| p.folder == to_folder) {
        return Err("organization.stale".into());
    }
    let target_len = before
        .iter()
        .filter(|p| p.folder == to_folder && p.id != id)
        .count();
    if index.is_some_and(|position| position > target_len) {
        return Err("organization.stale".into());
    }
    tx.execute(
        "UPDATE prompts SET folder=?1, updated_at=?2 WHERE id=?3",
        params![to_folder, now, id],
    )
    .map_err(|e| e.to_string())?;
    let prompts = read_prompts(tx)?;
    let mut organization = load_organization(tx)?;
    organization.move_prompt(id, &current.folder, to_folder, index);
    organization.normalize(&prompts);
    store_organization(tx, &organization)?;
    let prompt = prompts
        .into_iter()
        .find(|prompt| prompt.id == id)
        .ok_or_else(|| "prompt.not_found".to_string())?;
    Ok(PromptUpdate {
        prompt,
        organization,
    })
}

#[tauri::command]
fn move_prompt(
    state: tauri::State<DbState>,
    id: String,
    to_folder: String,
    index: Option<usize>,
    expected: Organization,
) -> Result<PromptUpdate, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    move_prompt_checked(&mut conn, &id, &to_folder, index, &expected)
}

fn move_prompt_checked(
    conn: &mut Connection,
    id: &str,
    to_folder: &str,
    index: Option<usize>,
    expected: &Organization,
) -> Result<PromptUpdate, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let current = read_organization(&tx, &read_prompts(&tx)?)?;
    require_current_organization(&current, expected)?;
    let update = move_prompt_impl(&tx, id, to_folder, index, chrono_now())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(update)
}

// 界面偏好（尺寸、折叠状态）只保存在本地，不进入 Prompt 的 JSON 导出
#[tauri::command]
fn get_ui_prefs(state: tauri::State<DbState>, key: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(conn
        .query_row("SELECT v FROM ui_prefs WHERE k=?1", [&key], |r| r.get(0))
        .unwrap_or_default())
}

#[tauri::command]
fn set_ui_prefs(state: tauri::State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO ui_prefs (k,v) VALUES (?1,?2)",
        params![key, value],
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
            .disable_drag_drop_handler()
            .theme(window_theme(&settings.theme))
            .inner_size(1080.0, 720.0)
            .min_inner_size(860.0, 560.0)
            .build();
        }
    }
}

#[tauri::command]
fn export_prompts(state: tauri::State<DbState>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let prompts = read_prompts(&conn)?;
    let organization = read_organization(&conn, &prompts)?.for_export(&prompts);
    let doc = serde_json::json!({
        "format": "promptdeck",
        "version": 1,
        "exportedAt": chrono_now(),
        "prompts": prompts,
        "organization": organization,
    });
    fs::write(
        &path,
        serde_json::to_string_pretty(&doc).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())
}

pub(crate) fn validate_import_document(
    data: &serde_json::Value,
) -> Result<(Vec<Prompt>, Option<organization::RawOrganization>), String> {
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
    // 字段缺失按不置顶处理；显式的 null / 字符串 / 数字属于无效字段，必须在写入前终止
    for value in prompt_values {
        if let Some(pinned) = value.get("pinned") {
            if !pinned.is_boolean() {
                return Err("import.invalid_pinned".into());
            }
        }
    }
    let prompts: Vec<Prompt> = prompt_values
        .iter()
        .cloned()
        .map(serde_json::from_value)
        .collect::<Result<_, _>>()
        .map_err(|_| "import.invalid_prompt".to_string())?;
    if prompts.is_empty() {
        return Err("import.no_prompts".into());
    }
    Ok((
        prompts,
        organization::parse_raw_organization(data.get("organization")),
    ))
}

#[tauri::command]
fn import_prompts(
    state: tauri::State<DbState>,
    path: String,
    replace: bool,
) -> Result<serde_json::Value, String> {
    // 追加导入已迁移到 precheck_import / commit_import，本命令仅保留覆盖模式（PRD 8.6）
    if !replace {
        return Err("import.append_removed".into());
    }
    let file = import_logic::read_import_file(&path)?;
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM prompts", [])
        .map_err(|e| e.to_string())?;
    for p in &file.prompts {
        insert_prompt(&tx, p).map_err(|e| e.to_string())?;
    }
    // 覆盖导入整体采用文件内容与规范化后的顺序，与提示词记录同一事务提交（PRD 5.4.8）
    let organization = Organization::from_import(&file.prompts, file.organization.as_ref());
    store_organization(&tx, &organization)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "count": file.prompts.len(),
        "organizationAdjusted": file.organization.as_ref().is_some_and(|raw| raw.was_adjusted(&file.prompts))
    }))
}

#[tauri::command]
fn precheck_import(
    state: tauri::State<DbState>,
    path: String,
) -> Result<import_logic::ImportPrecheck, String> {
    let file = import_logic::read_import_file(&path)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let locals = read_prompts(&conn)?;
    Ok(import_logic::precheck(
        &file.prompts,
        &locals,
        file.organization.as_ref(),
    ))
}

#[tauri::command]
fn precheck_import_snapshot(
    state: tauri::State<DbState>,
    prompts: Vec<Prompt>,
    organization: Option<organization::RawOrganization>,
) -> Result<import_logic::ImportPrecheck, String> {
    // stale 后继续使用首次打开文件时的内存快照，不静默重读磁盘文件（PRD 8.4）。
    import_logic::validate_import_snapshot(&prompts)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let locals = read_prompts(&conn)?;
    Ok(import_logic::precheck(
        &prompts,
        &locals,
        organization.as_ref(),
    ))
}

#[tauri::command]
fn commit_import(
    state: tauri::State<DbState>,
    precheck: import_logic::ImportPrecheck,
    decisions: Vec<import_logic::ImportDecision>,
) -> Result<import_logic::ImportResult, String> {
    // 前端提交完整预检查快照；后端在事务内重建当前快照并逐项核对候选集合和业务字段。
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let result = import_logic::commit_import_impl(&tx, &precheck, &decisions, chrono_now())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

pub struct PendingUpdate(pub Mutex<Option<tauri_plugin_updater::Update>>);

// 关闭/退出握手：prevent_close 后在后台等待前端明确应答，绝不超时放行或丢弃草稿。
pub struct CloseGate(pub Mutex<Option<Sender<bool>>>);
pub struct QuitGate(pub Mutex<Option<Sender<bool>>>);
pub struct ManagerGuardReady(pub AtomicBool);

fn finish_manager_close(app: &AppHandle, allow: bool) {
    if !allow {
        if let Some(win) = app.get_webview_window("manager") {
            let _ = win.set_focus();
        }
        return;
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(win) = app.get_webview_window("manager") {
            let _ = win.hide();
        }
        set_manager_activation(app, false);
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.state::<ManagerGuardReady>()
            .0
            .store(false, Ordering::SeqCst);
        if let Some(win) = app.get_webview_window("manager") {
            let _ = win.destroy();
        }
    }
}

fn request_manager_close(app: AppHandle) {
    if !app.state::<ManagerGuardReady>().0.load(Ordering::SeqCst) {
        finish_manager_close(&app, false);
        return;
    }
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    {
        let gate = app.state::<CloseGate>();
        let Ok(mut slot) = gate.0.lock() else {
            finish_manager_close(&app, false);
            return;
        };
        if slot.is_some() {
            // 已有握手在等待，忽略重复关闭请求
            return;
        }
        *slot = Some(tx);
    }
    if app.emit("manager-close-requested", ()).is_err() {
        if let Ok(mut slot) = app.state::<CloseGate>().0.lock() {
            *slot = None;
        }
        finish_manager_close(&app, false);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // 后台等待不会阻塞 UI；只有用户明确答复才允许关闭。
        let allow = rx.recv().unwrap_or(false);
        if let Ok(mut slot) = app.state::<CloseGate>().0.lock() {
            *slot = None;
        }
        finish_manager_close(&app, allow);
    });
}

fn request_app_quit(app: AppHandle) {
    // Windows 关闭管理器后窗口会被销毁；窗口不存在就不可能仍持有编辑草稿。
    if app.get_webview_window("manager").is_none() {
        app.exit(0);
        return;
    }
    if !app.state::<ManagerGuardReady>().0.load(Ordering::SeqCst) {
        open_manager(app);
        return;
    }
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    {
        let gate = app.state::<QuitGate>();
        let Ok(mut slot) = gate.0.lock() else {
            return;
        };
        if slot.is_some() {
            return;
        }
        *slot = Some(tx);
    }
    // 显示并聚焦管理器，让用户能看到未保存确认（PRD 9.7）
    open_manager(app.clone());
    if app.emit("tray-quit-requested", ()).is_err() {
        if let Ok(mut slot) = app.state::<QuitGate>().0.lock() {
            *slot = None;
        }
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let allow = rx.recv().unwrap_or(false);
        if let Ok(mut slot) = app.state::<QuitGate>().0.lock() {
            *slot = None;
        }
        if allow {
            app.exit(0);
        }
    });
}

#[tauri::command]
fn resolve_close(app: AppHandle, allow: bool) -> Result<(), String> {
    let tx = app
        .state::<CloseGate>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .cloned();
    if let Some(tx) = tx {
        let _ = tx.send(allow);
    }
    Ok(())
}

#[tauri::command]
fn resolve_quit(app: AppHandle, allow: bool) -> Result<(), String> {
    let tx = app
        .state::<QuitGate>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .cloned();
    if let Some(tx) = tx {
        let _ = tx.send(allow);
    }
    Ok(())
}

#[tauri::command]
fn set_manager_guard_ready(app: AppHandle, ready: bool) {
    app.state::<ManagerGuardReady>()
        .0
        .store(ready, Ordering::SeqCst);
}

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
        .on_window_event(|window, event| {
            // 所有平台统一拦截管理器关闭，交由前端决定（未保存保护 / 取消导入，PRD 9.7）
            if window.label() == "manager" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    request_manager_close(window.app_handle().clone());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            save_prompt,
            delete_prompt,
            mark_used,
            set_favorite,
            set_pinned,
            set_folder_order,
            set_prompt_order,
            set_pinned_order,
            move_prompt,
            get_ui_prefs,
            set_ui_prefs,
            copy_text,
            get_settings,
            set_settings,
            hide_main,
            open_manager,
            export_prompts,
            import_prompts,
            precheck_import,
            precheck_import_snapshot,
            commit_import,
            resolve_close,
            resolve_quit,
            set_manager_guard_ready,
            check_for_updates,
            install_update
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let conn = init_db(&app_handle);
            app.manage(DbState(Mutex::new(conn)));
            app.manage(PendingUpdate(Mutex::new(None)));
            app.manage(CloseGate(Mutex::new(None)));
            app.manage(QuitGate(Mutex::new(None)));
            app.manage(ManagerGuardReady(AtomicBool::new(false)));

            let settings = get_settings_inner(&app_handle);
            let menu = build_tray_menu(&app_handle, &settings)?;

            #[cfg(target_os = "macos")]
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-iconTemplate@2x.png"
            ))?;
            #[cfg(target_os = "windows")]
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-icon-windows-64x64.png"
            ))?;
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let tray_icon = app.default_window_icon().unwrap().clone();

            TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(cfg!(target_os = "macos"))
                .menu(&menu)
                .tooltip("PromptDock")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_manager(app.clone()),
                    "call" => toggle_main(app),
                    "quit" => request_app_quit(app.clone()),
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
    fn bundled_defaults_contain_the_twelve_approved_prompts() {
        let prompts = default_prompts();
        let titles: HashSet<_> = prompts.iter().map(|prompt| prompt.title.as_str()).collect();
        let expected = HashSet::from([
            "Summarize in bullet points",
            "Rewrite — change tone",
            "Code review",
            "Explain this code",
            "Debug this error",
            "Turn notes into an email",
            "Reply to this email",
            "Brainstorm ideas",
            "Break down a project",
            "Cold outreach email",
            "Prompt Standardization",
            "提示词标准化",
        ]);
        assert_eq!(prompts.len(), 12);
        assert_eq!(titles, expected);
    }

    #[test]
    fn import_accepts_promptdeck_and_promptdock_v1() {
        assert!(validate_import_document(&import_document(Some("promptdeck"), 1)).is_ok());
        assert!(validate_import_document(&import_document(Some("promptdock"), 1)).is_ok());
    }

    #[test]
    fn import_normalizes_a_missing_pinned_field_to_false() {
        let (prompts, organization) =
            validate_import_document(&import_document(Some("promptdeck"), 1)).unwrap();
        assert!(!prompts[0].pinned);
        assert!(organization.is_none());
    }

    #[test]
    fn import_keeps_explicit_pinned_without_touching_favorite() {
        let mut document = import_document(Some("promptdeck"), 1);
        document["prompts"][0]["pinned"] = serde_json::Value::Bool(true);
        document["prompts"][0]["favorite"] = serde_json::Value::Bool(false);
        let (prompts, _) = validate_import_document(&document).unwrap();
        assert!(prompts[0].pinned);
        assert!(!prompts[0].favorite);
    }

    #[test]
    fn import_rejects_invalid_pinned_types_before_writing() {
        for invalid in [
            serde_json::Value::Null,
            serde_json::Value::String("true".into()),
            serde_json::json!(1),
        ] {
            let mut document = import_document(Some("promptdeck"), 1);
            document["prompts"][0]["pinned"] = invalid;
            assert_eq!(
                validate_import_document(&document).unwrap_err(),
                "import.invalid_pinned"
            );
        }
    }

    #[test]
    fn import_reads_optional_organization_metadata_and_degrades_per_field() {
        let mut document = import_document(Some("promptdeck"), 1);
        document["organization"] = serde_json::json!({
            "folderOrder": ["Tests"],
            "promptOrderByFolder": "not-a-map",
        });
        let (_, organization) = validate_import_document(&document).unwrap();
        let raw = organization.unwrap();
        assert_eq!(raw.folder_order.unwrap(), vec!["Tests".to_string()]);
        assert!(raw.prompt_order_by_folder.is_none());
        assert!(raw.pinned_order.is_none());
    }

    #[test]
    fn migration_adds_the_pinned_column_once_and_preserves_existing_rows() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE prompts (
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
            INSERT INTO prompts (id,title,body,tags,folder,favorite,use_count,last_used_at,created_at,updated_at)
            VALUES ('legacy','Old','body','[]','A',1,4,7,3,5);",
        )
        .unwrap();

        migrate_db(&conn).unwrap();
        // 幂等：重复迁移不报错也不改数据
        migrate_db(&conn).unwrap();

        let prompt = read_prompt_by_id(&conn, "legacy").unwrap();
        assert!(!prompt.pinned);
        assert!(prompt.favorite);
        assert_eq!(prompt.use_count, 4);
        assert_eq!(prompt.last_used_at, Some(7));
        assert_eq!((prompt.created_at, prompt.updated_at), (3, 5));
    }

    #[test]
    fn organization_is_initialized_once_and_never_re_sorted_on_later_starts() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]', folder TEXT NOT NULL DEFAULT '',
                favorite INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
                use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE TABLE organization (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);",
        )
        .unwrap();
        // 旧排序规则下 B 在前：收藏优先，其后按最近使用
        conn.execute(
            "INSERT INTO prompts (id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at)
             VALUES ('a','A','','','Folder A',0,0,0,NULL,1,1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO prompts (id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at)
             VALUES ('b','B','','','Folder B',1,0,0,99,1,1)",
            [],
        )
        .unwrap();

        ensure_organization(&conn).unwrap();
        let stored = load_organization(&conn).unwrap();
        assert_eq!(stored.folder_order, vec!["Folder B", "Folder A"]);

        // 用户手动调整后的顺序不能被后续启动重排
        let mut customized = stored.clone();
        customized.folder_order = vec!["Folder A".into(), "Folder B".into()];
        store_organization(&conn, &customized).unwrap();
        ensure_organization(&conn).unwrap();
        assert_eq!(
            load_organization(&conn).unwrap().folder_order,
            vec!["Folder A", "Folder B"]
        );
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

    fn library_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE prompts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                folder TEXT NOT NULL DEFAULT '',
                favorite INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                use_count INTEGER NOT NULL DEFAULT 0,
                last_used_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE organization (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);",
        )
        .unwrap();
        conn
    }

    fn seed_prompt(conn: &Connection, id: &str, folder: &str, pinned: bool) {
        insert_prompt(
            conn,
            &Prompt {
                id: id.into(),
                title: id.into(),
                body: String::new(),
                tags: vec![],
                folder: folder.into(),
                favorite: false,
                pinned,
                use_count: 0,
                last_used_at: None,
                created_at: 1,
                updated_at: 1,
            },
        )
        .unwrap();
    }

    #[test]
    fn move_prompt_updates_membership_counts_and_keeps_the_pinned_shortcut() {
        let mut conn = library_db();
        seed_prompt(&conn, "a1", "Source", false);
        seed_prompt(&conn, "a2", "Source", true);
        seed_prompt(&conn, "b1", "Target", false);
        let mut organization = Organization::default();
        organization.folder_order = vec!["Source".into(), "Target".into()];
        organization.prompt_order_by_folder = [
            (
                "Source".to_string(),
                vec!["a1".to_string(), "a2".to_string()],
            ),
            ("Target".to_string(), vec!["b1".to_string()]),
        ]
        .into_iter()
        .collect();
        organization.pinned_order = vec!["a2".into()];
        store_organization(&conn, &organization).unwrap();

        let tx = conn.transaction().unwrap();
        let update = move_prompt_impl(&tx, "a2", "Target", Some(0), 500).unwrap();
        tx.commit().unwrap();

        // 归属改为目标文件夹的实际名称，置顶状态与使用记录保持不变
        assert_eq!(update.prompt.folder, "Target");
        assert!(update.prompt.pinned);
        assert_eq!(update.prompt.updated_at, 500);
        let ids = |folder: &str| -> Vec<String> {
            update.organization.prompt_order_by_folder[folder].clone()
        };
        assert_eq!(ids("Source"), vec!["a1"]);
        assert_eq!(ids("Target"), vec!["a2", "b1"]);
        // 置顶区顺序不受跨文件夹移动影响
        assert_eq!(update.organization.pinned_order, vec!["a2"]);
    }

    #[test]
    fn move_prompt_rolls_back_membership_and_order_when_a_write_fails() {
        let mut conn = library_db();
        seed_prompt(&conn, "a1", "Source", false);
        seed_prompt(&conn, "b1", "Target", false);
        let mut organization = Organization::default();
        organization.folder_order = vec!["Source".into(), "Target".into()];
        organization.prompt_order_by_folder = [
            ("Source".to_string(), vec!["a1".to_string()]),
            ("Target".to_string(), vec!["b1".to_string()]),
        ]
        .into_iter()
        .collect();
        store_organization(&conn, &organization).unwrap();
        // 注入故障：归属更新成功后，顺序写入失败，回滚必须撤销归属变更
        conn.execute_batch(
            "CREATE TRIGGER fail_order_write BEFORE INSERT ON organization
             BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
        )
        .unwrap();

        {
            let tx = conn.transaction().unwrap();
            let error = move_prompt_impl(&tx, "a1", "Target", None, 500).unwrap_err();
            assert!(error.contains("injected failure"));
            // 与命令的错误路径一致：丢弃事务即回滚全部写入
        }

        let prompt = read_prompt_by_id(&conn, "a1").unwrap();
        assert_eq!(prompt.folder, "Source");
        let stored = load_organization(&conn).unwrap();
        assert_eq!(stored.prompt_order_by_folder["Source"], vec!["a1"]);
        assert_eq!(stored.prompt_order_by_folder["Target"], vec!["b1"]);
    }

    #[test]
    fn move_prompt_reports_a_missing_target_instead_of_writing_half_a_change() {
        let mut conn = library_db();
        seed_prompt(&conn, "a1", "Source", false);
        let tx = conn.transaction().unwrap();
        assert_eq!(
            move_prompt_impl(&tx, "ghost", "Target", None, 500).unwrap_err(),
            "prompt.not_found"
        );
    }
}
