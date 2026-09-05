# Windows 托盘图标简化（v1.6.0 待发布）

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

Windows 右下角系统托盘原先使用由应用主图标缩小得到的彩色图标，小尺寸下细节偏多。改为参考 macOS `tray-iconTemplate@2x.png` 的简洁 `>_` 轮廓，并重新生成符合 Windows 资源要求的 64×64 透明 PNG。

本次只准备下一个版本的图标资源和代码引用，不修改项目版本号、不构建发布安装包、不创建标签或发布 Release；待其他内容完成后统一发布 v1.6.0。

## 影响范围

- `src-tauri/icons/tray-icon-windows-64x64.png`：新增 Windows 托盘专用 64×64 RGBA 图标。
- `src-tauri/icons/tray-icon-windows.png`：移除不再使用的旧彩色托盘图标。
- `src-tauri/src/main.rs`：Windows 托盘改为内嵌新的 64×64 图标。
- `src-tauri/icons/图标文件与使用位置说明.md`：同步文件职责、实际引用、验收清单和维护规则。

## 重要决策

- Windows 应用主图标、任务栏、快捷方式和安装程序仍使用 `icon.ico`，本次只调整系统托盘。
- macOS 仍读取 `tray-iconTemplate@2x.png` 并启用 Template 自动着色，不改变现有行为。
- 新 Windows 图标采用与 Template 图标一致的单色透明 `>_` 设计，但使用独立的 64×64 文件，避免运行时放大 44×44 资源。
- 图标以 ImageGen 生成的高分辨率简洁轮廓为源，经单色化、透明边界裁切、居中留白和高质量缩放后输出为 64×64 RGBA PNG。

## 验证

- PNG 尺寸、颜色模式、透明通道和非空边界：通过；文件为 64×64 RGBA，Alpha 范围为 0–255，主体在有效留白内。
- `npm test`：通过，23 项。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，6 项。
- `git diff --check`：通过。

## 剩余风险与后续

- Windows 不会像 macOS Template 图标那样自动着色，需在浅色与深色主题、隐藏图标面板以及 100% 至 200% 缩放下真机复核可见性。
- v1.6.0 发布前必须重新构建并检查 Windows 安装包；已有安装包不会自动包含新资源。
- 本次不发布新版本，版本号和发布资料继续保持 v1.5.0，待其他修改合并后统一升级到 v1.6.0。
