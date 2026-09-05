# 管理界面文件夹功能：独立验收问题修复

> 2026-09-05 清理说明：按维护者要求，已删除 worklogs 根目录下的 acceptance-2026-09-03-qwen、manager-fixes-2026-09-03 和 archive 三个历史材料目录。下文涉及这些目录的附件、备份和复现命令仅作历史记录，已不再可用；原验证结论保留。

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 范围与依据

依据已确认的 `docs/PRD/管理界面文件夹布局与排序需求文档.md`，修复 `2026-09-03-qwen-manager-independent-acceptance.md` 中的 F01–F11。保留之前 QWEN 的未提交实现和原验收失败证据；本记录描述后续修复，不改变原验收报告的历史结论。需求文档、版本、依赖与发布产物配置未调整。

## 修复对应关系

| 问题 | 本次修改 | 验证 |
| --- | --- | --- |
| F01 Windows HTML5 拖放与实际拖动 | 初始管理窗口配置 `dragDropEnabled: false`，重建窗口调用 `disable_drag_drop_handler()`；进入目标即验证落点，指示线不占布局高度；补边缘自动滚动和 Esc 清理 | Cargo 编译；Chromium 可信拖动事件完成同文件夹排序、跨文件夹移动、文件夹排序；边缘滚动/取消回归通过。原生平台限制见下文 |
| F02 保存/删除/置顶非原子 | 记录和 organization 写入使用同一 SQLite 事务；新增可直接测试的数据库操作函数；保存不覆盖刚更新的使用历史，也不复活已删除记录 | 真实 rusqlite 内存库注入排序写入失败，保存、新建、删除、置顶全部回滚 |
| F03 异步响应覆盖状态 | 新增 MutationQueue；收藏、置顶、排序、移动、保存和删除按响应完成顺序协调；保存读取已同步的最新标记，合并重复保存请求；切换/关闭等待队列 | 延迟置顶响应再编辑保存、重复保存、队列失败后继续运行通过 |
| F04 变量提示切换失焦 | ResizableSplit 增加第二栏折叠支持，正文 textarea 始终使用同一个节点 | 添加首个变量、删除最后变量均保持节点与输入焦点 |
| F05 过期请求覆盖新顺序、已删目标被复活 | 排序与移动 API 携带 expected organization；事务内比对当前快照，过期时拒绝；目标必须仍有真实成员（未分类例外），插入下标检查范围；失败刷新列表并保留正文草稿 | 新顺序、源归属变化、目标成员变化、删除目标及越界下标均拒绝；浏览器显示错误且保留草稿 |
| F06 自投放移到末尾 | reorder 对相同源目标、不存在源/目标返回原顺序；跨文件夹插入下标单独计算 | 原第 2 条自投放后仍是第 2 条，不发送排序请求 |
| F07 菜单越界、选择器滚动关闭 | 共享实际尺寸定位工具，必要时向上展开并限制视口高度；内部滚动保留弹层，外部滚动/尺寸变化关闭；增加菜单键盘导航及聚焦 | 底部六项菜单完全在视口内；多文件夹选择器可滚动；英文深色场景通过 |
| F08 关闭前布局未落盘 | 深层偏好变更同步监听；串行保存并追赶写入期间的新变化；关闭、退出、刷新等待 flush 完成；失败提示并拒绝退出，重试保留待保存值 | 立即关闭、延迟写入、失败后重试、重载恢复尺寸/折叠均通过 |
| F09 置顶入口未定位原文件夹 | 主动选择时展开原文件夹到目标批次，按搜索结果计算显示条数，并限定在普通文件夹内定位同 ID | 置顶第 20 条后重载并点击，原文件夹展开 20 条并定位 |
| F10 非法排序元数据静默丢弃 | 解析时记录错误类型；对比规范化结果识别缺项、重复、过期或错误归属；预检查与覆盖结果回传 organizationAdjusted；比较页和完成提示显示双语说明，过期重验保留说明 | Rust 无损降级测试；追加（含 stale 重验）、覆盖导入提示均通过 |
| F11 升级失败留下部分结构 | 建表、增加 pinned、默认数据及组织初始化放在同一初始化事务；不再将组织读取错误当成空值 | 注入初始化顺序写入失败，ALTER TABLE 和新建表/种子全部回滚；成功后重复初始化保持数据及顺序 |

