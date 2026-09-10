# 管理器固定保存与删除快捷键

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)

作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）

## 摘要与修改动机

为管理器补充两组无需配置的固定键盘操作：编辑 Prompt 时可用 `Ctrl+S` 保存，选中 Prompt 行或聚焦用户文件夹标题时可用 `Delete` 发起删除。因 v1.7.0 尚有需求未完成，同时把应用版本暂时恢复为 v1.6.0，后续完成发布准备后再重新提交 v1.7.0。

## 受影响区域

- `src/components/ManagerApp.vue`：接入固定保存快捷键，并根据当前焦点识别 Prompt 或文件夹删除目标。
- `tests/keybindings.test.ts`：覆盖固定快捷键的精确修饰键匹配。
- `tests/browser/manager-layout-checks.js`：覆盖真实管理器中的保存、Prompt 删除、文件夹删除及确认提醒。
- `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、中英文 README：暂时恢复 v1.6.0。
- `src-tauri/src/default-prompts.json` 与 `prompts-share/` 下三份分享文件：按用户要求将其同期完成的 Prompt 内容、组织顺序和 `pinned` 元数据调整一并纳入提交。
- `worklogs/151645603/2026-09-10-version-1-7-0.md`：标记 v1.7.0 已暂缓。

## 重要实现决策

- 保存快捷键固定为 Windows/Linux 的 `Ctrl+S`；macOS 同时采用平台惯例 `Command+S`。它不进入设置页，也不改变已有可配置界面快捷键。
- `Delete` 只在焦点位于当前已选中的 Prompt 行，或位于可删除的用户文件夹标题时生效；文本输入、系统“未分类”和“置顶”分区不会被快捷键误删。
- 快捷键删除复用既有 Prompt 与文件夹删除流程，因此确认提醒、非空文件夹成员移入“未分类”以及未保存草稿保护保持一致。
- Prompt 删除提醒统一改用 Tauri `dialog.ask` 警告框，与文件夹删除保持一致；仅在普通浏览器夹具没有 Tauri 对话框 API 时回退到 `window.confirm`。此前 Prompt 使用 WebView 网页 `confirm()`，在真实桌面窗口中没有可靠显示，同时旧夹具自动确认该 API，未能发现问题。
- 设置、导入比较、首次导览、变量示例或确认弹窗打开时，不执行管理器快捷键。

## 验证

- `npm test`：通过，73 项测试全部成功。
- `npm run build`：通过，Vue TypeScript 检查与 Vite 生产构建成功。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`：通过，编译版本显示 1.6.0，并由 Cargo 同步根包 lockfile 版本。
- `cargo test --offline --manifest-path src-tauri/Cargo.toml`：通过，66 项测试全部成功。
- 四份 Prompt JSON 均通过 PowerShell `ConvertFrom-Json` 解析校验。
- 无头 Chromium 管理器回归：通过，12 组共 222 条断言；其中固定快捷键组 7 条，覆盖 `Ctrl+S` 保存、点击删除后取消、Tauri 原生警告框、Prompt `Delete`、文件夹 `Delete` 与两类删除确认。浏览器控制台无错误。
- `git diff --check`：通过。

## 剩余风险、限制或后续工作

- v1.7.0 版本号仍需在所有需求完成后重新统一更新；本次不创建标签、安装包或 Release。
