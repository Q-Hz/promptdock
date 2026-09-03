use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::Prompt;

// 手动组织结果：文件夹顺序、各文件夹内的提示词顺序、置顶区顺序。
// 顺序只描述排列，不承载归属（folder）或置顶状态（pinned）。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Organization {
    pub folder_order: Vec<String>,
    pub prompt_order_by_folder: BTreeMap<String, Vec<String>>,
    pub pinned_order: Vec<String>,
}

// 导入文件里的顺序元数据。字段类型无效时只让该字段回退，不阻断整批导入。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RawOrganization {
    pub invalid_fields: bool,
    pub folder_order: Option<Vec<String>>,
    pub prompt_order_by_folder: Option<BTreeMap<String, Vec<String>>>,
    pub pinned_order: Option<Vec<String>>,
}

fn string_array(value: Option<&Value>) -> Option<Vec<String>> {
    value?
        .as_array()?
        .iter()
        .map(|item| item.as_str().map(String::from))
        .collect()
}

fn string_map(value: Option<&Value>) -> Option<BTreeMap<String, Vec<String>>> {
    value?
        .as_object()?
        .iter()
        .map(|(key, value)| string_array(Some(value)).map(|items| (key.clone(), items)))
        .collect()
}

pub fn parse_raw_organization(value: Option<&Value>) -> Option<RawOrganization> {
    let value = value?;
    let Some(object) = value.as_object() else {
        return Some(RawOrganization {
            invalid_fields: true,
            ..Default::default()
        });
    };
    let folder_order = string_array(object.get("folderOrder"));
    let prompt_order_by_folder = string_map(object.get("promptOrderByFolder"));
    let pinned_order = string_array(object.get("pinnedOrder"));
    Some(RawOrganization {
        invalid_fields: (object.contains_key("folderOrder") && folder_order.is_none())
            || (object.contains_key("promptOrderByFolder") && prompt_order_by_folder.is_none())
            || (object.contains_key("pinnedOrder") && pinned_order.is_none()),
        folder_order,
        prompt_order_by_folder,
        pinned_order,
    })
}

impl RawOrganization {
    pub fn was_adjusted(&self, prompts: &[Prompt]) -> bool {
        let normalized = Organization::from_import(prompts, Some(self));
        self.invalid_fields
            || self
                .folder_order
                .as_ref()
                .is_some_and(|v| v != &normalized.folder_order)
            || self
                .pinned_order
                .as_ref()
                .is_some_and(|v| v != &normalized.pinned_order)
            || self
                .prompt_order_by_folder
                .as_ref()
                .is_some_and(|map| map != &normalized.prompt_order_by_folder)
    }
}

// 兜底排序：数据库查询没有 ORDER BY，任何补全都必须使用稳定标识而不是返回顺序。
fn fallback_rank(prompt: &Prompt) -> (i64, String) {
    (prompt.created_at, prompt.id.clone())
}

fn dedup(items: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(item.clone()))
        .collect()
}

fn push_unique(list: &mut Vec<String>, item: String) {
    if !list.iter().any(|existing| *existing == item) {
        list.push(item);
    }
}

