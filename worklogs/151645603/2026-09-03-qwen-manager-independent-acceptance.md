# PromptDock 管理界面文件夹布局与排序：独立验收报告

> 2026-09-05 清理说明：按维护者要求，已删除 worklogs 根目录下的 acceptance-2026-09-03-qwen、manager-fixes-2026-09-03 和 archive 三个历史材料目录。下文涉及这些目录的附件、备份和复现命令仅作历史记录，已不再可用；原验证结论保留。

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

日期：2026-09-03  
验收对象：用户指定的 QWEN 3.8max 执行产出，即当前工作区的相关代码、测试及变更记录。  
结论：**不通过。**

## 1. 验收依据与范围

主要依据是已经由用户整体确认的 [PRD](D:/Program/promptdock/docs/PRD/管理界面文件夹布局与排序需求文档.md)，包括 FR-01～FR-06、全部补充方案和 AC-01～AC-31。不能将第 9 节中原先的建议重新降级为可选功能。

验收开始时 HEAD 为 `423e1ac`，实现主要位于未提交工作区：15 个已跟踪文件有修改，并新增组织模型、管理组件和测试等文件。验收前后对 27 个相关文件计算 SHA-256，均未改变。未修改产品代码、现有测试、PRD、版本或个人数据库；新增内容仅为本地验收报告、测试脚本和证据。

执行方的 [worklog](2026-09-03-manager-folder-layout-and-ordering.md) 仅用于定位产出及核对其声称，未作为验收标准。没有获得可独立核实的模型运行记录，因此不对模型身份或执行过程作额外判断。

需求材料没有阻止本次判断的重大冲突：

- PRD 已明确覆盖旧版“收藏优先”排序规则。
- 导入以当前完整替换记录、比较页直接确认的规则为准；旧导入 PRD 的保留身份及摘要页要求已被明确覆盖。
- PRD 中“本次只更新文档”的限制明确只针对此前审批状态修改，不能据此排除后续实现。
- “organization 可选”指读取旧文件时允许缺失，新版顺序导出已确认需要实现。
- PRD 仍标记“待实现”不能单独证明代码未实现，同样也不能凭执行方写了“实现”就判定完成。

## 2. 实际执行的验证

| 验证 | 独立结果 | 能证明的范围 |
|---|---|---|
| `npm test` | 63/63 通过 | 已有前端单元测试；首次沙箱运行因 `spawn EPERM` 未能启动，获准在沙箱外重跑后通过 |
| `npm run build` | 通过 | Vue/TypeScript 类型检查及 Vite 构建 |
| Cargo 格式检查、`cargo check` | 通过 | Rust 格式及编译 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 50/50 通过 | 已有 Rust 测试，不能推出全部写入路径都可回滚 |
| 现有真实 ManagerApp 浏览器夹具 | 173 条断言通过，无错误提示 | 1080×720，结构、分批、布局调节、菜单排序、状态、搜索、编辑等既有检查 |
| 860×560 | 30 条断言通过 | 窗口布局与结构 |
| 1920×1080 | 37 条断言通过 | 窗口布局与分隔条调节 |
| 860×560 英文深色 | 31 条断言通过 | 现有国际化与主题检查 |
| 等待偏好写入后重载 | 6 条断言通过 | 常规恢复尺寸、折叠；已展示条数回到 5 条 |
| 现有导入流程 normal 场景 | 25 条断言通过 | 直接确认、忙碌锁、失败重试及导入后编辑对象同步；未重跑其余全部浏览器场景 |
| 补充后端验收测试 | **10 项中 5 项通过、5 项失败** | 实际后端函数的故障注入、过期请求、JSON 往返与导入兼容 |
| 补充浏览器边界检查 | **7 个有明确前提的场景均发现不符合预期** | 同行放下、编辑焦点、异步状态、菜单边界、选择器滚动、关闭前保存、置顶入口定位 |
| `git diff --check` | 通过 | 无差异空白错误；Git 有 LF/CRLF 提示 |

