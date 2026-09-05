# 2026-09-03 导入冲突处理与未保存保护

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

> 后续变更：用户已明确把“使用导入版本”改为包括 ID 和使用历史的完整替换，并要求比较页可调整布局。以下保留原实现记录；最新规则与验证见 `2026-09-03-import-full-replacement-resizable-layout.md`。

## Summary

实现 PRD `docs/PRD/Prompt导入冲突处理与未保存保护需求文档.md`（v1.2）的两项增量需求：

1. 追加导入安全化：同名/同 ID 冲突不再静默覆盖，改为预检查分类（新增/完全相同/需比较）→ 全页逐条比较 → 摘要 → 事务提交（后端重验决策）。
2. 未保存保护：编辑器维护保存基线，切换/新建/导入/删除/关窗/托盘退出前先确认（保存并继续 / 放弃修改 / 取消）。

## Motivation

- 旧 `import_prompts(replace=false)` 在用户不知情时用导入版本覆盖同名本地 Prompt（main.rs 旧同名 UPDATE 分支）。
- 编辑器切换 Prompt、新建、关窗会静默丢弃未保存输入。

## Affected files

**Rust**
- `src-tauri/src/import_logic.rs`（新）：纯函数 `normalize_title` / `tag_set` / `business_equal` / `find_candidates` / `classify` / `precheck` / `read_import_file`（含文件内重复 id 校验）/ `precheck_snapshot_matches` / `commit_import_impl`（完整快照重验 + 事务执行）；内含 16 个单元测试。
- `src-tauri/src/main.rs`：
  - `import_prompts` 仅保留覆盖模式（`replace=false` 返回 `import.append_removed`）。
  - 新命令：`precheck_import(path)`（只读）、`precheck_import_snapshot(prompts)`（stale 后复用内存文件快照）、`commit_import(precheck, decisions)`（携带完整预检查快照并在事务内逐项重验）、`resolve_close(allow)`、`resolve_quit(allow)`、`set_manager_guard_ready(ready)`。
  - `on_window_event` 统一拦截 manager 窗口关闭（原仅 macOS）；托盘 quit 改为握手。
  - 新 managed state：`CloseGate` / `QuitGate` / `ManagerGuardReady`；仅在前端保护监听就绪后发起握手，并在后台等待明确答复，不设自动放行超时。

**前端**
- `src/lib/api.ts`：新类型 `ImportPrecheck` / `PrecheckItem` / `ImportDecision` / `ImportResult`；`precheckImport` / `commitImport` / `resolveClose` / `resolveQuit`；`importPrompts` 改为 replace-only 签名。
- `src/lib/compare.ts`（新）：`titleKey`（与 Rust 同规则）、`diffLines`（行级 LCS + 变化行内字符级高亮，公共前后缀裁剪）、`shortId`（集合内唯一缩略 ID）。
- `src/lib/unsaved.ts`（新）：`EditorSnapshot` / `snapshotFromPrompt` / `isDirty`。
- `src/lib/confirm-dialog.ts`（新）：Promise 化确认对话框单例。
- `src/lib/i18n.ts`：约 50 个新键（zh/en 成对）；新错误映射 `import.duplicate_id` / `stale_plan` / `target_conflict` / `invalid_decision` / `append_removed`；修订 `importConfirmMessage` 旧文案。
- `src/components/ConfirmLeaveDialog.vue`（新）：未保存三按钮 / 放弃比较双按钮两种模式，Esc 取非破坏性选项；包含 `aria-modal`、Tab 焦点循环和取消后的焦点恢复。
- `src/components/import/ImportComparePage.vue`（新）：全页比较——左侧冲突列表（已处理/未处理）、多候选目标选择器（初始不预选，展示 title/folder/tags/创建与更新时间/可复制唯一缩略 ID）、并排字段比较、BodyDiff、三操作（不预选）、目标冲突提示、保存选择并下一条、取消导入（Esc 同语义，有进度时确认放弃）。
- `src/components/import/BodyDiff.vue`（新）：双栏差异表，+/−/~ 文字标记 + 颜色，无相似度百分比。
- `src/components/import/ImportSummaryPage.vue`（新）：六项计数、逐条决策（use_imported 显示目标标题/folder/shortId）、点击返回修改、确认导入。
- `src/components/ManagerApp.vue`：视图切换（editor/compare/summary）、保存基线与 `isDirty`、"未保存"文字标签、`guardUnsaved`（挂接 select/newPrompt/doImport/remove，并在放弃时实际恢复基线）、`performSave`（空标题显式报错）、刷新快捷键/`beforeunload` 保护、`doImport` 重写（追加→precheck→比较或直接提交；stale_plan → 清会话并基于内存文件快照重预检查，不自动提交）、`manager-close-requested` / `tray-quit-requested` 监听与就绪握手。
- `tests/compare.test.ts`、`tests/unsaved.test.ts`（新）+ `package.json` test 脚本。

## Key decisions

- **提交载荷为完整预检查快照**：`commit_import` 接收 imported Prompt、原分类及原候选快照；后端在同一事务内重建当前预检查并核对分类、候选 ID 集合和候选业务字段。候选增加/减少、业务字段变化或 New/Identical/Conflict 转换均返回 `import.stale_plan`；仅 useCount/lastUsedAt/时间字段漂移不阻断。
- **stale 后不重读文件**：使用原预检查中的 imported Prompt 数组调用 `precheck_import_snapshot`，清除旧决策并基于最新本地快照重新分类。
- **决策必须恰好覆盖 Conflict 集**：New/Identical 项带决策、Conflict 缺少决策、无效目标或重复更新目标均由后端拒绝。
- **无需比较路径**：前端以空 decisions 调 `commit_import`，事务内重验兜底（AC-33A）。
- **use_imported**：`UPDATE title,body,tags,folder,favorite,updated_at`，保留本地 id/useCount/lastUsedAt/createdAt；统一 commit_ts。
- **import_as_new**：新 UUID、useCount=0、lastUsedAt=null、createdAt=updatedAt=commit_ts、标题不改。
- **关闭握手**：前端监听注册后设置 guard-ready；prevent_close → emit → 后台 mpsc 等待 `resolve_close`/`resolve_quit` 的明确答复。监听未就绪、事件发送失败或通道异常均拒绝关闭；Windows destroy 窗口、macOS 隐藏（沿用原语义）。
- 比较页状态机：drafts（草稿）/saved（已确认）分离；修改已处理项（含换目标）自动回退未处理；摘要页可点击返回；v-show 保持比较页实例以免丢草稿。

## Validation

- `cargo fmt --check` / `cargo check` / `cargo test`（22 passed，含新增 16 个导入逻辑测试；覆盖候选业务字段变化、候选集合变化和 Identical→New 漂移）
- `npm test`（40 passed，含新增 compare/unsaved 17 个）
- `npm run build`（vue-tsc + vite 通过）
- 手动 Tauri 运行验证（Windows 关窗/托盘退出/比较页交互）未执行，需要用户手动验证。

## Remaining risks / follow-up

- macOS 行为（隐藏窗口 vs destroy、ActivationPolicy）按代码逻辑保留，需在 macOS 实测。
- `deleteConfirm` 仍用原生 confirm；屏幕阅读器完整可用性未验证。
- 比较页滚动同步：BodyDiff 使用单表格双栏（行级对齐），无独立双滚动条同步问题；超长正文性能依赖前后缀裁剪。
