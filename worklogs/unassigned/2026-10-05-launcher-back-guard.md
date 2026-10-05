# 调用窗口返回时保护修改

Author (GitHub): 待确认
Author ID: 待确认

## 已确认方案

用户于 2026-10-05 明确确认并授权执行：一次调用中，变量页以进入时的初始值为基线（文本、单选、多选），结果页以本次生成原文为基线。修改恢复基线后无需确认。

Esc 与返回按钮统一处理：有修改时提示“放弃修改并返回 / 取消”。变量页放弃后回搜索页；结果页放弃手动编辑后回变量页，变量填写不变。取消或弹窗内 Esc 关闭提示，保留当前页和内容。没有修改则直接返回。弹窗期间避免快捷键穿透和重复触发。

范围不包含窗口隐藏、完全退出、跨 Prompt 或重启恢复。

## 实现与影响文件

- `src/components/LauncherApp.vue`：变量与生成结果基线、统一返回入口。
- `src/lib/launcher-navigation.ts`、`tests/launcher-navigation.test.ts`：变量快照与差异比较。
- `src/lib/confirm-dialog.ts`、`src/components/ConfirmLeaveDialog.vue`：调用返回专用双按钮模式，复用焦点管理。
- `src/lib/i18n.ts`：中英文提示。
- `tests/browser/launcher-preview.ts`、`tests/browser/launcher-back-checks.cjs`：合成变量模板与浏览器交互回归，不访问用户数据库。

变量快照复制多选数组，防止编辑污染基线；多选顺序参与比较，因为会影响生成结果。进入结果页时记录生成文本，返回变量页不重置变量基线。弹窗复用管理器现有组件的专用模式，不提供保存原始模板的操作。

## 验证

- Red：新增测试先失败（快照函数尚未实现）；沙箱阻止 Node 子进程，经授权在沙箱外运行确认。
- `npm test`：84 项通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：72 项通过。
- `node tests/browser/launcher-back-checks.cjs <bundled-playwright-path>`：Edge 无界面交互验证通过，覆盖无修改直接返回、三类变量修改、恢复初始值、取消保留内容与焦点、弹窗 Esc、Enter 不穿透、放弃结果修改保留变量、重新生成恢复原文；无页面错误。
- `git diff --check`：通过。

## 限制

不持久化调用草稿，不修改原始模板或数据库格式。负责人身份未提供，记录归入 unassigned。
浏览器使用模拟 Tauri API 验证前端交互，未在真实 Tauri 窗口人工复验。任务开始时 Git 工作区干净。

## 2026-10-05 后续交互调整

修改者身份：待确认。用户明确授权：Enter 确认“放弃修改并返回”，降低红色亮度，返回与放弃按钮悬浮显示快捷键。

- 仅调用返回弹窗使用普通 Enter 确认放弃；阻止事件穿透和原生按钮重复激活，组合输入与按键重复不触发放弃，Esc 仍取消。
- 放弃按钮改为浅红背景、深红文字和柔和边框，适配深色主题。
- 返回按钮使用实际配置的返回键格式化为原生悬浮提示；放弃按钮提示 Enter，并声明 `aria-keyshortcuts`。
- 浏览器回归改为验证 Enter 确认、重复/组合输入保护及两页悬浮提示。

本轮验证：`npm test` 84 项通过；`npm run build` 通过；Cargo 格式检查、check、72 项测试通过；Edge 浏览器回归通过，验证 Enter 从变量页与结果页放弃返回、Esc 取消、组合输入与长按 Enter 不触发放弃、悬浮快捷键属性及无生成/复制穿透；`git diff --check` 通过。未在真实 Tauri 窗口人工复验。

## 2026-10-05 快捷键提示补漏与提交

修改者身份：待确认。用户授权补齐取消的 Esc 提示，检查类似遗漏，然后 Git commit，并将 v1.9.0 发布基线调整到新提交。

- 共用确认弹窗中调用返回取消、管理器未保存取消、放弃比较的继续处理均补齐 Esc 悬浮提示与无障碍快捷键声明。
- 检查设置页、变量示例、导入模式、导入比较页及文件夹图标面板，将实际支持 Esc 的取消/关闭按钮补齐提示；引导页 Esc 仅拦截、不关闭，因此未添加误导提示。完整复查时补齐图标面板遗漏，并更新本任务尚未推送的提交。
- 额外影响文件：`SettingsModal.vue`、`VariableExamplesModal.vue`、`import/ImportModeDialog.vue`、`import/ImportComparePage.vue`、`manager/FolderIconPicker.vue`、`tests/browser/folder-icon-checks.js`。
- 保留本任务先前尚未提交的调用保护改动，一起提交，不暂存其他内容。

本轮验证：`npm test` 84 项通过；构建通过；Cargo 格式检查、check、72 项测试通过；浏览器调用返回与共用确认弹窗 Esc 提示回归通过；文件夹图标面板补漏后重新运行前端测试、构建及图标 31 项浏览器断言，均通过；diff 检查通过。未在真实 Tauri 窗口人工复验。

发布进度：提交后基于固定新 SHA 重新构建 Windows 安装包。检查时远端没有 v1.9.0 标签；本地已有旧 Windows 安装包，是否还需 GitHub Release 待用户明确。本次修复不再调整版本号。正式发布记录保存在忽略的产物目录，避免提交后修改源码或日志造成发布基线漂移。
