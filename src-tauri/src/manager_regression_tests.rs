use super::*;

fn fixture() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize_db(&mut conn).unwrap();
    conn.execute("DELETE FROM prompts", []).unwrap();
    conn.execute("DELETE FROM folders", []).unwrap();
    for (id, folder) in [("a1", "A"), ("a2", "A"), ("b1", "B")] {
        insert_prompt(
            &conn,
            &Prompt {
                id: id.into(),
                title: id.into(),
                body: "original".into(),
                tags: vec!["tag".into()],
                folder: folder.into(),
                favorite: true,
                pinned: false,
                use_count: 9,
                last_used_at: Some(18),
                created_at: 1,
                updated_at: 2,
            },
        )
        .unwrap();
    }
    conn.execute("INSERT INTO folders(name) VALUES ('A'), ('B')", [])
        .unwrap();
    let organization = Organization::from_import(&read_prompts(&conn).unwrap(), None);
    store_organization(&conn, &organization).unwrap();
    conn
}

fn snapshot(conn: &Connection) -> serde_json::Value {
    let mut prompts = read_prompts(conn).unwrap();
    prompts.sort_by(|a, b| a.id.cmp(&b.id));
    serde_json::json!({
        "prompts": prompts,
        "folders": read_folders(conn).unwrap(),
        "organization": load_organization(conn).unwrap()
    })
}

fn fail_order_writes(conn: &Connection) {
    conn.execute_batch(
        "CREATE TRIGGER fail_order BEFORE INSERT ON organization
        BEGIN SELECT RAISE(ABORT, 'injected order failure'); END;",
    )
    .unwrap();
}

#[test]
fn save_delete_and_pin_roll_back_every_field_on_order_failure() {
    for operation in ["save", "new", "delete", "pin"] {
        let mut conn = fixture();
        let before = snapshot(&conn);
        fail_order_writes(&conn);
        let mut p = read_prompt_by_id(&conn, "a1").unwrap();
        let result = match operation {
            "save" => {
                p.body = "changed".into();
                p.folder = "B".into();
                p.pinned = true;
                save_prompt_impl(&mut conn, p).map(|_| ())
            }
            "new" => {
                p.id.clear();
                save_prompt_impl(&mut conn, p).map(|_| ())
            }
            "delete" => delete_prompt_impl(&mut conn, "a1"),
            _ => set_pinned_impl(&mut conn, "a1", true).map(|_| ()),
        };
        assert!(
            result.unwrap_err().contains("injected order failure"),
            "{operation}"
        );
        assert_eq!(snapshot(&conn), before, "{operation} left a partial write");
    }
}

#[test]
fn save_preserves_recent_usage_and_deleted_records_cannot_be_resurrected() {
    let mut conn = fixture();
    let mut draft = read_prompt_by_id(&conn, "a1").unwrap();
    conn.execute(
        "UPDATE prompts SET use_count=10,last_used_at=99 WHERE id='a1'",
        [],
    )
    .unwrap();
    draft.body = "edited".into();
    let saved = save_prompt_impl(&mut conn, draft.clone()).unwrap();
    assert_eq!((saved.use_count, saved.last_used_at), (10, Some(99)));
    delete_prompt_impl(&mut conn, "a1").unwrap();
    assert_eq!(
        save_prompt_impl(&mut conn, draft).unwrap_err(),
        "prompt.not_found"
    );
}

#[test]
fn stale_order_cannot_overwrite_a_newer_order_or_new_membership() {
    let mut conn = fixture();
    let expected = load_organization(&conn).unwrap();
    let next = write_order(&conn, &expected, |org| {
        org.apply_prompt_order("A", &["a2".into(), "a1".into()])
    })
    .unwrap();
    let before = snapshot(&conn);
    assert_eq!(
        write_order(&conn, &expected, |org| org
            .apply_folder_order(&["B".into(), "A".into()]))
        .unwrap_err(),
        "organization.stale"
    );
    assert_eq!(snapshot(&conn), before);
    delete_prompt_impl(&mut conn, "a2").unwrap();
    assert_eq!(
        write_order(&conn, &next, |_| {}).unwrap_err(),
        "organization.stale"
    );
}

#[test]
fn move_rejects_removed_destination_and_invalid_anchor_index_but_allows_uncategorized() {
    let mut conn = fixture();
    delete_prompt_impl(&mut conn, "b1").unwrap();
    conn.execute("DELETE FROM folders WHERE name='B'", [])
        .unwrap();
    let before = snapshot(&conn);
    {
        let tx = conn.transaction().unwrap();
        assert_eq!(
            move_prompt_impl(&tx, "a1", "B", None, 500).unwrap_err(),
            "organization.stale"
        );
        assert_eq!(
            move_prompt_impl(&tx, "a1", "A", Some(99), 500).unwrap_err(),
            "organization.stale"
        );
    }
    assert_eq!(snapshot(&conn), before);
    let tx = conn.transaction().unwrap();
    let moved = move_prompt_impl(&tx, "a1", "", None, 500).unwrap();
    tx.commit().unwrap();
    assert_eq!(moved.prompt.folder, "");
    assert_eq!(
        (moved.prompt.use_count, moved.prompt.last_used_at),
        (9, Some(18))
    );
}

