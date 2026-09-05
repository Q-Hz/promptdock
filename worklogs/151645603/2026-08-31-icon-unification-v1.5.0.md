# PromptDock v1.5.0 图标统一

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

统一 PromptDock 在 Windows 与 macOS 的应用主图标，并针对 Windows 系统托盘保留独立的小尺寸资源。由于发布产物的外观发生变化，项目版本由 1.4.0 提升至 1.5.0，后续由 Windows 与 Apple Silicon Mac 从同一个固定提交重新构建。

## 影响范围

- `src-tauri/icons/`：重新生成正式 PNG、ICO、ICNS 和 Windows 托盘资源；macOS 菜单栏继续使用独立的 Template 图标。
- `src-tauri/src/main.rs`：Windows 托盘显式读取 `tray-icon-windows.png`。
- `README_attachment/logo.png`：README 品牌图与应用主图标保持一致。
- `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`：版本统一为 1.5.0。
- `README.md`、`README_CN.md`：版本徽章更新为 1.5.0。
- `scripts/generate-latest-json.ts`：Apple Silicon 限制提示改为与具体发布版本无关。

## 重要决策

- 1024×1024 设计母版和图标位置说明保留在本地，不提交；仓库提交构建实际使用的派生资源。
- Windows 应用、快捷方式和任务栏使用 `icon.ico`，系统托盘使用独立透明 PNG。
- macOS `.app`、Finder 和 Dock 使用 `icon.icns`，菜单栏继续使用单色 Template 图标。
- 本次不创建 v1.5.0 tag；等 Windows 与 macOS 产物构建、签名和验收完成后再创建 Release tag。

## 验证

- `npm test`：通过，23 项。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，6 项。
- 图标检查：PNG 尺寸、透明通道和母版派生关系通过；ICO 包含 16/24/32/48/64/256，ICNS 包含 16 至 1024 的标准与 Retina 层级；配置和代码引用文件均存在。
- `git diff --check`：待提交前执行。

## 剩余风险与后续

- Windows 图标缓存可能继续显示旧图标，需要通过重新安装、取消固定后重新固定等方式复核。
- macOS Dock、Finder、DMG 和明暗菜单栏效果必须由 Apple Silicon Mac 协作者真机检查。
- 已生成的 v1.4.0 安装包和 updater 产物不得用于 v1.5.0，两个平台都必须从本次固定提交重新构建。
