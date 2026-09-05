# 2026-09-03 管理界面文件夹布局与排序

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 范围与依据

实现 `docs/PRD/管理界面文件夹布局与排序需求文档.md`（用户已于 2026-09-03 确认全部参数，无待确认前置条件），FR-01～FR-06 与 AC-01～AC-31 全部纳入本期：

1. FR-01 可调布局：左右分隔条（默认可用宽度 28%，夹在 240–420px；最小 220px，最大可用宽度 45%，右侧不小于 480px）、每个文件夹条目视口的底部高度调节柄（默认 40%，上限 60%，下限约 3 行）、右侧正文与变量提示区之间的分隔条；搜索框固定在导航顶部，各区域独立滚动；鼠标 + 触控板 + 键盘（方向键微调、Shift 粗调、双击/Enter 复位）；尺寸与折叠状态跨重启保留，但不进导出 JSON。
2. FR-02 折叠与分批：默认展开、最多 5 条，超出显示“显示更多（剩余 N 条）”，每次增加不超过 5 条；超过 5 条时提供“收起列表”（回到 5 条并把视口滚回顶部）；文件夹计数始终是真实总数；展开/折叠持久化，已展示条数仅当前会话；搜索覆盖折叠与未显示条目、临时展开命中文件夹、显示“匹配 M / 共 N”，非空搜索禁用拖动排序并提示“清空搜索后可拖动排序”，但保留“移动到文件夹”。
3. FR-03 文件夹位置独立持久化，不再由已排序提示词推导；收藏、置顶、使用、编辑、保存都不移动文件夹。
4. FR-04 收藏与置顶是两个独立操作（不同图标、文案与可访问名称）；置顶项进入顶部独立“置顶”快捷区（为空时隐藏），同时保留在原文件夹，引用同一 ID；调用窗口排序改为置顶优先（按置顶顺序）+ 最近使用，收藏不再参与优先级。
5. FR-05 新版读旧 JSON：缺失 `pinned` 规范化为 `false`；显式 `null`/字符串/数字视为无效字段并中止该批导入；新版导出始终显式输出 `pinned`。
6. FR-06 排序与移动：文件夹拖动 + 上移/下移菜单；文件夹内提示词拖动 + 上移/下移/移到文件夹末尾菜单；跨文件夹拖动到标题（追加到真实末尾）或插入线（按索引插入）、折叠文件夹悬停临时展开、“移动到文件夹”可搜索弹层、“未分类”使用空字符串键、Esc/无效落点不改动数据；移动原子完成（归属更新 + 源顺序移除 + 目标插入），保留 ID/正文/标签/收藏/置顶/创建时间与使用记录，两个入口同步，并让被移动项可见。

另外：导出新增顶层 `organization` 元数据（folderOrder / promptOrderByFolder / pinnedOrder），保留 `format` 与 `version: 1`；导入按字段宽容降级；`pinned` 纳入业务字段比较、比较页展示与快照重验；未保存草稿保护改为定向字段同步，跨文件夹移动命中脏草稿时复用“保存并继续 / 放弃修改 / 取消”。

## 实现

### 数据层（Rust）