impl Organization {
    // 与真实数据对齐：丢弃陈旧 ID、补全漏列成员、新文件夹追加到末尾。
    // 空文件夹仍保留在 folder_order 中，以便再次出现时恢复原位置。
    pub fn normalize(&mut self, prompts: &[Prompt]) {
        let mut members: BTreeMap<String, Vec<Prompt>> = BTreeMap::new();
        for prompt in prompts {
            members
                .entry(prompt.folder.clone())
                .or_default()
                .push(prompt.clone());
        }
        for list in members.values_mut() {
            list.sort_by_key(fallback_rank);
        }

        let known = dedup(self.folder_order.clone());
        let mut listed: BTreeSet<String> = known.iter().cloned().collect();
        let mut missing: Vec<&String> = members
            .keys()
            .filter(|folder| !listed.contains(*folder))
            .collect();
        missing.sort_by(|a, b| {
            let first = |folder: &&String| {
                members
                    .get(*folder)
                    .and_then(|list| list.first())
                    .map(fallback_rank)
            };
            first(a).cmp(&first(b)).then(a.cmp(b))
        });
        let mut folder_order = known.clone();
        for folder in missing {
            listed.insert(folder.clone());
            folder_order.push(folder.clone());
        }
        self.folder_order = folder_order;

        let mut prompt_order = BTreeMap::new();
        for (folder, list) in &members {
            let member_ids: BTreeSet<&str> = list.iter().map(|p| p.id.as_str()).collect();
            let mut ordered: Vec<String> = Vec::new();
            let mut seen = BTreeSet::new();
            if let Some(saved) = self.prompt_order_by_folder.get(folder) {
                for id in saved {
                    if member_ids.contains(id.as_str()) && seen.insert(id.as_str()) {
                        ordered.push(id.clone());
                    }
                }
            }
            for prompt in list {
                if seen.insert(prompt.id.as_str()) {
                    ordered.push(prompt.id.clone());
                }
            }
            prompt_order.insert(folder.clone(), ordered);
        }
        self.prompt_order_by_folder = prompt_order;

        let pinned: BTreeSet<&str> = prompts
            .iter()
            .filter(|p| p.pinned)
            .map(|p| p.id.as_str())
            .collect();
        let mut pinned_order: Vec<String> = Vec::new();
        let mut seen = BTreeSet::new();
        for id in &self.pinned_order {
            if pinned.contains(id.as_str()) && seen.insert(id.as_str()) {
                pinned_order.push(id.clone());
            }
        }
        let mut rest: Vec<&Prompt> = prompts
            .iter()
            .filter(|p| p.pinned && !seen.contains(p.id.as_str()))
            .collect();
        rest.sort_by_key(|p| fallback_rank(p));
        for prompt in rest {
            pinned_order.push(prompt.id.clone());
        }
        self.pinned_order = pinned_order;
    }

    // 按文件出现顺序建立顺序，元数据中有效且属于该归属的条目优先。
    pub fn from_import(prompts: &[Prompt], raw: Option<&RawOrganization>) -> Organization {
        let mut organization = Organization::default();

        let mut file_folders: Vec<String> = Vec::new();
        let mut file_members: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for prompt in prompts {
            push_unique(&mut file_folders, prompt.folder.clone());
            file_members
                .entry(prompt.folder.clone())
                .or_default()
                .push(prompt.id.clone());
        }

        let mut folder_order: Vec<String> = Vec::new();
        if let Some(listed) = raw.and_then(|raw| raw.folder_order.as_ref()) {
            for folder in listed {
                if file_folders.iter().any(|known| known == folder) {
                    push_unique(&mut folder_order, folder.clone());
                }
            }
        }
        for folder in &file_folders {
            push_unique(&mut folder_order, folder.clone());
        }
        organization.folder_order = folder_order;

        for (folder, members) in &file_members {
            let member_set: BTreeSet<&str> = members.iter().map(String::as_str).collect();
            let mut ordered: Vec<String> = Vec::new();
            if let Some(listed) = raw
                .and_then(|raw| raw.prompt_order_by_folder.as_ref())
                .and_then(|map| map.get(folder))
            {
                for id in listed {
                    if member_set.contains(id.as_str()) {
                        push_unique(&mut ordered, id.clone());
                    }
                }
            }
            for id in members {
                push_unique(&mut ordered, id.clone());
            }
            organization
                .prompt_order_by_folder
                .insert(folder.clone(), ordered);
        }

        let pinned_in_file: Vec<String> = prompts
            .iter()
            .filter(|prompt| prompt.pinned)
            .map(|prompt| prompt.id.clone())
            .collect();
        let pinned_set: BTreeSet<&str> = pinned_in_file.iter().map(String::as_str).collect();
        let mut pinned_order: Vec<String> = Vec::new();
        if let Some(listed) = raw.and_then(|raw| raw.pinned_order.as_ref()) {
            for id in listed {
                if pinned_set.contains(id.as_str()) {
                    push_unique(&mut pinned_order, id.clone());
                }
            }
        }
        for id in &pinned_in_file {
            push_unique(&mut pinned_order, id.clone());
        }
        organization.pinned_order = pinned_order;

        organization
    }

