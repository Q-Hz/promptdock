use std::collections::{BTreeMap, BTreeSet, HashSet};

use rusqlite::{params, Transaction};
use serde::{Deserialize, Serialize};

use crate::organization::{Organization, RawOrganization};
use crate::Prompt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrecheckKind {
    New,
    Identical,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrecheckItem {
    pub imported: Prompt,
    pub candidates: Vec<Prompt>,
    pub kind: PrecheckKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPrecheck {
    #[serde(default)]
    pub organization_adjusted: bool,
    pub items: Vec<PrecheckItem>,
    pub new_count: usize,
    pub identical_count: usize,
    pub conflict_count: usize,
    // 文件自带的顺序元数据，提交时回传，用于新增记录之间的相对顺序
    pub organization: Option<Organization>,
}

// 导入文件解析结果：提示词记录与可选的顺序元数据
#[derive(Debug, Clone)]
pub struct ImportFile {
    pub prompts: Vec<Prompt>,
    pub organization: Option<RawOrganization>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDecision {
    pub imported_id: String,
    pub action: String,
    pub target_local_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub inserted: usize,
    pub updated: usize,
    pub inserted_as_new: usize,
    pub skipped: usize,
}

// 标题匹配：仅去首尾 Unicode 空白，区分大小写，不折叠中间空格（PRD 4.2）
pub fn normalize_title(title: &str) -> &str {
    title.trim_matches(char::is_whitespace)
}

// 标签集合：单标签 trim、去空、去重、区分大小写（PRD 4.3）
pub fn tag_set(tags: &[String]) -> BTreeSet<String> {
    tags.iter()
        .map(|t| t.trim_matches(char::is_whitespace).to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

// 置顶属于业务字段：仅置顶不同也不能被当作完全相同而跳过（PRD 5.4.1）
pub fn business_equal(a: &Prompt, b: &Prompt) -> bool {
    normalize_title(&a.title) == normalize_title(&b.title)
        && a.body == b.body
        && tag_set(&a.tags) == tag_set(&b.tags)
        && a.folder == b.folder
        && a.favorite == b.favorite
        && a.pinned == b.pinned
}

// 候选查找：先精确 id（唯一即胜出），否则全部同名；仅基于本地快照（PRD 6.3）
pub fn find_candidates<'a>(imported: &Prompt, locals: &'a [Prompt]) -> Vec<&'a Prompt> {
    let by_id: Vec<&Prompt> = locals.iter().filter(|l| l.id == imported.id).collect();
    if !by_id.is_empty() {
        return by_id;
    }
    locals
        .iter()
        .filter(|l| normalize_title(&l.title) == normalize_title(&imported.title))
        .collect()
}

// 分类（PRD 6.5）：无候选→New；多同名候选→无条件 Conflict；单候选→business_equal ? Identical : Conflict
pub fn classify(imported: &Prompt, locals: &[Prompt]) -> PrecheckKind {
    let candidates = find_candidates(imported, locals);
    match candidates.as_slice() {
        [] => PrecheckKind::New,
        [only] => {
            if business_equal(imported, only) {
                PrecheckKind::Identical
            } else {
                PrecheckKind::Conflict
            }
        }
        _ => PrecheckKind::Conflict,
    }
}

pub fn precheck(
    imported_prompts: &[Prompt],
    locals: &[Prompt],
    raw_organization: Option<&RawOrganization>,
) -> ImportPrecheck {
    let mut items = Vec::with_capacity(imported_prompts.len());
    for imported in imported_prompts {
        let candidates = find_candidates(imported, locals);
        let kind = classify(imported, locals);
        items.push(PrecheckItem {
            imported: imported.clone(),
            candidates: candidates.into_iter().cloned().collect(),
            kind,
        });
    }
    let new_count = items.iter().filter(|i| i.kind == PrecheckKind::New).count();
    let identical_count = items
        .iter()
        .filter(|i| i.kind == PrecheckKind::Identical)
        .count();
    let conflict_count = items.len() - new_count - identical_count;
    ImportPrecheck {
        organization_adjusted: raw_organization
            .is_some_and(|raw| raw.was_adjusted(imported_prompts)),
        organization: Some(Organization::from_import(
            imported_prompts,
            raw_organization,
        )),
        items,
        new_count,
        identical_count,
        conflict_count,
    }
}

pub fn read_import_file(path: &str) -> Result<ImportFile, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("import.read_failed:{e}"))?;
    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|_| "import.invalid_json".to_string())?;
    let (prompts, organization) = crate::validate_import_document(&data)?;
    validate_import_snapshot(&prompts)?;
    Ok(ImportFile {
        prompts,
        organization,
    })
}