- `src-tauri/src/organization.rs`（新）：`Organization { folderOrder, promptOrderByFolder, pinnedOrder }` 与宽松解析用的 `RawOrganization`。方法包括 `normalize`（丢弃陈旧 ID、补全漏列成员、保留空文件夹在 folderOrder 中的槽位）、`from_import`、`legacy`（升级前规则：收藏 → 最近使用 → ID）、`for_export`（剔除空文件夹）、`add_prompt` / `remove_prompt` / `rename_prompt` / `move_prompt` / `set_pinned`、三个 `apply_*_order`（保留隐藏空文件夹槽位的归并）与 `import_sequence`。兜底排序使用 `(created_at, id)`，不依赖无 ORDER BY 的查询结果。含 13 个单元测试。
- `src-tauri/src/main.rs`：
  - `prompts` 增加 `pinned INTEGER NOT NULL DEFAULT 0`，先用 `pragma_table_info` 判断再 `ALTER TABLE`，可重复执行；新表 `organization`（单行 JSON，`id = 1`）与 `ui_prefs(k, v)`。
  - 启动时 `ensure_organization` 仅在表为空时按升级前规则建立一次顺序，之后重启不再重排。
  - `list_prompts` 改为 `load_library`，返回 `{ prompts, organization }`；`save_prompt` 依据修改前后的 `folder` / `pinned` 增量更新顺序（新增 → `add_prompt`，改归属 → `move_prompt`，置顶状态翻转 → `set_pinned`）；`delete_prompt` 同步移除成员与置顶引用；`mark_used` 明确不参与排序。
  - 新命令：`set_favorite`、`set_pinned`、`set_folder_order`、`set_prompt_order`、`set_pinned_order`、`move_prompt`、`get_ui_prefs`、`set_ui_prefs`；`generate_handler!` 同步更新。
  - `move_prompt_impl` 在事务内完成归属更新、源顺序移除、目标位置插入与 `normalize`，任何一步失败整体回滚（测试用 `BEFORE INSERT` 触发器制造写入失败验证）。
  - 导出写入 `organization`（`for_export`）；`Prompt.pinned` 使用 `#[serde(default)]`，因此旧文件缺字段可读、新导出始终显式为布尔值。
  - 导入：`validate_import_document` 预扫描每条记录的 `pinned`，非布尔值返回 `import.invalid_pinned` 并中止整批；`organization` 元数据按字段降级（类型无效只回退该字段），预检查与快照重验都携带该元数据。
- `src-tauri/src/import_logic.rs`：`business_equal` 纳入 `pinned`；新增 `ImportFile`，`ImportPrecheck` 携带 `organization`；`commit_import_impl` 在存在文件元数据时按 `import_sequence` 遍历，分支内分别 `add_prompt` / `move_prompt` / `rename_prompt` / `set_pinned`，最后 `normalize` 并落库；`use_imported` 的 UPDATE 增加 `pinned`。新增 2 个测试（成员与置顶快捷入口同步、作为新 Prompt 导入时追加到目标文件夹与置顶区）。

### 前端

