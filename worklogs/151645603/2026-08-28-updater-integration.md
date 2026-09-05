# 2026-08-28 接入 tauri-plugin-updater 应用内自动更新

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

此前升级 PromptDock 必须先卸载再重装，流程繁琐。本次接入 Tauri 官方
`tauri-plugin-updater`，支持两种更新方式：

- 启动时后台自动检查（设置项，默认关闭）；发现新版本时弹原生对话框确认安装。
- 管理器设置页手动"检查更新"按钮，显示状态与下载进度，确认后安装并重启。

更新清单端点为
`https://github.com/Q-Hz/promptdock/releases/latest/download/latest.json`。

## 影响范围

- `src-tauri/Cargo.toml`、`Cargo.lock`：新增 `tauri-plugin-updater` 依赖。
- `src-tauri/src/main.rs`：Settings 增加 `auto_check_update` 字段；新增
  `PendingUpdate` 状态、`UpdateInfo`、`check_for_updates` / `install_update`
  命令；启动时按设置自动检查；`update-download-progress` 进度事件。
- `src-tauri/tauri.conf.json`：`plugins.updater`（公钥、端点、
  `installMode: passive`）、`bundle.createUpdaterArtifacts: true`。
- `src/lib/api.ts`：`Settings.autoCheckUpdate`、`UpdateInfo`、两个命令包装。
- `src/components/SettingsModal.vue`："软件更新"区块。
- `src/lib/i18n.ts`：中英文文案（14 个新键）。
- 测试断言更新：`old_databases_receive_safe_setting_defaults`。

## 重要实现决策

- **检查与安装全部在 Rust 侧**：托盘常驻 + 双窗口架构下避免 JS 多窗口重复检查；
  前端只渲染状态并调用命令。也因此未新增任何 JS 依赖和 capability 权限。
- **自动检查默认关闭**：按用户要求，`auto_check_update` 缺省为 `false`，
  老数据库读取时同样取 `false`。
- **自动检查命中后用原生对话框确认**（tauri-plugin-dialog Rust API）：
  管理窗口未打开时也能提示；确认后再下载安装。
- **重启用 tauri 核心 `AppHandle::restart()`**：无需 tauri-plugin-process。
- **签名密钥对**：2026-08-28 生成，私钥
  `C:\Users\ROG\.tauri\promptdock.key`（无密码，不在仓库内），公钥已写入
  `tauri.conf.json`。
- 数据结构兼容：`auto_check_update` 以 `"0"/"1"` 存于现有 `settings` 表，
  与 `autostart` 约定一致，无 schema 变更。

## 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过（先自动修复一处格式）。
- `cargo check`：通过。
- `cargo test`：5 通过 0 失败。
- `npm test`：14 通过 0 失败。
- `npm run build`（vue-tsc + vite）：通过。
- `git diff --check`：无空白问题。
- **带签名构建（`npm run tauri build`）**：成功产出 1.3.0 的
  `release/release/bundle/nsis/PromptDock_1.3.0_x64-setup.exe` 与 `.exe.sig`。
  端到端的下载/安装链路仍待发布 Release 后验证。

## 构建实测要点（踩过的坑）

- 编译产物被 `.cargo/config.toml` 的 `target-dir = "release"` 重定向，
  实际路径是 `release/release/bundle/nsis/`，不是 `src-tauri/target/`。
- 当前 `@tauri-apps/cli` 2.11.x **只认 `TAURI_SIGNING_PRIVATE_KEY`（私钥内容）**，
  不认 `TAURI_SIGNING_PRIVATE_KEY_PATH`（文件路径）；后者会报
  "found public key but no private key"。
- **必须**同时把 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 显式设为空字符串，
  否则构建在"解密签名私钥"一步会交互式等待输入密码而卡死（看似无响应）。
- 该 CLI 版本对 NSIS **直接给 `.exe` 签名**（产出 `.exe.sig`），不再生成
  `.nsis.zip`；更新器运行时对 zip / 裸 exe 两种格式都能自适应处理。
- `profile.release` 开了 `lto` + `codegen-units = 1`，release 链接约 5 分钟，
  属正常耗时，不是卡死。

## 遗留风险与后续

- **首次发版前"检查更新"会报错**（清单 404），属预期；需按
  `docs/自动更新方案说明（Updater接入）.md` 第 5 节流程发布带签名构建的
  Release（版本号须高于 1.2.0）。
- 私钥丢失将导致无法发布可被接受的更新，需妥善备份。
- 自动检查对话框路径下的安装失败仅被静默忽略（无窗口可展示）；手动路径有错误提示。
- 后续可选：GitHub Actions 自动化发版。
