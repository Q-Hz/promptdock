# 修复 Windows 2.0.0 启动时状态未注册导致的崩溃

Author (GitHub): 待确认
Author ID: 待确认（未提供已核实的人类开发者身份，暂存于 `unassigned/`）

## 摘要与原因

本机已安装的 2.0.0 EXE 启动后立即退出。Windows Application Error 记录异常码 `0xc0000409`；在沙箱外捕获程序标准错误，确认实际错误为 `state() called before manage() for promptdock::LauncherGuardReady`，随后在 WebView2 回调中触发不可展开的 panic 并终止进程。

Tauri 先创建配置中自动启动的窗口，再执行应用的 `setup`。正式构建的页面从本地资源快速加载，创建另一个窗口时即可处理 IPC，导致调用窗口提前执行 `set_launcher_guard_ready`。原实现此时尚未注册后端状态。开发页面和数据库单元测试没有覆盖这一真实启动时序。

## 修改与决策

- `src-tauri/tauri.conf.json`：调用窗口和管理器窗口均设为 `create: false`，保留窗口原有属性。
- `src-tauri/src/main.rs`：在数据库、全部共享状态、托盘和快捷键完成初始化后，使用 `WebviewWindowBuilder::from_config` 创建配置中的窗口，再应用主题和首次引导逻辑。所有初始页面的 IPC 都在后端状态可用后开始，覆盖数据库和其他握手状态的同类风险。
- 新增 Rust 配置回归检查，防止任一初始窗口重新启用 Tauri 的提前自动创建。实际 EXE 启动用于验证完整生命周期。
- 保持版本 2.0.0、依赖、数据库结构、更新签名及导入导出格式不变。只重新编译 EXE，不生成安装包或发布。

## 验证

- Red：旧 EXE 在沙箱外启动退出码为 `-1073740791`，标准错误确认上述状态注册 panic；新配置检查在旧配置上按预期失败。
- 沙箱内第一次启动报告数据库只读，这是沙箱禁止写入应用数据目录造成的干扰；未将该结果作为产品根因。在沙箱外复测后才确认状态注册问题。
- `npm test`：118 项通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml --offline`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --offline`：77 项通过，包含新增配置检查。
- `powershell -Command "npm run tauri build -- --no-bundle -- --offline"`：正式模式编译通过，产出 `release/release/promptdock.exe`。沙箱内构建子进程被 `spawn EPERM` 拦截，经 PowerShell 重试后仍失败；获准在沙箱外执行同一离线命令后成功。
- 新 EXE 连续三次真实启动，每次观察 7 秒，全部保持运行且标准错误为 0 字节；第三次再启动同一 EXE，第二实例正常退出，原实例成功打开“PromptDock 管理器”并响应。
- 获准备份并替换本机安装目录中的 EXE。旧文件保存为 `promptdock.exe.startup-bug-20261017-222015.bak`，备份 SHA-256 与故障原文件一致。替换后 SHA-256 与新构建一致，仍为版本 2.0.0。
- 从安装目录启动修复版并观察 10 秒，再启动第二实例成功唤起管理器，窗口响应且标准错误为 0 字节。保留该安装版运行，三次验证启动的临时进程均已退出。
- `git diff --check`：通过；最终检查仅有本次两个源码/配置文件、新增日志，以及开始前已有的未跟踪分享 JSON。

## 限制与交接

- 未直接读取、导出、编辑或重置实际用户数据库；真实启动按应用原有逻辑访问本地数据。
- 本轮针对 Windows 本机启动问题，未验证 macOS；macOS 配置复用同一窗口创建策略。
- 现有 2.0.0 安装包未重新生成或发布，后续分发前须使用本次修复重新打包。原生验证覆盖启动与第二实例打开管理器，未重复全部功能交互测试。
- 开始时已有一份未跟踪的个人分享 JSON，本轮保留且未读取。未暂存或提交。
- 人类开发者 GitHub 身份仍待确认。

## 2026-10-17 提交与版本提交顺序

修改者身份：待确认。

- 按用户要求，仅提交本次启动修复的两个源码/配置文件及本日志，保留原有未跟踪分享 JSON。
- 将启动修复置于“更新版本至 2.0.0”之前，重新应用原版本提交的八个文件变更，使版本提交成为本地分支末端；原版本提交为 `e7c4106`，重排后提交哈希会改变。
- 重排前保留本地备份分支；不推送、不修改远端或创建版本标签。重排后核对最终文件树与重排前修复提交一致，沿用上述已完成的测试与正式 EXE 启动验证。