- `src/lib/api.ts`：`Prompt.pinned`、`Organization` / `Library` / `PromptUpdate` 类型、上述新命令封装；`precheckImportSnapshot(prompts, organization)`；移除 `listPrompts` 与 `sortPrompts`。
- `src/lib/organization.ts`（新）：纯函数视图与排序算术——`arrangeFolders`（隐藏空文件夹，未登记文件夹按最早创建时间再按名称追加）、`arrangePinned`、`orderMembers`、`sortLauncher`、`reorder` / `reorderIndex` / `shift` / `moveWithin`、`batchView` / `nextBatch`；`BATCH_SIZE = 5`，置顶区键 `PINNED_SECTION_KEY` 使用空字符前缀，避免与真实文件夹名（含“未分类”）冲突。
- `src/lib/layout-prefs.ts`（新）：`manager-layout` 偏好的宽容解析与序列化（`sidebarRatio` / `editorRatio` / `folderHeights` / `collapsed`），字段缺失或类型错误只回退该字段。
- `src/lib/drag-state.ts`（新）：拖动载荷放在共享 `ref` 中（dragover 期间读不到 dataTransfer），并统一定义落点类型（`prompt-row` / `folder-header` / `folder-end`）。
- `src/lib/split-pane.ts`：`splitBounds` / `clampSplit` 增加 `maxFirstRatio`；新增 `clampTo`、`ITEM_ROW_HEIGHT`、`MIN_VISIBLE_ROWS` 与 `folderViewportBounds`（默认 40%、上限 60%、下限约 3 行，空间不足时按比例收敛）。
- `src/lib/unsaved.ts`：快照与脏检查纳入 `pinned`；顺序数据不属于草稿。
- `src/components/import/ResizableSplit.vue`：支持受控/非受控两种模式与 px/ratio 两种单位、默认值按像素区间夹取、`update:modelValue`；`onMounted` 同步测量可用空间（见“验证中发现的问题”）。导入页保持非受控用法，行为不变。
- 新组件：`manager/ActionMenu.vue`（固定定位弹层，避免被条目视口裁切；外部 pointerdown、Esc、滚动、窗口缩放时关闭；可选过滤输入）、`manager/ResizeGrip.vue`（行高调节柄：指针拖动、方向键 ±8、Shift ±32、Home/End、双击或 Enter 复位，完整 separator ARIA 属性）、`manager/FolderSection.vue`（置顶区与文件夹共用一个分区组件：分批、折叠、拖动悬停临时展开、插入线、落点可行性判断、移动到文件夹弹层）。
- `src/components/ManagerApp.vue`：重写导航与编辑区。分区顺序为置顶区在前（为空时隐藏）；计数使用真实总数；搜索覆盖折叠与未显示条目并显示“匹配 M / 共 N”，非空搜索禁用拖动；组织操作只做定向字段同步（`patchPrompt` + `syncEditorField` 只覆盖 title/body/tags/folder/favorite/pinned），不整页刷新，因此不会丢草稿；跨文件夹移动命中脏草稿时走 `guardUnsaved`，保存后按最新成员顺序换算落点；布局偏好 300ms 去抖持久化，且在偏好加载完成前不写库。
- `src/components/LauncherApp.vue`：改用 `loadLibrary`，排序用 `sortLauncher`（置顶优先按置顶顺序，其余按最近使用；收藏不再参与优先级），行内分别显示置顶与收藏标记。
- `src/components/import/ImportComparePage.vue`：字段比较新增置顶行。
- `src/lib/i18n.ts`：中英成对新增约 28 个键（置顶区、分批、折叠、排序与移动菜单、三处分隔条名称、字段与错误文案），并映射 `import.invalid_pinned`、`prompt.not_found`。

### 测试

- `tests/organization.test.ts`（新，16 个）、`tests/layout-prefs.test.ts`（新，6 个），已加入 `package.json` 的 test 脚本。
- `tests/unsaved.test.ts`、`tests/frontend-utils.test.ts`、`tests/browser/import-flow.ts`、`tests/browser/import-layout.ts` 同步 `pinned` 与 `organization` 字段（import-flow 的合成桥接改为提供 `load_library` / `get_ui_prefs` / `set_ui_prefs`）。
- 新浏览器夹具 `tests/browser/manager-layout.html` + `manager-layout.ts` + `manager-layout-checks.js`：挂载真实 `ManagerApp`，用合成 Tauri 边界实现 `load_library`、顺序命令、`move_prompt`、`save_prompt`、`ui_prefs`；数据与偏好存 localStorage，因此重新加载即模拟重启；`w`/`h` 参数模拟管理器窗口尺寸（浏览器视口不等于窗口），`fresh=1` 清空状态。检查模块按 AC 分组，可整体或单组执行。

## 验证

命令与结果：

- `npm test`：63/63 通过（含新增 22 个）。
- `npm run build`（vue-tsc + vite）：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：50/50 通过。覆盖迁移幂等与旧数据保留、顺序只初始化一次且后续启动不重排、移动的成员计数与置顶快捷入口、写入失败时归属与顺序整体回滚、目标缺失时报错不写半成品、`pinned` 缺失与非法类型、`organization` 元数据按字段降级、导入后文件夹成员与置顶区同步。
- `git diff --check`：通过（仅有仓库既有的 LF/CRLF 提示）。

浏览器验证（`npm run dev` + 上述夹具，合成数据，不连接 Tauri 与真实数据库）：

