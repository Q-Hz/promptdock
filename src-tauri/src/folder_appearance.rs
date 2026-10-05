use std::collections::BTreeMap;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PINNED: &str = "\0pinned";
pub const COLORS: [&str; 8] = [
    "default", "#ff3b3b", "#ff681b", "#ffbf00", "#00b94f", "#0085ff", "#9146ff", "#ff59ae",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Appearance {
    pub icon: String,
    pub color: String,
}
pub type Appearances = BTreeMap<String, Appearance>;

pub fn normalize(value: &Value, key: &str) -> Appearance {
    let catalog: Vec<Value> = serde_json::from_str(include_str!("../../src/lib/folder-icons.json"))
        .expect("bundled icon catalog");
    let fallback = if key == PINNED { "pin" } else { "folder" };
    let icon = value
        .get("icon")
        .and_then(Value::as_str)
        .unwrap_or(fallback);
    let icon = if catalog.iter().any(|entry| entry["id"] == icon) {
        icon
    } else {
        fallback
    };
    let color = value
        .get("color")
        .and_then(Value::as_str)
        .unwrap_or("default");
    Appearance {
        icon: icon.into(),
        color: if COLORS.contains(&color) {
            color
        } else {
            "default"
        }
        .into(),
    }
}

pub fn parse(value: Option<&Value>) -> Option<Appearances> {
    value.map(|value| {
        value
            .as_object()
            .map(|entries| {
                entries
                    .iter()
                    .map(|(key, value)| (key.clone(), normalize(value, key)))
                    .collect()
            })
            .unwrap_or_default()
    })
}

pub fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS folder_appearance (name TEXT PRIMARY KEY, icon TEXT NOT NULL, color TEXT NOT NULL);")
        .map_err(|e| e.to_string())
}

pub fn read(conn: &Connection) -> Result<Appearances, String> {
    if !crate::table_exists(conn, "folder_appearance").map_err(|e| e.to_string())? {
        return Ok(Appearances::new());
    }
    let mut stmt = conn
        .prepare("SELECT name, icon, color FROM folder_appearance")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                Appearance {
                    icon: row.get(1)?,
                    color: row.get(2)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Appearances::new();
    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        result.insert(
            key.clone(),
            normalize(&serde_json::to_value(value).unwrap(), &key),
        );
    }
    Ok(result)
}

pub fn write(conn: &Connection, key: &str, value: &Appearance) -> Result<(), String> {
    init(conn)?;
    let value = normalize(
        &serde_json::to_value(value).map_err(|e| e.to_string())?,
        key,
    );
    conn.execute("INSERT INTO folder_appearance(name,icon,color) VALUES (?1,?2,?3) ON CONFLICT(name) DO UPDATE SET icon=excluded.icon,color=excluded.color",
        params![key, value.icon, value.color]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove(conn: &Connection, key: &str) -> Result<(), String> {
    if crate::table_exists(conn, "folder_appearance").map_err(|e| e.to_string())? {
        conn.execute("DELETE FROM folder_appearance WHERE name=?1", [key])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn rename(conn: &Connection, old: &str, new: &str) -> Result<(), String> {
    let value = read(conn)?.remove(old);
    remove(conn, new)?;
    remove(conn, old)?;
    if let Some(value) = value {
        write(conn, new, &value)?;
    }
    Ok(())
}

// Only decorate existing folders: metadata must never create phantom folders.
pub fn merge(conn: &Connection, imported: Option<&Appearances>) -> Result<(), String> {
    let Some(imported) = imported else {
        return Ok(());
    };
    let folders = crate::read_folders(conn)?;
    for (key, value) in imported {
        if key.is_empty() || key == PINNED || folders.contains(key) {
            write(conn, key, value)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn invalid_values_fall_back_and_catalog_matches_palette() {
        assert_eq!(
            normalize(&json!({"icon":"unknown","color":"url(x)"}), PINNED),
            Appearance {
                icon: "pin".into(),
                color: "default".into()
            }
        );
        assert!(parse(None).is_none());
        assert_eq!(
            parse(Some(&json!({"A":{"icon":"book","color":"#9146ff"}}))).unwrap()["A"].icon,
            "book"
        );
    }

    #[test]
    fn metadata_survives_rename_and_old_import_but_not_delete() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE folders(name TEXT PRIMARY KEY); INSERT INTO folders VALUES ('A');",
        )
        .unwrap();
        assert!(read(&conn).unwrap().is_empty());
        let appearance = normalize(&json!({"icon":"book","color":"#9146ff"}), "A");
        write(&conn, "A", &appearance).unwrap();
        merge(&conn, None).unwrap();
        assert_eq!(read(&conn).unwrap()["A"], appearance);
        let tx = conn.transaction().unwrap();
        rename(&tx, "A", "B").unwrap();
        tx.rollback().unwrap();
        assert_eq!(read(&conn).unwrap()["A"], appearance);
        rename(&conn, "A", "B").unwrap();
        assert_eq!(read(&conn).unwrap()["B"], appearance);
        remove(&conn, "B").unwrap();
        assert!(read(&conn).unwrap().is_empty());
    }

    #[test]
    fn new_metadata_overrides_only_existing_and_system_sections() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE folders(name TEXT PRIMARY KEY); INSERT INTO folders VALUES ('A');",
        )
        .unwrap();
        let values = parse(Some(&json!({"A":{"icon":"book"},"ghost":{"icon":"star"},"":{"icon":"heart"},"\u{0000}pinned":{"icon":"code"}}))).unwrap();
        merge(&conn, Some(&values)).unwrap();
        let stored = read(&conn).unwrap();
        assert_eq!(stored.len(), 3);
        assert_eq!(stored["A"].icon, "book");
        assert_eq!(stored[PINNED].icon, "code");
        let roundtrip = parse(Some(&serde_json::to_value(&stored).unwrap())).unwrap();
        assert_eq!(stored, roundtrip);
    }
}