pub fn validate_import_snapshot(prompts: &[Prompt]) -> Result<(), String> {
    if prompts.is_empty() {
        return Err("import.no_prompts".into());
    }
    let mut seen: HashSet<&str> = HashSet::new();
    for prompt in prompts {
        if !seen.insert(prompt.id.as_str()) {
            return Err("import.duplicate_id".into());
        }
    }
    Ok(())
}

fn snapshot_shape_is_valid(snapshot: &ImportPrecheck) -> bool {
    let new_count = snapshot
        .items
        .iter()
        .filter(|item| item.kind == PrecheckKind::New)
        .count();
    let identical_count = snapshot
        .items
        .iter()
        .filter(|item| item.kind == PrecheckKind::Identical)
        .count();
    let conflict_count = snapshot.items.len() - new_count - identical_count;
    snapshot.new_count == new_count
        && snapshot.identical_count == identical_count
        && snapshot.conflict_count == conflict_count
}

fn candidates_match_snapshot(expected: &[Prompt], current: &[Prompt]) -> bool {
    expected.len() == current.len()
        && expected.iter().all(|old| {
            current
                .iter()
                .find(|now| now.id == old.id)
                .is_some_and(|now| business_equal(old, now))
        })
}

// 最终提交必须与预检查时的完整候选关系及业务字段一致。使用记录和时间字段不参与，
// 因此正常调用导致的 useCount/lastUsedAt 漂移不会阻断提交（PRD 8.4）。
pub fn precheck_snapshot_matches(expected: &ImportPrecheck, current: &ImportPrecheck) -> bool {
    snapshot_shape_is_valid(expected)
        && expected.items.len() == current.items.len()
        && expected.items.iter().zip(&current.items).all(|(old, now)| {
            old.imported.id == now.imported.id
                && old.kind == now.kind
                && candidates_match_snapshot(&old.candidates, &now.candidates)
        })
}

fn read_locals(tx: &Transaction) -> Result<Vec<Prompt>, String> {
    let mut stmt = tx
        .prepare(&format!("SELECT {} FROM prompts", crate::PROMPT_COLUMNS))
        .map_err(|e| e.to_string())?;
    let locals = stmt
        .query_map([], crate::row_to_prompt)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(locals)
}

