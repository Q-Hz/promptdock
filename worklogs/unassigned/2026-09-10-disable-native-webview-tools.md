# 禁用原生 WebView 菜单与开发者工具入口

作者（GitHub）：待确认  
作者唯一标识：待确认

## 摘要与动机

管理器和调用器的空白区域右键会显示 Chromium/WebView2 原生菜单，其中包含刷新、另存、打印和检查等浏览器操作；调试构建中按 F12 也会打开开发者工具。这些入口不属于 PromptDock 的产品界面，容易让普通用户误操作。

## 受影响区域

- `src/App.vue`：统一阻止原生 `contextmenu` 默认行为，并在捕获阶段拦截 F12 和 Chromium 常见开发者工具快捷键。
- `src/lib/webview-guards.ts`：集中判断 Windows/Linux 与 macOS 的开发者工具快捷键。
- `tests/frontend-utils.test.ts`：覆盖 F12、Ctrl+Shift+I、Command+Option+I 与普通快捷键。
- `src-tauri/tauri.conf.json`：主调用窗口和管理窗口均显式设置 `devtools: false`。
- `src-tauri/src/main.rs`：运行时重新创建管理窗口时同样调用 `.devtools(false)`。
- `src-tauri/capabilities/default.json`：拒绝前端调用内部开发者工具切换命令。

## 重要实现决策

- 全局监听仅调用 `preventDefault()` 阻止 WebView 原生右键菜单，不停止事件传播，因此文件夹和 Prompt 已有的自定义右键菜单仍能接收事件并正常打开。
- 开发者工具同时在窗口配置、动态窗口构建、权限和键盘事件四个层面关闭，覆盖初始窗口与 Windows 上关闭后重建的管理窗口。
- 不阻止 Ctrl+R 等普通快捷键；本次范围仅针对原生右键菜单和开发者工具入口。

## 验证

- `npm test`：通过，73 项测试全部成功。
- `npm run build`：通过，Vue TypeScript 检查与 Vite 生产构建成功。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过，同时验证 Tauri 配置和 `.devtools(false)` 调用有效。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，66 项测试全部成功。

## 剩余风险与后续工作

- 尚未在真实 WebView2 窗口中手动执行右键与 F12 验收；代码和配置已覆盖这些入口。
- 本次工作负责人的 GitHub 数字 ID 尚未确认，日志暂存于 `worklogs/unassigned/`。
