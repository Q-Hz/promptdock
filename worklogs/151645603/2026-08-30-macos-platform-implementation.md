# macOS 平台扩展实现

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

按照 `docs/PRD/macOS平台扩展需求文档.md` 落实 PromptDock v1.4.0 的首版 macOS 平台适配，同时保留一套仓库和业务代码。首版 macOS 仅面向 Apple Silicon 与 macOS 11 及以上，由可信协作者在 Mac 手工构建；项目维护者继续在 Windows 控制正式 updater 签名与 GitHub Release。

## 影响范围

- `src/lib/keybindings.ts`、`src/components/SettingsModal.vue`：跨平台默认快捷键、Command 录制与平台化显示。
- `src/lib/i18n.ts`：平台中性的登录启动文案与失败提示。
- `src-tauri/src/main.rs`：跨平台默认快捷键、登录启动错误回滚、macOS 管理窗与 Dock 激活策略、菜单栏图标 template 标记、托盘快捷键显示。
- `src-tauri/tauri.macos.conf.json`：macOS 11、app/DMG 和 ad-hoc signing 配置。
- `scripts/generate-latest-json.ts`：汇总双平台产物，强制校验 Windows/macOS 两份 updater 签名，生成双平台清单与 SHA-256 文件。
- `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`：统一升级到 v1.4.0。
- `package.json`、README 与协作者说明：最低 Node.js 版本统一为 22.6.0，以支持测试脚本使用的 `--experimental-strip-types`。
- `README.md`、`README_CN.md` 与 macOS 协作发布说明：补充 Apple Silicon 安装、Gatekeeper、环境和发布产物说明。
- `tests/keybindings.test.ts`、`tests/generate-latest-json.test.ts`：覆盖 Command、`cmdOrCtrl`、双平台清单、缺失签名、错误架构、URL 编码和校验和格式。
- `scripts/process-app-icon.py`：把选定的高分辨率源稿处理为带透明角和安全留白的 1024×1024 RGBA 图标，并生成明暗背景预览；不会覆盖现有正式图标。
- `src-tauri/icons/`：从确认后的 1024×1024 RGBA 源稿重新生成 Windows ICO、macOS ICNS 以及 32/64/128/256/512 PNG，并在 Tauri bundle 配置中显式引用；另从图标中的 `>_` 标记生成 22/44px macOS Template 菜单栏资源。
- `src-tauri/icons/tray-icon-windows.png` 与 `src-tauri/src/main.rs`：Windows 托盘改用去除外层深色圆角底板的透明专用 PNG，应用主图标与 macOS Template 图标保持不变。
- 2026-08-31 图标复核：确认新绘制的 1024×1024 透明稿为应用图标唯一高清母版，并由 Tauri CLI 生成正式 PNG、ICO 与 ICNS；Windows 托盘 PNG 从同一母版确定性缩小，macOS 菜单栏继续使用独立的单色 Template 资源。未保留项目当前不使用的 Android、iOS 或 Microsoft Store/Appx 图标。

## 重要决策

- 新安装默认保存 `cmdorctrl+shift+space`；已有数据库中的快捷键不做值迁移。
- macOS 管理器显示时采用 Regular 激活策略并显示 Dock，关闭管理器后隐藏窗口并恢复 Accessory 策略。
- Mac 构建使用 ad-hoc Apple 代码签名；正式 Tauri updater 私钥不进入 Mac，由维护者在 Windows 独立签署最终 `.app.tar.gz`。
- 发布清单只接受 `windows-x86_64` 和 `darwin-aarch64`；Windows `.exe.sig` 与 macOS `.app.tar.gz.sig` 是生成清单的必需本地输入，但不作为独立 GitHub Release 资产上传。
- 继续使用同一 updater endpoint、tag、Release 和 `latest.json`。

## 验证

- `npm test`：通过，23 项。
- `npm run build`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，6 项。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `git diff --check`：通过。
- 2026-08-31 图标复核：全部 PNG 尺寸、透明通道和内容相似度符合母版派生预期；Tauri CLI 与 Pillow 的缩放算法存在轻微边缘像素差异，不要求二进制或逐像素相同。ICO 包含 16/24/32/48/64/256，ICNS 包含 16 至 1024 的标准与 Retina 层级；重新运行 `npm run build` 与 `cargo check --manifest-path src-tauri/Cargo.toml` 均通过。

## 剩余风险与后续

- 已生成并接入正式应用图标与 Template 菜单栏资源；仍需在 Apple Silicon 真机检查 Dock、Finder、DMG 和浅色/深色菜单栏显示效果。
- 本机没有 macOS，无法验证 Darwin 编译、DMG、ad-hoc 签名、Dock/Mission Control、LaunchAgent、Gatekeeper 或完整 updater 安装链路；这些属于协作者的发布阻断验收项。
- Windows 自动更新从 v1.3.1 到 v1.4.0 以及 macOS staging 自动更新仍需用最终签名产物实测。