    // 升级时一次性采用旧排序规则（收藏优先、最近使用、稳定 ID 兜底）生成的顺序。
    pub fn legacy(prompts: &[Prompt]) -> Organization {
        let mut sorted: Vec<Prompt> = prompts.to_vec();
        sorted.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then(
                    b.last_used_at
                        .unwrap_or(0)
                        .cmp(&a.last_used_at.unwrap_or(0)),
                )
                .then(a.id.cmp(&b.id))
        });
        Organization::from_import(&sorted, None)
    }

    // 导出只包含当前真实文件夹、成员和置顶项。
    pub fn for_export(&self, prompts: &[Prompt]) -> Organization {
        let mut exported = self.clone();
        exported.normalize(prompts);
        let real: BTreeSet<&str> = prompts
            .iter()
            .map(|prompt| prompt.folder.as_str())
            .collect();
        exported
            .folder_order
            .retain(|folder| real.contains(folder.as_str()));
        exported
            .prompt_order_by_folder
            .retain(|folder, _| real.contains(folder.as_str()));
        exported
    }

    pub fn add_prompt(&mut self, prompt: &Prompt) {
        push_unique(&mut self.folder_order, prompt.folder.clone());
        let list = self
            .prompt_order_by_folder
            .entry(prompt.folder.clone())
            .or_default();
        push_unique(list, prompt.id.clone());
        if prompt.pinned {
            push_unique(&mut self.pinned_order, prompt.id.clone());
        }
    }

    pub fn remove_prompt(&mut self, id: &str, folder: &str) {
        if let Some(list) = self.prompt_order_by_folder.get_mut(folder) {
            list.retain(|existing| existing != id);
        }
        self.pinned_order.retain(|existing| existing != id);
    }

    // 完整替换记录时同步 ID 引用，保留原有位置（PRD 5.4.4/5.4.6）。
    pub fn rename_prompt(&mut self, old_id: &str, new_id: &str) {
        if old_id == new_id {
            return;
        }
        for list in self.prompt_order_by_folder.values_mut() {
            for slot in list.iter_mut() {
                if slot == old_id {
                    *slot = new_id.to_string();
                }
            }
        }
        for slot in self.pinned_order.iter_mut() {
            if slot == old_id {
                *slot = new_id.to_string();
            }
        }
    }

    pub fn move_prompt(&mut self, id: &str, from: &str, to: &str, index: Option<usize>) {
        if let Some(list) = self.prompt_order_by_folder.get_mut(from) {
            list.retain(|existing| existing != id);
        }
        push_unique(&mut self.folder_order, to.to_string());
        let list = self
            .prompt_order_by_folder
            .entry(to.to_string())
            .or_default();
        list.retain(|existing| existing != id);
        match index {
            Some(position) => list.insert(position.min(list.len()), id.to_string()),
            None => list.push(id.to_string()),
        }
    }

    pub fn set_pinned(&mut self, id: &str, pinned: bool) {
        if pinned {
            push_unique(&mut self.pinned_order, id.to_string());
        } else {
            self.pinned_order.retain(|existing| existing != id);
        }
    }

    // 只重排给定条目占据的位置，未列出的（当前隐藏的空文件夹）保持原槽位。
    pub fn apply_folder_order(&mut self, given: &[String]) {
        let known: BTreeSet<&str> = self.folder_order.iter().map(String::as_str).collect();
        let requested = dedup(
            given
                .iter()
                .filter(|folder| known.contains(folder.as_str()))
                .cloned()
                .collect(),
        );
        let listed: BTreeSet<String> = requested.iter().cloned().collect();
        let mut fill = requested.into_iter();
        let mut next: Vec<String> = Vec::new();
        for folder in &self.folder_order {
            if listed.contains(folder.as_str()) {
                match fill.next() {
                    Some(replacement) => next.push(replacement),
                    None => next.push(folder.clone()),
                }
            } else {
                next.push(folder.clone());
            }
        }
        next.extend(fill);
        self.folder_order = next;
    }

    pub fn apply_prompt_order(&mut self, folder: &str, given: &[String]) {
        let members = self
            .prompt_order_by_folder
            .get(folder)
            .cloned()
            .unwrap_or_default();
        let member_set: BTreeSet<&str> = members.iter().map(String::as_str).collect();
        let mut next = dedup(
            given
                .iter()
                .filter(|id| member_set.contains(id.as_str()))
                .cloned()
                .collect(),
        );
        let listed: BTreeSet<String> = next.iter().cloned().collect();
        for id in &members {
            if !listed.contains(id.as_str()) {
                next.push(id.clone());
            }
        }
        self.prompt_order_by_folder.insert(folder.to_string(), next);
    }

    pub fn apply_pinned_order(&mut self, given: &[String]) {
        let previous = self.pinned_order.clone();
        let member_set: BTreeSet<&str> = previous.iter().map(String::as_str).collect();
        let mut next = dedup(
            given
                .iter()
                .filter(|id| member_set.contains(id.as_str()))
                .cloned()
                .collect(),
        );
        let listed: BTreeSet<String> = next.iter().cloned().collect();
        for id in &previous {
            if !listed.contains(id.as_str()) {
                next.push(id.clone());
            }
        }
        self.pinned_order = next;
    }

    // 按顺序元数据排列导入文件中的提示词，用于新增记录之间的相对位置。
    pub fn import_sequence(prompts: &[Prompt], organization: &Organization) -> Vec<Prompt> {
        let folder_rank: BTreeMap<&str, usize> = organization
            .folder_order
            .iter()
            .enumerate()
            .map(|(index, folder)| (folder.as_str(), index))
            .collect();
        let position_rank: BTreeMap<&str, usize> = organization
            .prompt_order_by_folder
            .values()
            .flatten()
            .enumerate()
            .map(|(index, id)| (id.as_str(), index))
            .collect();
        let mut sorted = prompts.to_vec();
        sorted.sort_by(|a, b| {
            let key = |prompt: &Prompt| {
                (
                    folder_rank
                        .get(prompt.folder.as_str())
                        .copied()
                        .unwrap_or(usize::MAX),
                    position_rank
                        .get(prompt.id.as_str())
                        .copied()
                        .unwrap_or(usize::MAX),
                )
            };
            key(a).cmp(&key(b))
        });
        sorted
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prompt(id: &str, folder: &str) -> Prompt {
        Prompt {
            id: id.into(),
            title: id.into(),
            body: String::new(),
            tags: vec![],
            folder: folder.into(),
            favorite: false,
            pinned: false,
            use_count: 0,
            last_used_at: None,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn ids(list: &[String]) -> Vec<&str> {
        list.iter().map(String::as_str).collect()
    }

    #[test]
    fn normalize_appends_new_folders_and_members_and_drops_stale_ids() {
        let mut organization = Organization {
            folder_order: vec!["A".into(), "gone".into()],
            prompt_order_by_folder: BTreeMap::from([(
                "A".to_string(),
                vec!["a2".into(), "deleted".into(), "a1".into()],
            )]),
            pinned_order: vec!["deleted".into()],
        };
        let mut a1 = prompt("a1", "A");
        a1.created_at = 5;
        let a2 = prompt("a2", "A");
        let b1 = prompt("b1", "B");
        organization.normalize(&[a1.clone(), a2.clone(), b1.clone()]);

        // 空文件夹偏好保留，新文件夹追加到末尾
        assert_eq!(ids(&organization.folder_order), ["A", "gone", "B"]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a2", "a1"]
        );
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("B").unwrap()),
            ["b1"]
        );
        assert!(organization.pinned_order.is_empty());
    }

    #[test]
    fn normalize_fills_missing_members_with_a_stable_fallback() {
        let mut organization = Organization {
            folder_order: vec!["A".into()],
            prompt_order_by_folder: BTreeMap::from([("A".to_string(), vec!["a2".into()])]),
            pinned_order: vec![],
        };
        let mut a1 = prompt("a1", "A");
        a1.created_at = 2;
        let mut a3 = prompt("a3", "A");
        a3.created_at = 9;
        let a2 = prompt("a2", "A");
        organization.normalize(&[a1, a2, a3]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a2", "a1", "a3"]
        );
    }

    #[test]
    fn normalize_keeps_pinned_entries_and_appends_unlisted_pins() {
        let mut organization = Organization {
            folder_order: vec![],
            prompt_order_by_folder: BTreeMap::new(),
            pinned_order: vec!["p2".into(), "gone".into()],
        };
        let mut p1 = prompt("p1", "A");
        p1.pinned = true;
        p1.created_at = 3;
        let mut p2 = prompt("p2", "A");
        p2.pinned = true;
        p2.created_at = 1;
        let p3 = prompt("p3", "A");
        organization.normalize(&[p1, p2, p3]);
        assert_eq!(ids(&organization.pinned_order), ["p2", "p1"]);
    }

    #[test]
    fn legacy_uses_favorite_then_recency_then_id() {
        let mut fav_old = prompt("fav-old", "A");
        fav_old.favorite = true;
        fav_old.last_used_at = Some(10);
        let mut fav_new = prompt("fav-new", "B");
        fav_new.favorite = true;
        fav_new.last_used_at = Some(90);
        let plain = prompt("plain", "A");
        let tie_a = prompt("tie-a", "B");
        let tie_b = prompt("tie-b", "B");
        let organization = Organization::legacy(&[plain, tie_b, fav_old, tie_a, fav_new]);
        assert_eq!(ids(&organization.folder_order), ["B", "A"]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("B").unwrap()),
            ["fav-new", "tie-a", "tie-b"]
        );
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["fav-old", "plain"]
        );
    }

    #[test]
    fn from_import_prefers_metadata_and_degrades_per_field() {
        let prompts = vec![prompt("a1", "A"), prompt("a2", "A"), prompt("b1", "B")];
        let raw = RawOrganization {
            invalid_fields: false,
            folder_order: Some(vec!["B".into(), "A".into(), "ghost".into()]),
            // 类型无效：该字段回退到文件顺序
            prompt_order_by_folder: None,
            pinned_order: Some(vec!["a2".into()]),
        };
        let organization = Organization::from_import(&prompts, Some(&raw));
        assert_eq!(ids(&organization.folder_order), ["B", "A"]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a1", "a2"]
        );
        // 非置顶 ID 不参与置顶排列
        assert!(organization.pinned_order.is_empty());

        let mut pinned = prompt("a2", "A");
        pinned.pinned = true;
        let prompts = vec![prompt("a1", "A"), pinned];
        let organization = Organization::from_import(&prompts, Some(&raw));
        assert_eq!(ids(&organization.pinned_order), ["a2"]);
    }

    #[test]
    fn parse_raw_organization_tolerates_invalid_field_types() {
        let value = serde_json::json!({
            "folderOrder": ["A", "B"],
            "promptOrderByFolder": 7,
            "pinnedOrder": ["x", 3],
        });
        let raw = parse_raw_organization(Some(&value)).unwrap();
        assert_eq!(
            raw.folder_order.unwrap(),
            vec!["A".to_string(), "B".to_string()]
        );
        assert!(raw.prompt_order_by_folder.is_none());
        assert!(raw.pinned_order.is_none());
        assert!(
            parse_raw_organization(Some(&serde_json::json!(3)))
                .unwrap()
                .invalid_fields
        );
        assert!(parse_raw_organization(None).is_none());
    }

    #[test]
    fn apply_folder_order_keeps_hidden_folders_in_their_slots() {
        let mut organization = Organization {
            folder_order: vec!["A".into(), "empty".into(), "B".into(), "C".into()],
            prompt_order_by_folder: BTreeMap::new(),
            pinned_order: vec![],
        };
        organization.apply_folder_order(&["C".into(), "A".into(), "B".into()]);
        assert_eq!(ids(&organization.folder_order), ["C", "empty", "A", "B"]);
    }

    #[test]
    fn apply_folder_order_ignores_unknown_names() {
        let mut organization = Organization {
            folder_order: vec!["A".into(), "B".into()],
            prompt_order_by_folder: BTreeMap::new(),
            pinned_order: vec![],
        };
        organization.apply_folder_order(&["ghost".into(), "B".into(), "A".into()]);
        assert_eq!(ids(&organization.folder_order), ["B", "A"]);
    }

    #[test]
    fn apply_prompt_order_appends_unlisted_members() {
        let mut organization = Organization {
            folder_order: vec!["A".into()],
            prompt_order_by_folder: BTreeMap::from([(
                "A".to_string(),
                vec!["a1".into(), "a2".into(), "a3".into()],
            )]),
            pinned_order: vec![],
        };
        organization.apply_prompt_order("A", &["a3".into(), "a1".into(), "ghost".into()]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a3", "a1", "a2"]
        );
    }

    #[test]
    fn move_prompt_shifts_membership_between_folders() {
        let mut organization = Organization {
            folder_order: vec!["A".into(), "B".into()],
            prompt_order_by_folder: BTreeMap::from([
                ("A".to_string(), vec!["a1".into(), "a2".into()]),
                ("B".to_string(), vec!["b1".into()]),
            ]),
            pinned_order: vec![],
        };
        organization.move_prompt("a2", "A", "B", Some(0));
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a1"]
        );
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("B").unwrap()),
            ["a2", "b1"]
        );
        assert_eq!(ids(&organization.folder_order), ["A", "B"]);

        organization.move_prompt("a1", "A", "New", None);
        assert_eq!(ids(&organization.folder_order), ["A", "B", "New"]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("New").unwrap()),
            ["a1"]
        );
    }

    #[test]
    fn set_pinned_appends_and_removes_only_the_shortcut() {
        let mut organization = Organization {
            folder_order: vec!["A".into()],
            prompt_order_by_folder: BTreeMap::from([(
                "A".to_string(),
                vec!["a1".into(), "a2".into()],
            )]),
            pinned_order: vec![],
        };
        organization.set_pinned("a2", true);
        organization.set_pinned("a1", true);
        assert_eq!(ids(&organization.pinned_order), ["a2", "a1"]);
        organization.set_pinned("a2", false);
        assert_eq!(ids(&organization.pinned_order), ["a1"]);
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["a1", "a2"]
        );
    }

    #[test]
    fn rename_prompt_keeps_positions() {
        let mut organization = Organization {
            folder_order: vec!["A".into()],
            prompt_order_by_folder: BTreeMap::from([(
                "A".to_string(),
                vec!["old".into(), "keep".into()],
            )]),
            pinned_order: vec!["old".into()],
        };
        organization.rename_prompt("old", "new");
        assert_eq!(
            ids(organization.prompt_order_by_folder.get("A").unwrap()),
            ["new", "keep"]
        );
        assert_eq!(ids(&organization.pinned_order), ["new"]);
    }

    #[test]
    fn for_export_drops_empty_folders() {
        let organization = Organization {
            folder_order: vec!["A".into(), "empty".into()],
            prompt_order_by_folder: BTreeMap::from([
                ("A".to_string(), vec!["a1".into()]),
                ("empty".to_string(), vec![]),
            ]),
            pinned_order: vec![],
        };
        let exported = organization.for_export(&[prompt("a1", "A")]);
        assert_eq!(ids(&exported.folder_order), ["A"]);
        assert!(!exported.prompt_order_by_folder.contains_key("empty"));
    }

    #[test]
    fn import_sequence_follows_metadata_order() {
        let prompts = vec![prompt("b1", "B"), prompt("a2", "A"), prompt("a1", "A")];
        let organization = Organization::from_import(
            &prompts,
            Some(&RawOrganization {
                invalid_fields: false,
                folder_order: Some(vec!["A".into(), "B".into()]),
                prompt_order_by_folder: Some(BTreeMap::from([(
                    "A".to_string(),
                    vec!["a2".into(), "a1".into()],
                )])),
                pinned_order: None,
            }),
        );
        let ordered = Organization::import_sequence(&prompts, &organization);
        assert_eq!(
            ordered.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
            ["a2", "a1", "b1"]
        );
    }
}
