# 可选片段组与模板语法检查

Author (GitHub): 待确认

Author ID: 待确认（当前任务未提供已核实的开发者身份，暂存于 `unassigned/`）

## 摘要

新增适合长可选内容的片段组。模板正文用 `{{@组名}}` 引用，底部用 `:::options 组名`、`:::option [x] 标题` / `:::option [ ] 标题` 和 `:::end` 定义。单选项组作为开关，多选项组允许选择多条；调用时显示短标题，可展开原文。

## 影响范围

- `src/lib/optional-snippets.ts`：定义解析、原文行号诊断、条件变量、调用状态及生成。
- `src/components/LauncherApp.vue`、`VariableField.vue`：选择片段、展示内部填写项、键盘操作、返回确认及滚动布局。
- `src/components/ManagerApp.vue`、`TemplateDiagnostics.vue`：实时语法检查、潜在冲突提醒；错误模板仍可保存。
- `src/components/VariableExamplesModal.vue`、`src/lib/i18n.ts`、中英文 README：示例与中英文说明。
- `tests/optional-snippets.test.ts`、`tests/browser/optional-snippet-*.{ts,js}`、`tests/browser/launcher-preview.ts`、`package.json`：单元测试及隔离浏览器验收。

## 实现决策

- 默认勾选按定义顺序初始化；后续按勾选顺序插入，取消后重选追加到末尾。同组多处引用共用一次选择和填写。
- 每个片段只去掉头尾空白行，保留内部空行与缩进，以一个换行连接。定义区全部从结果移除；空的独占行引用连同该行移除，行内引用仅替换为空。
- 片段支持已有四种基础变量，勾选后才出现填写项；收起原文不隐藏填写框。同名变量只显示一个填写项，优先放在正文已有填写项处，否则放在第一个启用的所属片段下。
- 调用状态缓存按变量名称与配置区分；取消时隐藏并保留本次填写值，重新勾选恢复。隐藏缓存不参与结果与返回确认；重新调用恢复模板默认值。
- 同名裸引用可复用显式定义；同时启用的显式定义在类型、默认值、候选项或多选连接符上不一致时阻止生成。管理器提前显示条件冲突警告和来源行号，未启用片段的变量定义不阻止生成。
- 重复组名、缺失定义、未闭合标记、嵌套组/组引用等结构错误在调用时阻止生成，快捷键同样执行该校验。填入的内容不会再次作为模板指令解析。
- 延用原始 Prompt 正文字符串；数据库、导入导出结构、Tauri command 和权限未作本功能所需变更。

## 验证

- Red：新增测试在模块实现前因缺少 `optional-snippets.ts` 失败；实现后通过。
- `npm test`：108 项通过，其中新增片段相关测试 19 项，覆盖默认顺序、勾选顺序、条件字段、缓存、共享字段移动、冲突、原文行号、换行与旧语法兼容。
- `npm run build`：通过（Vue/TypeScript 检查及 Vite 构建）。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：74 项通过。
- 后台 `agent-browser`：使用 `launcher-preview.html` 与 `manager-layout.html` 的合成数据及模拟 IPC。调用页通过开关、多选、重复引用、暂存、顺序、冲突与 Enter 拦截、生成预览、返回确认；管理器通过实时检查、原文行号、错误仍可保存、条件冲突警告、填写焦点保持及五类语法示例。
- 调用页同时回归原有 one/two/three/mixed/many/options 六种布局；中英文、明暗主题及 460×580 小窗口交互通过。实际键盘 ArrowDown/Space 勾选、Enter 展开通过，展开未误触生成。浏览器未报告运行时错误。
- 浏览器脚本：将 `tests/browser/optional-snippet-checks.js` 或 `optional-snippet-manager-checks.js` 的 UTF-8 内容转为 base64，打开对应隔离页面后使用 `agent-browser eval -b` 执行。管理器脚本不访问实际数据库。
- `git diff --check`：通过；最终检查保留了任务开始前已有修改，未暂存或提交。

## 范围与限制

- 任务开始前已有 `package.json`、`src-tauri/src/main.rs`、`LauncherApp.vue`、`src/lib/api.ts`、`src/lib/i18n.ts`、`tests/browser/launcher-preview.ts` 的修改，以及预览偏好模块、相关测试和 2026-10-09 日志。本次保留这些修改，在重叠文件中叠加本功能；Rust 和 API 的原有变更未由本任务改写。
- 未升级版本、安装依赖、生成安装包或提交 Git；未读取实际用户数据库或个人导出。
- 浏览器验证使用真实 Vue 界面与模拟 Tauri IPC，未运行原生 Tauri 窗口进行手工验收。
- 不支持片段内嵌套组或组引用；不提供跨组片段共享。这些均保持已确认范围。
- 日志的人类作者 GitHub 身份仍待确认。