// 在事务的一致性视图内重新验证全部决策并执行导入计划（PRD 8.3/8.4）。
// decisions 被视为不可信输入：必须恰好覆盖当前视图中的全部 Conflict 项。
pub fn commit_import_impl(
    tx: &Transaction,
    expected: &ImportPrecheck,
    decisions: &[ImportDecision],
    commit_ts: i64,
) -> Result<ImportResult, String> {
    let imported_prompts: Vec<Prompt> = expected
        .items
        .iter()
        .map(|item| item.imported.clone())
        .collect();
    validate_import_snapshot(&imported_prompts)?;
    if !snapshot_shape_is_valid(expected) {
        return Err("import.invalid_decision".into());
    }
    let locals = read_locals(tx)?;
    let current = precheck(&imported_prompts, &locals, None);
    if !precheck_snapshot_matches(expected, &current) {
        return Err("import.stale_plan".into());
    }

    let mut decision_map: BTreeMap<&str, &ImportDecision> = BTreeMap::new();
    for decision in decisions {
        if !matches!(
            decision.action.as_str(),
            "keep_local" | "use_imported" | "import_as_new"
        ) {
            return Err("import.invalid_decision".into());
        }
        if decision_map
            .insert(decision.imported_id.as_str(), decision)
            .is_some()
        {
            return Err("import.invalid_decision".into());
        }
    }

    let mut result = ImportResult::default();
    let mut used_targets: HashSet<&str> = HashSet::new();
    let mut organization = crate::load_organization(tx)?;

    // 追加导入不重排已有本地条目；新增记录之间按文件顺序元数据的相对顺序排列（PRD 5.4.7）
    let sequence = match &expected.organization {
        Some(file_organization) => {
            Organization::import_sequence(&imported_prompts, file_organization)
        }
        None => imported_prompts.clone(),
    };

    for imported in &sequence {
        let candidates = find_candidates(imported, &locals);
        let kind = classify(imported, &locals);
        let decision = decision_map.remove(imported.id.as_str());
        match kind {
            PrecheckKind::New => {
                if decision.is_some() {
                    return Err("import.stale_plan".into());
                }
                // New 项原样插入，保留导入文件的全部字段（PRD 8.2）
                crate::insert_prompt(tx, imported).map_err(|e| e.to_string())?;
                organization.add_prompt(imported);
                result.inserted += 1;
            }
            PrecheckKind::Identical => {
                if decision.is_some() {
                    return Err("import.stale_plan".into());
                }
                result.skipped += 1;
            }
            PrecheckKind::Conflict => {
                let Some(decision) = decision else {
                    return Err("import.stale_plan".into());
                };
                match decision.action.as_str() {
                    "keep_local" => {
                        // 保留本地的收藏、置顶、归属与位置（PRD 5.4.3）
                        result.skipped += 1;
                    }
                    "use_imported" => {
                        let target_id = decision
                            .target_local_id
                            .as_deref()
                            .ok_or_else(|| "import.invalid_decision".to_string())?;
                        let target = candidates
                            .iter()
                            .find(|c| c.id == target_id)
                            .ok_or_else(|| "import.stale_plan".to_string())?;
                        if !used_targets.insert(target.id.as_str()) {
                            return Err("import.target_conflict".into());
                        }
                        // 2026-09-03 用户新决定：完整采用导入记录，包括主键、时间与使用历史。
                        // 普通 UPDATE（非 OR REPLACE）让主键冲突报错并回滚，不能覆盖其他记录。
                        tx.execute(
                            "UPDATE prompts SET id=?2, title=?3, body=?4, tags=?5, folder=?6, favorite=?7,
                             pinned=?8, use_count=?9, last_used_at=?10, created_at=?11, updated_at=?12 WHERE id=?1",
                            params![
                                target.id,
                                imported.id,
                                imported.title,
                                imported.body,
                                serde_json::to_string(&imported.tags).unwrap_or_default(),
                                imported.folder,
                                imported.favorite as i32,
                                imported.pinned as i32,
                                imported.use_count,
                                imported.last_used_at,
                                imported.created_at,
                                imported.updated_at,
                            ],
                        )
                        .map_err(|e| e.to_string())?;
                        if target.folder != imported.folder {
                            // 归属变化：从源位置移除并追加到目标文件夹末尾（PRD 5.4.4）
                            organization.move_prompt(
                                &target.id,
                                &target.folder,
                                &imported.folder,
                                None,
                            );
                        }
                        // 归属不变时保留本地位置，只把旧 ID 引用同步到导入 ID
                        organization.rename_prompt(&target.id, &imported.id);
                        if !target.pinned && imported.pinned {
                            organization.set_pinned(&imported.id, true);
                        } else if target.pinned && !imported.pinned {
                            organization.set_pinned(&imported.id, false);
                        }
                        result.updated += 1;
                    }
                    "import_as_new" => {
                        let mut created = imported.clone();
                        created.id = uuid::Uuid::new_v4().to_string();
                        created.use_count = 0;
                        created.last_used_at = None;
                        created.created_at = commit_ts;
                        created.updated_at = commit_ts;
                        crate::insert_prompt(tx, &created).map_err(|e| e.to_string())?;
                        organization.add_prompt(&created);
                        result.inserted_as_new += 1;
                    }
                    _ => return Err("import.invalid_decision".into()),
                }
            }
        }
    }

    if !decision_map.is_empty() {
        // 存在指向文件中不存在条目的决策
        return Err("import.invalid_decision".into());
    }

    let prompts = read_locals(tx)?;
    organization.normalize(&prompts);
    crate::store_organization(tx, &organization)?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn prompt(id: &str, title: &str, body: &str) -> Prompt {
        Prompt {
            id: id.into(),
            title: title.into(),
            body: body.into(),
            tags: vec![],
            folder: "".into(),
            favorite: false,
            pinned: false,
            use_count: 0,
            last_used_at: None,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn decision(id: &str, action: &str, target: Option<&str>) -> ImportDecision {
        ImportDecision {
            imported_id: id.into(),
            action: action.into(),
            target_local_id: target.map(String::from),
        }
    }

    fn memory_db() -> Connection {
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
            CREATE TABLE organization (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn commit_current(
        tx: &Transaction,
        imported: &[Prompt],
        decisions: &[ImportDecision],
        commit_ts: i64,
    ) -> Result<ImportResult, String> {
        let locals = read_locals(tx).unwrap();
        let snapshot = precheck(imported, &locals, None);
        commit_import_impl(tx, &snapshot, decisions, commit_ts)
    }

    #[test]
    fn title_normalization_trims_unicode_whitespace_only() {
        assert_eq!(normalize_title(" Code review "), "Code review");
        assert_eq!(normalize_title("\u{3000}代码审查\u{3000}"), "代码审查");
        assert_eq!(normalize_title("\tCode\nreview\r\n"), "Code\nreview");
        assert_ne!(
            normalize_title("Code review"),
            normalize_title("code review")
        );
        assert_ne!(normalize_title("a  b"), normalize_title("a b"));
    }

    #[test]
    fn tag_sets_ignore_order_and_duplicates_but_keep_case() {
        let a = vec!["Rust".to_string(), "dev".to_string(), "dev".to_string()];
        let b = vec![" dev ".to_string(), "Rust".to_string()];
        let empty = vec!["  ".to_string(), "".to_string()];
        assert_eq!(tag_set(&a), tag_set(&b));
        assert_ne!(tag_set(&a), tag_set(&vec!["rust".to_string()]));
        assert!(tag_set(&empty).is_empty());
    }

    #[test]
    fn business_equal_ignores_usage_and_timestamps() {
        let mut a = prompt("a", "Title", "Body");
        let mut b = prompt("b", " Title ", "Body");
        b.use_count = 9;
        b.last_used_at = Some(100);
        b.created_at = 50;
        b.updated_at = 999;
        assert!(business_equal(&a, &b));
        b.favorite = true;
        assert!(!business_equal(&a, &b));
        a.body = "other".into();
        b.favorite = false;
        assert!(!business_equal(&a, &b));
    }

    #[test]
    fn classify_covers_precheck_priority_rules() {
        // AC-01: 无匹配 → 新增
        assert_eq!(
            classify(&prompt("i", "New", "x"), &[prompt("l", "Other", "y")]),
            PrecheckKind::New
        );
        // AC-02: 单候选业务字段相同 → Identical
        assert_eq!(
            classify(&prompt("i", "Same", "x"), &[prompt("l", "Same", "x")]),
            PrecheckKind::Identical
        );
        // AC-03/05: 候选但不同 → Conflict
        assert_eq!(
            classify(&prompt("i", "Same", "x"), &[prompt("l", "Same", "z")]),
            PrecheckKind::Conflict
        );
        // AC-03: id 相同正文不同 → Conflict
        assert_eq!(
            classify(&prompt("l", "Same", "x"), &[prompt("l", "Same", "z")]),
            PrecheckKind::Conflict
        );
        // AC-04: id 相同标题不同 → Conflict
        assert_eq!(
            classify(&prompt("l", "New title", "x"), &[prompt("l", "Same", "x")]),
            PrecheckKind::Conflict
        );
        // AC-08: 多同名候选即使其中一条完全相同也 → Conflict
        let locals = vec![prompt("l1", "Same", "x"), prompt("l2", "Same", "other")];
        assert_eq!(
            classify(&prompt("i", "Same", "x"), &locals),
            PrecheckKind::Conflict
        );
        // AC-07: 正文相似但 id/标题均不匹配 → 新增
        assert_eq!(
            classify(
                &prompt("i", "New", "hello world"),
                &[prompt("l", "Other", "hello worl")]
            ),
            PrecheckKind::New
        );
    }

    #[test]
    fn precheck_counts_match_classification() {
        let locals = vec![prompt("l1", "Same", "x"), prompt("l2", "Other", "y")];
        let imported = vec![
            prompt("i1", "Same", "z"),  // conflict
            prompt("l2", "Other", "y"), // identical (id match)
            prompt("i3", "Fresh", "z"), // new
        ];
        let report = precheck(&imported, &locals, None);
        assert_eq!(report.conflict_count, 1);
        assert_eq!(report.identical_count, 1);
        assert_eq!(report.new_count, 1);
        assert_eq!(report.items[0].candidates.len(), 1);
        assert_eq!(report.items[0].candidates[0].id, "l1");
    }

    #[test]
    fn duplicate_ids_in_file_are_rejected() {
        let mut dir = std::env::temp_dir();
        dir.push("promptdock-import-dup-test.json");
        let doc = serde_json::json!({
            "format": "promptdeck",
            "version": 1,
            "prompts": [
                prompt("dup", "A", "x"),
                prompt("dup", "B", "y"),
            ]
        });
        std::fs::write(&dir, serde_json::to_string(&doc).unwrap()).unwrap();
        assert_eq!(
            read_import_file(dir.to_str().unwrap()).unwrap_err(),
            "import.duplicate_id"
        );
        let _ = std::fs::remove_file(&dir);
    }

    #[test]
    fn commit_inserts_new_verbatim_and_skips_identical() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Local", "old")).unwrap();
        let imported = vec![prompt("i1", "Fresh", "z"), prompt("l1", "Local", "old")];
        let result = commit_current(&tx, &imported, &[], 500).unwrap();
        tx.commit().unwrap();
        assert_eq!(
            result,
            ImportResult {
                inserted: 1,
                updated: 0,
                inserted_as_new: 0,
                skipped: 1
            }
        );
        let fresh: Prompt = conn
            .query_row("SELECT id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at FROM prompts WHERE id='i1'", [], crate::row_to_prompt)
            .unwrap();
        assert_eq!(fresh.updated_at, 1); // 保留导入文件的时间字段
    }

    #[test]
    fn commit_use_imported_replaces_every_field_including_identity_and_usage() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        let mut local = prompt("l1", "Old title", "old body");
        local.use_count = 7;
        local.last_used_at = Some(42);
        local.created_at = 10;
        crate::insert_prompt(&tx, &local).unwrap();
        let mut incoming = prompt("i1", "Old title", "new body");
        incoming.tags = vec!["imported-tag".into()];
        incoming.folder = "imported-folder".into();
        incoming.favorite = true;
        incoming.use_count = 19;
        incoming.last_used_at = Some(123);
        incoming.created_at = 20;
        incoming.updated_at = 30;
        let imported = vec![incoming.clone()];
        let result = commit_current(
            &tx,
            &imported,
            &[decision("i1", "use_imported", Some("l1"))],
            900,
        )
        .unwrap();
        tx.commit().unwrap();
        assert_eq!(result.updated, 1);
        let updated: Prompt = conn
            .query_row("SELECT id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at FROM prompts WHERE id='i1'", [], crate::row_to_prompt)
            .unwrap();
        assert_eq!(
            (updated.title.as_str(), updated.body.as_str()),
            ("Old title", "new body")
        );
        assert_eq!(
            serde_json::to_value(updated).unwrap(),
            serde_json::to_value(incoming).unwrap()
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM prompts WHERE id='l1'", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn commit_same_id_replaces_title_and_history_but_not_other_records() {
        let mut conn = memory_db();
        let original = prompt("shared", "Before", "old");
        let untouched = prompt("other", "After", "unrelated");
        crate::insert_prompt(&conn, &original).unwrap();
        crate::insert_prompt(&conn, &untouched).unwrap();
        let mut incoming = prompt("shared", "After", "new");
        incoming.use_count = 27;
        incoming.last_used_at = Some(45);
        incoming.created_at = 12;
        incoming.updated_at = 50;
        let tx = conn.transaction().unwrap();
        let result = commit_current(
            &tx,
            &[incoming.clone()],
            &[decision("shared", "use_imported", Some("shared"))],
            900,
        )
        .unwrap();
        assert_eq!(result.updated, 1);
        tx.commit().unwrap();
        let tx = conn.transaction().unwrap();
        let records = read_locals(&tx).unwrap();
        assert_eq!(records.len(), 2);
        for expected in [incoming, untouched] {
            let actual = records.iter().find(|p| p.id == expected.id).unwrap();
            assert_eq!(
                serde_json::to_value(actual).unwrap(),
                serde_json::to_value(expected).unwrap()
            );
        }
    }

    #[test]
    fn commit_multiple_candidates_only_replaces_explicit_target() {
        let mut conn = memory_db();
        let untouched = prompt("l1", "Same", "first candidate");
        crate::insert_prompt(&conn, &untouched).unwrap();
        crate::insert_prompt(&conn, &prompt("l2", "Same", "second candidate")).unwrap();
        let incoming = prompt("i1", "Same", "imported");
        let tx = conn.transaction().unwrap();
        commit_current(
            &tx,
            &[incoming.clone()],
            &[decision("i1", "use_imported", Some("l2"))],
            900,
        )
        .unwrap();
        tx.commit().unwrap();
        let tx = conn.transaction().unwrap();
        let records = read_locals(&tx).unwrap();
        assert_eq!(records.len(), 2);
        assert!(!records.iter().any(|p| p.id == "l2"));
        for expected in [incoming, untouched] {
            let actual = records.iter().find(|p| p.id == expected.id).unwrap();
            assert_eq!(
                serde_json::to_value(actual).unwrap(),
                serde_json::to_value(expected).unwrap()
            );
        }
    }

    #[test]
    fn full_replacement_rolls_back_identity_history_and_earlier_writes_on_failure() {
        let mut conn = memory_db();
        let mut original = prompt("l1", "Same", "original");
        original.use_count = 7;
        original.last_used_at = Some(42);
        crate::insert_prompt(&conn, &original).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_after_replacement BEFORE INSERT ON prompts
             WHEN NEW.id = 'bad' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
        )
        .unwrap();
        {
            let tx = conn.transaction().unwrap();
            let imported = vec![
                prompt("i1", "Same", "replacement"),
                prompt("bad", "New", "new"),
            ];
            let error = commit_current(
                &tx,
                &imported,
                &[decision("i1", "use_imported", Some("l1"))],
                900,
            )
            .unwrap_err();
            assert!(error.contains("injected failure"));
            // Match the command's error path: dropping the transaction rolls back the UPDATE too.
        }
        let tx = conn.transaction().unwrap();
        let records = read_locals(&tx).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(
            serde_json::to_value(&records[0]).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }

    #[test]
    fn commit_import_as_new_generates_fresh_id_and_resets_usage() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "body")).unwrap();
        let imported = vec![prompt("i1", "Same", "body2")];
        let result = commit_current(
            &tx,
            &imported,
            &[decision("i1", "import_as_new", None)],
            700,
        )
        .unwrap();
        tx.commit().unwrap();
        assert_eq!(result.inserted_as_new, 1);
        let created: Prompt = conn
            .query_row("SELECT id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at FROM prompts WHERE id <> 'l1'", [], crate::row_to_prompt)
            .unwrap();
        assert_ne!(created.id, "i1");
        assert_eq!(created.title, "Same");
        assert_eq!(created.use_count, 0);
        assert_eq!(created.last_used_at, None);
        assert_eq!(created.created_at, 700);
        assert_eq!(created.updated_at, 700);
    }

    #[test]
    fn commit_keep_local_and_all_identical_write_nothing() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "x")).unwrap();
        let imported = vec![prompt("i1", "Same", "y")];
        let result =
            commit_current(&tx, &imported, &[decision("i1", "keep_local", None)], 900).unwrap();
        assert_eq!(result.skipped, 1);
        assert_eq!(result.inserted + result.updated + result.inserted_as_new, 0);

        let identical = vec![prompt("i1", "Same", "x")];
        let result = commit_current(&tx, &identical, &[], 900).unwrap();
        tx.commit().unwrap();
        assert_eq!(
            result,
            ImportResult {
                inserted: 0,
                updated: 0,
                inserted_as_new: 0,
                skipped: 1
            }
        );
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn commit_rejects_target_conflicts() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "x")).unwrap();
        let imported = vec![prompt("i1", "Same", "a"), prompt("i2", "Same", "b")];
        let err = commit_current(
            &tx,
            &imported,
            &[
                decision("i1", "use_imported", Some("l1")),
                decision("i2", "use_imported", Some("l1")),
            ],
            900,
        )
        .unwrap_err();
        assert_eq!(err, "import.target_conflict");
    }

    #[test]
    fn commit_detects_stale_plans() {
        // 原判定为新增，但本地出现了同 id 候选
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("i1", "Different title", "x")).unwrap();
        let imported = vec![prompt("i1", "Fresh title", "z")];
        let expected = precheck(&imported, &[], None);
        let err = commit_import_impl(&tx, &expected, &[], 900).unwrap_err();
        assert_eq!(err, "import.stale_plan");

        // 原判定为冲突（有决策），但本地候选已被删除 → 变成新增，决策多余
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        let imported = vec![prompt("i1", "Fresh", "z")];
        let expected = precheck(&imported, &[prompt("l1", "Fresh", "old")], None);
        let err = commit_import_impl(&tx, &expected, &[decision("i1", "keep_local", None)], 900)
            .unwrap_err();
        assert_eq!(err, "import.stale_plan");

        // 决策指向的目标不在当前候选集合中
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "x")).unwrap();
        let imported = vec![prompt("i1", "Same", "y")];
        let err = commit_current(
            &tx,
            &imported,
            &[decision("i1", "use_imported", Some("missing"))],
            900,
        )
        .unwrap_err();
        assert_eq!(err, "import.stale_plan");
    }

    #[test]
    fn commit_rejects_business_candidate_and_classification_drift() {
        // 候选仍是同一 id、分类仍为 Conflict，但正文已在预览后变化（AC-31）。
        let mut conn = memory_db();
        crate::insert_prompt(&conn, &prompt("l1", "Same", "changed after preview")).unwrap();
        let tx = conn.transaction().unwrap();
        let imported = vec![prompt("i1", "Same", "imported")];
        let expected = precheck(
            &imported,
            &[prompt("l1", "Same", "body shown in preview")],
            None,
        );
        let err = commit_import_impl(
            &tx,
            &expected,
            &[decision("i1", "use_imported", Some("l1"))],
            900,
        )
        .unwrap_err();
        assert_eq!(err, "import.stale_plan");

        // 原 Identical 候选被删除后变成 New，不能直接插入（AC-33A）。
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        let imported = vec![prompt("i1", "Same", "body")];
        let expected = precheck(&imported, &[prompt("l1", "Same", "body")], None);
        let err = commit_import_impl(&tx, &expected, &[], 900).unwrap_err();
        assert_eq!(err, "import.stale_plan");

        // 分类仍为 Conflict，但同名候选集合增加，也必须重新比较。
        let mut conn = memory_db();
        crate::insert_prompt(&conn, &prompt("l1", "Same", "old")).unwrap();
        crate::insert_prompt(&conn, &prompt("l2", "Same", "another")).unwrap();
        let tx = conn.transaction().unwrap();
        let imported = vec![prompt("i1", "Same", "imported")];
        let expected = precheck(&imported, &[prompt("l1", "Same", "old")], None);
        let err = commit_import_impl(&tx, &expected, &[decision("i1", "keep_local", None)], 900)
            .unwrap_err();
        assert_eq!(err, "import.stale_plan");
    }

    #[test]
    fn commit_usecount_drift_is_not_a_conflict() {
        // 使用记录漂移仍不阻断提交，但完整替换采用导入文件中的使用记录。
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        let mut local = prompt("l1", "Same", "x");
        local.use_count = 3;
        crate::insert_prompt(&tx, &local).unwrap();
        tx.execute(
            "UPDATE prompts SET use_count = 5, last_used_at = 77 WHERE id = 'l1'",
            [],
        )
        .unwrap();
        let imported = vec![prompt("i1", "Same", "y")];
        let expected = precheck(&imported, &[local.clone()], None);
        let result = commit_import_impl(
            &tx,
            &expected,
            &[decision("i1", "use_imported", Some("l1"))],
            900,
        )
        .unwrap();
        assert_eq!(result.updated, 1);
        tx.commit().unwrap();
        let updated: Prompt = conn
            .query_row("SELECT id,title,body,tags,folder,favorite,pinned,use_count,last_used_at,created_at,updated_at FROM prompts WHERE id='i1'", [], crate::row_to_prompt)
            .unwrap();
        assert_eq!(updated.use_count, 0);
        assert_eq!(updated.last_used_at, None);
    }

    #[test]
    fn commit_rolls_back_when_a_write_fails() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        // 注入故障：插入特定 id 时触发 RAISE
        tx.execute_batch(
            "CREATE TRIGGER fail_on_id BEFORE INSERT ON prompts
             WHEN NEW.id = 'i_bad' BEGIN
                 SELECT RAISE(ABORT, 'injected failure');
             END;",
        )
        .unwrap();
        let imported = vec![prompt("i_ok", "A", "x"), prompt("i_bad", "B", "y")];
        let err = commit_current(&tx, &imported, &[], 900).unwrap_err();
        assert!(err.contains("injected failure"));
        tx.rollback().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM prompts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn commit_rejects_unknown_decisions_and_actions() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        let imported = vec![prompt("i1", "Fresh", "z")];
        let err = commit_current(
            &tx,
            &imported,
            &[decision("missing", "keep_local", None)],
            900,
        )
        .unwrap_err();
        assert_eq!(err, "import.invalid_decision");

        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "x")).unwrap();
        let imported = vec![prompt("i1", "Same", "y")];
        let err =
            commit_current(&tx, &imported, &[decision("i1", "nonsense", None)], 900).unwrap_err();
        assert_eq!(err, "import.invalid_decision");

        // use_imported 缺少目标
        let err = commit_current(&tx, &imported, &[decision("i1", "use_imported", None)], 900)
            .unwrap_err();
        assert_eq!(err, "import.invalid_decision");
    }

    #[test]
    fn commit_syncs_folder_membership_and_the_pinned_shortcut() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "local body")).unwrap();
        crate::insert_prompt(&tx, &prompt("l2", "Other", "untouched")).unwrap();
        let mut seeded = Organization::default();
        seeded.folder_order = vec!["".into()];
        seeded.prompt_order_by_folder =
            [("".to_string(), vec!["l1".to_string(), "l2".to_string()])]
                .into_iter()
                .collect();
        crate::store_organization(&tx, &seeded).unwrap();

        // l1 完整替换：归属不变保留本地位置、ID 引用同步，置顶由否变是追加到置顶区末尾
        let mut replaced = prompt("i1", "Same", "imported body");
        replaced.pinned = true;
        // fresh 是新文件夹中的新增记录
        let mut fresh = prompt("i2", "Fresh", "new body");
        fresh.folder = "Imported".into();

        let locals = read_locals(&tx).unwrap();
        let snapshot = precheck(&[replaced.clone(), fresh.clone()], &locals, None);
        commit_import_impl(
            &tx,
            &snapshot,
            &[decision("i1", "use_imported", Some("l1"))],
            900,
        )
        .unwrap();
        tx.commit().unwrap();

        let tx = conn.transaction().unwrap();
        let organization = crate::load_organization(&tx).unwrap();
        assert_eq!(
            organization.prompt_order_by_folder[""],
            vec!["i1".to_string(), "l2".to_string()]
        );
        // 新文件夹追加到文件夹顺序末尾
        assert_eq!(organization.folder_order, vec!["", "Imported"]);
        assert_eq!(
            organization.prompt_order_by_folder["Imported"],
            vec!["i2".to_string()]
        );
        assert_eq!(organization.pinned_order, vec!["i1".to_string()]);
    }

    #[test]
    fn commit_import_as_new_appends_to_the_target_folder_and_pinned_area() {
        let mut conn = memory_db();
        let tx = conn.transaction().unwrap();
        crate::insert_prompt(&tx, &prompt("l1", "Same", "local")).unwrap();
        let mut seeded = Organization::default();
        seeded.folder_order = vec!["".into()];
        seeded.prompt_order_by_folder = [(String::new(), vec!["l1".to_string()])]
            .into_iter()
            .collect();
        crate::store_organization(&tx, &seeded).unwrap();

        let mut imported = prompt("i1", "Same", "imported");
        imported.pinned = true;
        let locals = read_locals(&tx).unwrap();
        let snapshot = precheck(&[imported], &locals, None);
        commit_import_impl(
            &tx,
            &snapshot,
            &[decision("i1", "import_as_new", None)],
            900,
        )
        .unwrap();
        tx.commit().unwrap();

        let tx = conn.transaction().unwrap();
        let organization = crate::load_organization(&tx).unwrap();
        let members = &organization.prompt_order_by_folder[""];
        assert_eq!(members.len(), 2);
        assert_eq!(members[0], "l1");
        assert_eq!(organization.pinned_order.len(), 1);
        assert_eq!(organization.pinned_order[0], members[1]);
    }
}