### 验证方法边界

浏览器使用真实 Vue 组件，Tauri 边界使用执行方已有的合成数据夹具。补充脚本独立编写，并对可见 DOM 及 API 调用结果进行检查；没有调用组件内部方法来绕过界面流程。

后端补充测试通过 提取脚本（历史附件已删除） 从实际 `main.rs` 提取 28 个函数，函数体保持不变，只将 Tauri `State<DbState>` 参数替换成 `&DbState` 以便直接调用；`organization.rs` 与 `import_logic.rs` 直接引用原文件。测试使用 SQLite 内存数据库及合成 JSON，实际执行导出、覆盖导入和提交函数。此方法验证业务与 SQLite 写入逻辑，不验证 Tauri IPC、WebView2 或原生窗口生命周期。

没有运行原生 Tauri 图形窗口，也没有验证 macOS、原生高 DPI、托盘或系统快捷键。Windows 拖放阻断项依据窗口配置、实际事件实现和官方接口契约判定，未声称已完成原生鼠标复现。浏览器的合成 DragEvent 验证了同行落点逻辑；另外尝试鼠标驱动拖动未产生预期提交，该结果不单独作为原生拖动失败的证据。

## 3. 主要问题与通过条件

### F-01 / P1：Windows HTML5 拖放缺少必要的原生窗口配置