- 1080×720 中文浅色，八组连续执行共 173 条断言全部通过，且没有触发任何错误提示：window 11、structure 19、batch 16、resize 26、order 41、flags 29、search 18、editor 13。
- 重启恢复：先调节侧栏宽度、条目区高度、展开到 15 条并折叠 Writing，重新加载后侧栏比例与宽度、条目区高度、折叠状态恢复，已展示条数回到默认 5 条（6 条断言）。
- AC-01 窗口尺寸：860×560（window 11 + structure 19）、1920×1080（window 11 + resize 26）均通过；三种尺寸下两栏加分隔条正好填满窗口、互不重叠、无整页滚动条、保存与删除始终在窗口内。
- AC-31 英文深色：locale 组 31 条断言通过（置顶区标题与说明、分批文案、计数、搜索匹配计数与禁用拖动提示、行菜单与文件夹菜单全部英文项、三处分隔条英文可访问名称与可聚焦、收藏/置顶独立控件与 `aria-pressed`、弹层为深色表面、长文件夹名与长标题可通过 title 完整查看）。
- AC-27 比较页：中文显示“置顶 否 / 置顶 是 [不同]”，英文显示“Pinned No / Pinned Yes [Different]”。
- 截图：`manager-layout-1080-zh.png`（中文浅色，行菜单展开）、`manager-layout-en-dark.png`（英文深色，行菜单展开）。

## 验证中发现并修复的问题

1. 打开管理器就立刻写入默认布局偏好：加载偏好会触发 `watch(layout, …, { deep: true })`。改为 `layoutLoaded` 门控，只有加载完成后的真实变化才持久化。
2. `ResizableSplit` 首帧把第一栏渲染成 0：可用空间只由 ResizeObserver 回调提供，回调在首帧之后才执行，因此侧栏在打开瞬间、正文在切换到含变量提示词瞬间会塌陷一帧（检查中实测正文高度 26px）。改为 `onMounted` 同步测量内容盒，观察器仍负责后续变化。
3. 提示词行的长标题没有完整查看方式（文件夹标题已有 title 提示）：给行内选择按钮补 `:title="prompt.title"`。

其余失败均为检查脚本自身缺陷（分批后目标行不在可见批次、移动后被移动项已自动展开因此没有“显示更多”、用 `click()` 关闭依赖 pointerdown 的菜单、跨组沿用绝对的 `save_prompt` 计数、把空文件夹当作移动目标、断言了应用并不维护的 `document.documentElement.lang`），已修正脚本；其中“空文件夹不作为移动目标”是按 PRD 4.6“按成员生成列表、隐藏空文件夹”的有意行为，并在检查中显式断言。

## 限制与后续

- 未对真实数据库与原生窗口执行验收：AGENTS.md 禁止在未获明确授权时改动本地数据库，而 PRD §8 也要求这类验收不能只靠浏览器模拟。需要用户自行运行 `npm run tauri dev` 确认：旧库首次启动完成 `pinned` 列与 `organization` / `ui_prefs` 迁移且原有数据保留；重启后顺序、布局与折叠状态恢复；真实窗口缩放与显示缩放下分隔条、调节柄、菜单不遮挡；托盘、全局快捷键、调用窗口排序（置顶优先）正常；导出文件包含 `organization` 且旧文件可导入。
- 鼠标拖动路径未用程序化事件驱动（HTML5 拖放合成不可靠）；AC-21 的等价菜单路径已逐项验证，落点判定集中在 `ManagerApp.onDrop`，拖动本身仍需人工确认（含边缘自动滚动、悬停展开折叠文件夹、插入线落点与无效落点/Esc 取消）。
- macOS、真实 WebView2 字体度量与较高显示缩放未覆盖。
- 空文件夹不出现在“移动到文件夹”目标列表中（与导航一致，按成员生成）；把提示词移回已清空的文件夹通过编辑器归属字段完成，位置按保存的槽位恢复。
- 已展示条数仅当前会话保留；布局与折叠跨重启保留；两者都不写入导出 JSON。
- 本期未实现多级文件夹、批量拖动、文件夹合并、独立收藏列表、文件夹置顶与旧软件读取新字段的兼容层（PRD 明确的非目标）。