#[test]
fn move_rejects_changes_to_source_and_target_since_the_drag_started() {
    let mut conn = fixture();
    let expected = load_organization(&conn).unwrap();
    move_prompt_checked(&mut conn, "a1", "B", None, &expected).unwrap();
    let before = snapshot(&conn);
    // Both a stale source and a stale target membership must reject the entire move.
    for id in ["a1", "a2"] {
        assert_eq!(
            move_prompt_checked(&mut conn, id, "B", Some(0), &expected).unwrap_err(),
            "organization.stale"
        );
        assert_eq!(snapshot(&conn), before);
    }
}

#[test]
fn folder_names_are_trimmed_case_sensitive_and_strictly_validated() {
    let mut conn = fixture();
    let expected = read_organization(&conn, &read_prompts(&conn).unwrap()).unwrap();
    let created = create_folder_impl(&mut conn, "  Notes\u{3000}", &expected).unwrap();
    assert_eq!(created.folder, "Notes");
    let created = create_folder_impl(&mut conn, "notes", &created.organization).unwrap();
    assert_eq!(created.folder, "notes");
    assert_eq!(
        create_folder_impl(&mut conn, "Notes", &created.organization).unwrap_err(),
        "folder.duplicate"
    );
    assert_eq!(
        create_folder_impl(&mut conn, "A\tB", &created.organization).unwrap_err(),
        "folder.control_character"
    );
    assert_eq!(
        create_folder_impl(&mut conn, &"😀".repeat(51), &created.organization).unwrap_err(),
        "folder.too_long"
    );
}

#[test]
fn rename_and_delete_folder_update_members_and_order_atomically() {
    let mut conn = fixture();
    insert_prompt(
        &conn,
        &Prompt {
            id: "u1".into(),
            title: "u1".into(),
            body: String::new(),
            tags: vec![],
            folder: String::new(),
            favorite: false,
            pinned: false,
            use_count: 0,
            last_used_at: None,
            created_at: 1,
            updated_at: 1,
        },
    )
    .unwrap();
    let mut organization = read_organization(&conn, &read_prompts(&conn).unwrap()).unwrap();
    organization
        .prompt_order_by_folder
        .insert("A".into(), vec!["a2".into(), "a1".into()]);
    organization
        .prompt_order_by_folder
        .insert("".into(), vec!["u1".into()]);
    store_organization(&conn, &organization).unwrap();

    let renamed = rename_folder_impl(&mut conn, "A", "Renamed", &organization).unwrap();
    assert_eq!(renamed.organization.folder_order, vec!["Renamed", "B", ""]);
    assert_eq!(
        renamed.organization.prompt_order_by_folder["Renamed"],
        vec!["a2", "a1"]
    );
    assert!(renamed
        .prompts
        .iter()
        .filter(|prompt| prompt.id == "a1" || prompt.id == "a2")
        .all(|prompt| prompt.folder == "Renamed" && prompt.favorite && prompt.use_count == 9));

    let deleted = delete_folder_impl(&mut conn, "Renamed", &renamed.organization).unwrap();
    assert_eq!(deleted.organization.folder_order, vec!["B", ""]);
    assert_eq!(
        deleted.organization.prompt_order_by_folder[""],
        vec!["u1", "a2", "a1"]
    );
    assert!(deleted
        .prompts
        .iter()
        .filter(|prompt| prompt.id == "a1" || prompt.id == "a2")
        .all(|prompt| prompt.folder.is_empty()));
    assert!(!read_folders(&conn)
        .unwrap()
        .contains(&"Renamed".to_string()));
}

#[test]
fn folder_mutations_and_prompt_auto_creation_roll_back_on_order_failure() {
    for operation in ["create", "rename", "delete", "auto-create"] {
        let mut conn = fixture();
        let before = snapshot(&conn);
        let expected = read_organization(&conn, &read_prompts(&conn).unwrap()).unwrap();
        fail_order_writes(&conn);
        let error = match operation {
            "create" => create_folder_impl(&mut conn, "New", &expected).unwrap_err(),
            "rename" => rename_folder_impl(&mut conn, "A", "New", &expected).unwrap_err(),
            "delete" => delete_folder_impl(&mut conn, "A", &expected).unwrap_err(),
            _ => {
                let mut prompt = read_prompt_by_id(&conn, "a1").unwrap();
                prompt.id.clear();
                prompt.folder = "New".into();
                save_prompt_impl(&mut conn, prompt).unwrap_err()
            }
        };
        assert!(
            error.contains("injected order failure"),
            "{operation}: {error}"
        );
        assert_eq!(
            snapshot(&conn),
            before,
            "{operation} left partial folder data"
        );
    }
}