- 对应：FR-06，AC-14～AC-17、AC-20，以及 PRD §8 的原生验证要求。
- 位置：[tauri.conf.json:30](D:/Program/promptdock/src-tauri/tauri.conf.json:30)、[main.rs:975](D:/Program/promptdock/src-tauri/src/main.rs:975)、[FolderSection.vue:172](D:/Program/promptdock/src/components/manager/FolderSection.vue:172)。
- 实际：排序依赖前端 `dragstart/dragover/drop`。初始管理窗口没有设置 `dragDropEnabled: false`，关闭后重新创建管理窗口的 `WebviewWindowBuilder` 也没有禁用原生拖放处理。
- 依据：Tauri 的原生拖放处理默认开启；官方明确说明 Windows 使用前端 HTML5 拖放时必须关闭它，因为其替换了 WebView2 的拖放处理器。[Tauri 官方配置说明](https://v2.tauri.app/reference/config/#dragdropenabled)
- 为什么不通过：接口与菜单存在不能替代用户明确要求的桌面拖动功能。执行方也承认未验证拖放路径。
- 通过条件：初始创建与重新打开两条窗口路径都支持 HTML5 拖放，并在 Windows 原生窗口实际验证文件夹排序、成员排序、跨文件夹移动、取消、边缘滚动和折叠目标悬停展开。

### F-02 / P1：编辑器保存、置顶、删除的多步写入没有事务保护

- 对应：PRD §4.4.3、§6.2，AC-17、AC-22、AC-23；影响已有保存与删除行为。
- 位置：[main.rs:294](D:/Program/promptdock/src-tauri/src/main.rs:294)、[main.rs:344](D:/Program/promptdock/src-tauri/src/main.rs:344)、[main.rs:390](D:/Program/promptdock/src-tauri/src/main.rs:390)。
- 实际：`save_prompt` 先写提示词，再写 organization；`set_pinned` 先写布尔值，再写顺序；`delete_prompt` 先删除记录，再清理顺序。这三条路径都没有数据库事务。
- 复现：在内存库 organization 表建立 `BEFORE INSERT` 触发器，主动返回 `RAISE(ABORT, ...)`。三个 API 均返回错误，但保存路径已将 `folder` 从 A 改成 B、置顶已变 true、删除记录已消失。
- 对照：同一个故障注入下，专用 `move_prompt` 的事务能完整回滚。这说明现有移动测试通过不能支持所有归属修改路径都安全的结论。
- 通过条件：提示词与组织数据的相关修改作为一个事务提交；相同故障下所有入口均返回错误且数据库保持操作前状态。

### F-03 / P1：置顶请求与保存可并发互相覆盖，界面和数据库不一致

- 对应：FR-04、PRD §6.1/§6.2，AC-11、AC-22。
- 位置：[ManagerApp.vue:73](D:/Program/promptdock/src/components/ManagerApp.vue:73)、[ManagerApp.vue:429](D:/Program/promptdock/src/components/ManagerApp.vue:429)。
- 复现：保留置顶请求已经成功写入后的响应，暂不返回前端；此时编辑正文并点击保存，再释放置顶响应。
- 实际结果：`save_prompt` 携带旧的 `pinned:false` 覆盖已写入的 true；迟到的置顶响应又将 UI 更新为 true。合成数据库最终为 false，右侧 `aria-pressed` 为 true。
- 原因：组织操作没有与全量保存协调的忙碌锁、串行队列或版本检查；全量保存使用尚未同步的编辑快照。
- 通过条件：组织状态更新与保存不得互相覆盖；延迟响应、失败重试和连续操作后，数据库、左侧入口与编辑器状态必须一致，正文草稿保持正确。

### F-04 / P1：正文变量数量跨越零时重建输入框，打断输入

- 对应：FR-01 的右侧编辑区、PRD §6.1，AC-04、AC-22，并构成编辑体验回归。
- 位置：[ManagerApp.vue:918](D:/Program/promptdock/src/components/ManagerApp.vue:918)、[ManagerApp.vue:947](D:/Program/promptdock/src/components/ManagerApp.vue:947)。
- 实际：有变量时 textarea 位于 `ResizableSplit` 内，无变量时使用另一条 `v-else` textarea。解析结果从有变量变无变量或反向变化时，原 DOM 节点被销毁。
- 复现：在已聚焦的正文中删除最后一个变量，再输入第一个完整变量，两次都得到 `sameNode:false`、`focusRetained:false`。不是单纯的尺寸变化。
- 通过条件：布局变化期间保留编辑输入的焦点、光标/选区与输入法状态，用户能连续输入，不需重新点击正文。

### F-05 / P1：过期排序和移动目标没有重验

- 对应：PRD §6.2，AC-23。
- 位置：[main.rs:425](D:/Program/promptdock/src-tauri/src/main.rs:425)、[main.rs:472](D:/Program/promptdock/src-tauri/src/main.rs:472)、[api.ts:103](D:/Program/promptdock/src/lib/api.ts:103)。
- 实际：排序命令只收到最终 ID 数组；没有预期顺序、版本号或锚点校验。过期客户端提交仍能覆盖较新的顺序。跨文件夹命令只收到目标名称和数值下标，也不验证目标文件夹是否仍存在。
- 复现一：旧客户端持有 `[b,c]`，较新操作已保存 `[c,b]`；再提交旧数组，后端直接接受并覆盖新结果。
- 复现二：从拖动目标 B 删除最后两条成员，再提交先前指向 B 的移动请求；后端成功把提示词移入重新出现的 B，而不是报告过期目标。
- 测试覆盖误区：现有名为 `move_prompt_reports_a_missing_target...` 的测试传入的是不存在的**源提示词 ID** `ghost`，未验证目标文件夹删除或目标顺序变化。
- 通过条件：按数据库当前状态验证源记录、目标、锚点与预期顺序；过期时明确拒绝或重新计算并反馈，不静默应用陈旧下标和整列顺序。

### F-06 / P2：拖回自身会被当作“移到末尾”

- 对应：FR-06、AC-15/AC-20。
- 位置：[organization.ts:125](D:/Program/promptdock/src/lib/organization.ts:125)、[FolderSection.vue:190](D:/Program/promptdock/src/components/manager/FolderSection.vue:190)。
- 实际：`targetKey === dragKey` 与没有目标一并返回 `[..., dragKey]`。行事件又允许在自身生成插入线和提交。
- 复现：30 条成员中，将第 2 条拖起并放回自身上半区，经真实 DOM 事件处理后，它从索引 1 变成索引 29；API 实际提交了整列重排。
- 通过条件：自身落点应保持原顺序，不发出移到末尾请求；置顶区复用同一 helper，也应覆盖该回归测试。

### F-07 / P2：菜单和目标文件夹选择器在正常窗口下不可完整操作

- 对应：PRD §4.2、§4.6，AC-21、AC-31。
- 位置：[ActionMenu.vue:26](D:/Program/promptdock/src/components/manager/ActionMenu.vue:26)、[FolderSection.vue:146](D:/Program/promptdock/src/components/manager/FolderSection.vue:146)。
- 菜单复现：1080×720 打开靠近底部的 Writing 第 5 条菜单。弹层 top=600、bottom=802，窗口只有 720 高。“移到文件夹末尾”和“移动到文件夹”在窗口外。定位只按 120px 预留，但该菜单实际约 202px 高。
- 选择器复现：构造 19 个文件夹，目标列表 scrollHeight=608、clientHeight=224。滚动列表 35px 后，整个选择器被关闭。捕获阶段的 window scroll 监听也捕获了弹层自身滚动。
- 通过条件：按真实弹层尺寸向上/向下放置并约束高度；弹层内部滚动不关闭自身，底部条目在正常窗口及高显示缩放下可操作。
- 证据：菜单越界截图（历史附件已删除）。

### F-08 / P2：关闭或刷新未等待布局偏好保存

- 对应：FR-01，AC-02、AC-03、AC-05、AC-07。
- 位置：[ManagerApp.vue:506](D:/Program/promptdock/src/components/ManagerApp.vue:506)、[ManagerApp.vue:511](D:/Program/promptdock/src/components/ManagerApp.vue:511)、[ManagerApp.vue:760](D:/Program/promptdock/src/components/ManagerApp.vue:760)。
- 实际：偏好使用 300ms 去抖；`flushLayout` 是不等待结果的异步调用。关闭握手、退出握手和刷新路径未等待偏好写入，Vue `onUnmounted` 也不能作为整个原生 WebView 被销毁时可靠执行的前提。
- 复现：键盘调整侧栏后立即发出 manager-close-requested；50ms 时已收到 `resolve_close(allow:true)`，偏好写入数仍为 0，约 300ms 后才写入。夹具没有真正销毁页面，因此还能观察到迟到写入。
- 判定边界：证明了放行先于写入；尚未实际销毁 Windows WebView 复现最终丢失。Windows 销毁窗口、刷新或退出存在丢失最后一次偏好的明确风险，不能按已验证的常规重载测试判定完整通过。
- 通过条件：关闭/退出/刷新前明确 flush 并等待完成；用立即关闭重开的场景验证恢复最新值。

### F-09 / P2：点击置顶快捷入口不会定位原文件夹中的隐藏条目

- 对应：PRD §4.3 的主动选择定位规则，FR-02。
- 位置：[ManagerApp.vue:248](D:/Program/promptdock/src/components/ManagerApp.vue:248)、[ManagerApp.vue:527](D:/Program/promptdock/src/components/ManagerApp.vue:527)。
- 实际：`revealPrompt` 只被保存和移动调用；`select` 仅替换右侧编辑对象。
- 复现：把 Note organization 第 20 条置顶，重载后从置顶区点击该条。右侧已选中它，但原文件夹仍只展示 5 条，原条目不存在于 DOM。
- 通过条件：主动选择隐藏成员时展开并定位相应文件夹条目，同时保留未保存保护，不因有置顶副入口而滚动到错误位置。

### F-10 / P2：顺序元数据降级没有用户提示

- 对应：PRD §5.3，AC-30。
- 位置：[organization.rs:43](D:/Program/promptdock/src-tauri/src/organization.rs:43)、[main.rs:1042](D:/Program/promptdock/src-tauri/src/main.rs:1042)、[import_logic.rs:25](D:/Program/promptdock/src-tauri/src/import_logic.rs:25)。
- 实际：无效字段解析为 None，重复、陈旧或错归属 ID 被静默过滤；返回模型没有警告信息，界面也没有对应提示链路。
- 已完成部分：回退与保留提示词内容确实存在；置顶类型错误会阻止写入。
- 缺失部分：PRD 要求“有问题的顺序信息给出提示”，当前无法告知用户备份中的排列信息未被完整采用。
- 通过条件：区分正常缺失的旧字段与无效顺序内容，向预检查及完成反馈传递清晰警告，同时保持正常导入与非破坏性降级。

### F-11 / P2：升级迁移整体不具备事务回滚

- 对应：PRD §5.1，AC-24 的迁移完整性要求。
- 位置：[main.rs:73](D:/Program/promptdock/src-tauri/src/main.rs:73)、[main.rs:122](D:/Program/promptdock/src-tauri/src/main.rs:122)、[main.rs:224](D:/Program/promptdock/src-tauri/src/main.rs:224)。
- 实际：建表、ALTER TABLE 补 pinned、初始化 organization 分散执行，外层没有事务。单个 ALTER 的原子性不能代表包含顺序初始化的整体迁移可回滚。
- 已完成部分：现有内存库测试证明 pinned 默认值、旧记录保留、重复迁移和顺序只初始化一次。
- 判定边界：未执行完整原生启动迁移故障注入；不声称已发生升级损坏。静态调用链已经不能满足文档明确要求的整体事务回滚。
- 通过条件：迁移步骤使用统一事务并增加中途失败测试，失败后不得留下半迁移状态，成功重启不重排。

## 4. FR 与 AC 逐项结论

“已正确完成”仅指该条描述的功能在注明的代码/合成数据范围内已有证据，不表示 Windows/macOS 原生整体验收通过。

| 核心需求 | 结论 | 主要依据 |
|---|---|---|
| FR-01 自适应与尺寸调节 | 部分完成 | 基础布局与调节通过；编辑焦点回归、菜单越界、关闭前保存缺口 |
| FR-02 折叠与分批 | 部分完成 | 5 条分批、搜索、折叠正确；主动选择置顶隐藏成员未定位 |
| FR-03 文件夹顺序稳定 | 已正确完成（常规路径） | 独立 organization；收藏、置顶、使用不作为文件夹排序键，现有测试与代码一致 |
| FR-04 独立收藏与置顶 | 部分完成 | 两个字段、入口及调用窗口排序已接入；异步竞态和写入失败不一致 |
| FR-05 JSON 兼容 | 核心兼容已正确完成，扩展规则部分完成 | 缺 pinned 默认 false、类型校验、导出和往返验证通过；顺序降级警告缺失 |
| FR-06 排序与移动 | 部分完成且关键行为不符合要求 | 菜单与数据模型存在；Windows 拖放接入缺口、自身落点错误、过期请求与写入异常问题 |

| 验收项 | 结论 | 独立证据或未满足部分 |
|---|---|---|
| AC-01 多尺寸自适应 | 部分完成 | 三种浏览器尺寸布局通过；原生窗口未验证，菜单越界见 F-07 |
| AC-02 左右调节与恢复 | 部分完成 | 正常调节及等待写入后重载通过；立即关闭不等写入，F-08 |
| AC-03 文件夹高度独立调节 | 部分完成 | 控件及常规恢复通过；最终偏好写入时序缺口，F-08 |
| AC-04 正文与变量区域切换 | 实现与需求不一致 | 视觉分区存在，切换有/无变量损失输入焦点，F-04 |
| AC-05 键盘调节、复位、边界 | 已正确完成（浏览器控件） | resize 组、大小窗口边界通过；原生缩放仍需验证 |
| AC-06 默认 5 条与计数 | 已正确完成 | 5/6/30 条真实组件分批检查通过 |
| AC-07 更多、收起、折叠、重开 | 部分完成 | 正常流程及等待保存后的重开通过；立即关闭的偏好恢复未满足，F-08 |
| AC-08 搜索隐藏成员 | 已正确完成 | 第 20 条检索、临时展开、恢复及拖动禁用检查通过 |
| AC-09 收藏不改顺序或置顶 | 已正确完成（单次操作） | 独立字段更新和顺序不变；并发风险另见 AC-11/22 |
| AC-10 置顶、编辑、使用不改文件夹顺序 | 已正确完成（常规路径） | 独立组织排序与现有 flags/order 检查支持 |
| AC-11 四种状态及草稿 | 部分完成 | 正常组合通过；延迟置顶响应与保存互相覆盖，F-03 |
| AC-12 双入口同一记录 | 部分完成 | ID 引用与正常同步正确；删除失败后数据和视图可能不一致，F-02 |
| AC-13 调用窗口排序 | 已正确完成（逻辑及接入） | Launcher 已调用 sortLauncher，单元测试验证置顶顺序与非置顶最近使用；原生调用过程未验 |
| AC-14 文件夹拖动、重启 | 部分完成 | 菜单排序及存储存在，Windows 原生拖动接入不符合要求，F-01 |
| AC-15 文件夹内排序 | 实现与需求不一致 | 自身落点将第 2 条移到第 30 条，F-06；Windows 拖放另见 F-01 |
| AC-16 隐藏列表末尾与明确插入线 | 部分完成 | 真实末尾的下标计算存在；原生投放、自动滚动与悬停完整路径未证明有效 |
| AC-17 跨文件夹与置顶同步 | 部分完成 | 专用移动的归属及 pin 引用正确；编辑归属保存不具备同等回滚，F-02 |
| AC-18 未分类、大小写、同名条目 | 已正确完成（常规路径） | 空字符串归属与按 ID 操作，现有 order 测试和后端实现一致 |
| AC-19 空文件夹隐藏与恢复 | 已正确完成（常规路径） | 保留顺序槽位，菜单/编辑字段移动及组织单元测试支持 |
| AC-20 置顶拖动、取消、无效落点 | 部分完成 | 跨分区拒绝逻辑存在；原生拖动/取消未验证且有 F-01，自身落点有 F-06 |
| AC-21 菜单替代拖动 | 实现与需求不一致 | 窗口底部菜单不可完整使用，多目标列表滚动后关闭，F-07 |
| AC-22 草稿保护 | 实现与需求不一致 | 常规草稿保护通过；变量编辑焦点、组织/保存竞态与失败回滚不满足，F-02～F-04 |
| AC-23 写入失败、过期目标 | 实现与需求不一致 | 专用 move 的回滚对照通过，其他归属入口失败；过期排序和目标未重验，F-02/F-05 |
| AC-24 旧数据库迁移 | 部分完成 | 旧库列迁移、幂等和一次初始化测试通过；整体事务缺失及原生升级未验，F-11 |
| AC-25 旧 JSON 两种格式 | 已正确完成（后端） | 原有格式测试 + 实际合成旧文件覆盖导入 + 独立追加预检查/提交验证 |
| AC-26 新字段及顺序往返 | 已正确完成（后端） | 实际导出并覆盖导入，全部记录、三类顺序及 pinned 对比通过 |
| AC-27 旧文件与本地置顶冲突 | 已正确完成（代码/后端） | 默认 false、conflictCount=1 实测；比较页已增加 pinned 行 |
| AC-28 提交前置顶变化 | 已正确完成（后端） | 独立测试返回 import.stale_plan，业务比较确实包含 pinned |
| AC-29 各导入策略顺序与 ID | 已正确完成（已验后端路径） | 既有导入测试与独立换 ID/跨归属/保留 pin 引用测试通过；未重复全部原生导入交互 |
| AC-30 异常元数据与置顶类型 | 部分完成 | 合法回退、旧文件兼容及非法 pinned 原子拒绝通过；降级无提示，F-10 |
| AC-31 平台、语言、主题、显示缩放 | 部分完成；平台证据不足 | 英文深色与中英文文案通过；普通窗口菜单已越界，macOS/原生高 DPI 未验 |

## 5. 对执行方结论与测试覆盖的核对

执行方关于 63 项前端测试、50 项 Rust 测试和 173 条管理器浏览器断言通过的描述，本次均成功独立重现。这些数字真实，但不能支撑全部需求已正确完成。

具体覆盖缺口：

1. 管理器浏览器夹具自行实现了数据持久化逻辑，不能证明实际 SQLite 多步命令原子性。
2. 菜单点击测试不能证明 Windows HTML5 拖放可用。
3. 编辑测试没有跨越有变量/无变量的 DOM 重建边界，也没有延迟响应与保存交错场景。
4. 正常偏好恢复测试等待写入完成，未覆盖调整后立即关闭。
5. 原回滚测试只覆盖 `move_prompt_impl`，未覆盖编辑器改文件夹时调用的 `save_prompt`。
6. “缺失目标”测试实际检查的是不存在的源记录，不是已删除的目标文件夹。
7. worklog 关于“落点集中在 onDrop”“保存后重新核对”的说明，不等价于后端基于当前数据库对并发和过期请求进行验证。

执行方在 worklog 限制部分明确承认未做原生、鼠标拖放和 macOS 验证；这部分说明与当前材料一致，应保留为验收缺口，不能将其视为已有完成证据。

## 6. 证据与复验方式

- 后端补充测试源码（历史附件已删除）
- 后端完整测试日志（历史附件已删除）
- 浏览器补充检查脚本（历史附件已删除）
- 同行落点结果（历史附件已删除）
- 编辑焦点结果（历史附件已删除）
- 置顶/保存竞态结果（历史附件已删除）
- 菜单边界结果（历史附件已删除）
- 目标选择器滚动结果（历史附件已删除）
- 关闭时偏好写入结果（历史附件已删除）
- 置顶选择定位结果（历史附件已删除）
- 验收前后源码哈希对比（历史附件已删除）

后端复验命令（仓库根目录）：

```powershell
& 'D:/Anaconda/envs/gputorch/python.exe' 'worklogs/acceptance-2026-09-03-qwen/build_backend_harness.py'
cargo test --offline --manifest-path 'worklogs/acceptance-2026-09-03-qwen/backend/Cargo.toml' acceptance:: -- --nocapture
```

浏览器复验：启动 Vite，打开 `/tests/browser/manager-layout.html?fresh=1`，设置 1080×720 视口。每个场景用 fresh=1 重置合成数据，再通过浏览器 eval 执行：

```javascript
import('/worklogs/acceptance-2026-09-03-qwen/browser-boundaries.js')
  .then(m => m.variableFocus())
```

其他导出函数为 `selfDrop`、`delayedPinThenSave`、`bottomMenu`、`immediateClosePrefs`。`pickerScroll` 需先通过夹具 API 保存至少 12 个不同新文件夹的合成提示词，再打开不带 fresh=1 的页面；`pinnedReveal` 需先置顶 note-20，再重载不带 fresh=1 的页面。脚本对缺少必要前提的场景会报错，不能把这种错误当作产品失败。

本次不修复发现的问题。再次申请验收前，应修复上述功能缺陷，补上能够覆盖这些失败路径的测试，并提供 Windows 原生及 macOS/显示缩放的实际验证证据。现有“能编译、单元测试全绿、菜单能点”不足以达到本 PRD 的完整通过标准。