## 受影响文件

- 后端：`src-tauri/src/main.rs`、`organization.rs`、`import_logic.rs`、`manager_regression_tests.rs`、`src-tauri/tauri.conf.json`。
- 前端：`src/components/ManagerApp.vue`、`manager/FolderSection.vue`、`manager/ActionMenu.vue`、`import/ResizableSplit.vue`、`import/ImportComparePage.vue`；`src/lib/api.ts`、`organization.ts`、`drag-state.ts`、`mutation-queue.ts`、`popover.ts`、`i18n.ts`。
- 测试：`tests/organization.test.ts`、`tests/layout-prefs.test.ts`、`tests/browser/manager-layout.ts`、`manager-regression-checks.js`、`import-flow.ts`。

JSON 外层仍为既有 v1，未改 format/version。旧文件缺少 pinned 仍为 false；organizationAdjusted 仅用于导入结果反馈，不进入导出数据。排序 API 新增 expected 参数，仅在本版本前后端之间使用。完整组织快照校验是保守策略：其它分区在此期间发生组织变化也会要求用户重试，不静默覆盖。

## 验证结果

- `npm test`：65/65 通过。
- `npm run build`：TypeScript/Vue 检查及 Vite 构建通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：57/57 通过；新增 7 个数据库回归测试涵盖多组故障和边界。
- 原管理器浏览器套件：173 项断言通过；英文深色 31 项、860×560 与 1920×1080 各 11 项、重载恢复 6 项通过。
- 原导入浏览器套件 7 场景：117 项断言通过（25+11+12+3+26+21+19）。
- 从验收脚本转入 `tests/browser/manager-regression-checks.js` 的 12 个边界场景通过，包括 7 个原失败场景及 5 个新增场景。
- Chromium `agent-browser drag` 产生 `isTrusted=true` 的事件，验证文件夹排序及跨文件夹投放。跨文件夹投放将 note-01 追加到 Writing 的第 7 位，保留未显示的第 6 条在前。
- `git diff --check`：通过；只出现既有 Windows 行尾转换提示。浏览器最终 error 列表为空。

完整浏览器结果见 `worklogs/manager-fixes-2026-09-03/browser-results.json`。本次只使用合成浏览器数据与 SQLite 内存库，未访问用户本地数据库或个人导出文件。测试过程中低级 mouse move 序列和最终目标缺少 dragover 的尝试曾未产生 drop；后者通过 dragenter 处理修复，随后使用可信浏览器拖放重新验证成功，不能把 CLI 的 Done 当成通过依据。

## 复验方式与限制

启动 Vite：`npm run dev -- --host 127.0.0.1 --port 1425 --strictPort`。打开 `/tests/browser/manager-layout.html?fresh=1`，设为 1080×720，每个边界用例前重置。通过 agent-browser eval 调用 `import('/tests/browser/manager-regression-checks.js').then(m => m.selfDrop())`，检查结果的 pass 为 true。其他函数见该文件；pickerScroll 需预先添加足够的合成文件夹，pinnedReveal 需先置顶 note-20 并打开不带 fresh 的页面。PowerShell 下使用 eval --base64/--stdin 避免脚本引号被 CLI 改写。

原 worklogs 下的提取式后端验收脚本保留作失败证据，其旧命令签名不再对应当前 API；本次长期回归已进入实际应用的 Rust 测试模块，运行 cargo test 即可。

尚未完成 Windows 原生 WebView2、macOS 原生窗口及系统 DPI 切换的实机回归。本次已修复 Windows 的两条窗口创建路径并编译验证，但 Chromium 测试不等同于原生平台验收。没有生成安装包、更新版本或提交 Git；既有 QWEN 未提交修改仍保留。