#[test]
fn folder_migration_materializes_only_active_legacy_folders() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE prompts (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]', folder TEXT NOT NULL DEFAULT '',
            favorite INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0, last_used_at INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE organization (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
        INSERT INTO prompts VALUES
            ('a','A','','[]','A',0,0,0,NULL,1,1),
            ('b','B','','[]','B',0,0,0,NULL,2,2);",
    )
    .unwrap();
    store_organization(
        &conn,
        &Organization {
            folder_order: vec!["Ghost".into(), "B".into(), "A".into()],
            prompt_order_by_folder: [
                ("A".into(), vec!["a".into()]),
                ("B".into(), vec!["b".into()]),
            ]
            .into_iter()
            .collect(),
            pinned_order: vec![],
        },
    )
    .unwrap();

    initialize_db(&mut conn).unwrap();
    assert_eq!(read_folders(&conn).unwrap(), vec!["A", "B"]);
    let organization = read_organization(&conn, &read_prompts(&conn).unwrap()).unwrap();
    assert_eq!(organization.folder_order, vec!["B", "A"]);
    assert!(!organization.folder_order.contains(&"Ghost".to_string()));
}

#[test]
fn failed_upgrade_rolls_back_schema_seed_and_organization_together() {
    let mut conn = fixture();
    conn.execute_batch("DELETE FROM organization; ALTER TABLE prompts DROP COLUMN pinned;")
        .unwrap();
    fail_order_writes(&conn);
    assert!(initialize_db(&mut conn)
        .unwrap_err()
        .contains("injected order failure"));
    let columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('prompts') WHERE name='pinned'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(columns, 0, "failed upgrade must roll back ALTER TABLE");
    let rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 3);
    conn.execute_batch("DROP TRIGGER fail_order;").unwrap();
    initialize_db(&mut conn).unwrap();
    let before = snapshot(&conn);
    initialize_db(&mut conn).unwrap();
    assert_eq!(snapshot(&conn), before);

    let mut empty = Connection::open_in_memory().unwrap();
    empty
        .execute_batch("CREATE TABLE organization(id INTEGER PRIMARY KEY, data TEXT NOT NULL);")
        .unwrap();
    fail_order_writes(&empty);
    assert!(initialize_db(&mut empty).is_err());
    let tables: i64 = empty.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('prompts','settings','ui_prefs')", [], |r| r.get(0)).unwrap();
    assert_eq!(tables, 0, "fresh schema and seeds must roll back too");
}

#[test]
fn import_warns_about_invalid_metadata_without_dropping_records() {
    let conn = fixture();
    let prompts = read_prompts(&conn).unwrap();
    for value in [
        serde_json::json!(3),
        serde_json::json!({"folderOrder": false}),
        serde_json::json!({"folderOrder": ["B", "B", "missing"]}),
        serde_json::json!({"promptOrderByFolder": {"A": ["a1", "b1", "ghost"]}}),
        serde_json::json!({"pinnedOrder": ["a1"]}),
    ] {
        let raw = organization::parse_raw_organization(Some(&value));
        let precheck = import_logic::precheck(&prompts, &[], raw.as_ref());
        assert!(precheck.organization_adjusted, "{value}");
        assert_eq!(precheck.items.len(), prompts.len());
        assert_eq!(
            Organization::import_sequence(&prompts, &precheck.organization.unwrap()).len(),
            prompts.len()
        );
    }
    assert!(!import_logic::precheck(&prompts, &[], None).organization_adjusted);
    let valid = serde_json::to_value(Organization::from_import(&prompts, None)).unwrap();
    let raw = organization::parse_raw_organization(Some(&valid));
    assert!(!import_logic::precheck(&prompts, &[], raw.as_ref()).organization_adjusted);
}

#[test]
fn onboarding_state_distinguishes_fresh_data_from_a_legacy_install() {
    let mut fresh = Connection::open_in_memory().unwrap();
    assert!(initialize_db(&mut fresh).unwrap());
    assert!(!read_onboarding_completed(&fresh).unwrap());
    // 未明确完成前，每次启动都应继续自动引导。
    assert!(initialize_db(&mut fresh).unwrap());
    write_onboarding_completed(&fresh).unwrap();
    assert!(!initialize_db(&mut fresh).unwrap());

    let mut legacy = Connection::open_in_memory().unwrap();
    legacy
        .execute_batch(
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
            );",
        )
        .unwrap();
    assert!(!initialize_db(&mut legacy).unwrap());
    assert!(read_onboarding_completed(&legacy).unwrap());
}

#[test]
fn onboarding_migration_does_not_overwrite_an_unknown_database() {
    let mut unknown = Connection::open_in_memory().unwrap();
    unknown
        .execute_batch("CREATE TABLE private_notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL);")
        .unwrap();
    assert_eq!(
        initialize_db(&mut unknown).unwrap_err(),
        "database.unrecognized_schema"
    );
    assert!(!table_exists(&unknown, "settings").unwrap());
    assert!(table_exists(&unknown, "private_notes").unwrap());
}
