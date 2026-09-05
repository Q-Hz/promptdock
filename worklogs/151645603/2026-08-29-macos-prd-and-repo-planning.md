# 2026-08-29 macOS 平台扩展 PRD

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

用户计划开发 PromptDock macOS 版（对 Windows 版功能对等复刻）。初稿把产品需求和工程组织拆成两份且保留了多个待选方案；审核后已收敛为一份可执行 PRD。本次为纯文档交付，未改动代码与配置。

## 影响的文件

- 保留并重写 `docs/PRD/macOS平台扩展需求文档.md`，合并产品、仓库、构建、发布和密钥管理结论；
- 删除重复的 `docs/仓库与文档组织规划（macOS扩展）.md`；
- 文档位于 `.gitignore` 覆盖范围内，不进入远程仓库。

## 关键决策

调研结论（决定方案形态）：

- Rust 侧零 `cfg(target_os)` 条件编译，autostart 已配置 `MacosLauncher::LaunchAgent`，代码基本天然跨平台；
- 真正的适配点集中在：默认热键与 `metaKey` 录制（`SettingsModal.vue`）、显示名（`keybindings.ts`）、i18n 自启动文案、bundle targets（只有 nsis）、`.icns` 图标缺失（源图最大 256）、`generate-latest-json.ts` 只输出 `windows-x86_64`、启动器无边框透明窗口行为验证。

最终决策：

- 单仓库、单 `main`、双平台同版本 / tag / Release / `latest.json`；首个双平台版本确定为 v1.4.0；
- 项目维护者没有 Mac；macOS 由可信协作者在 Apple Silicon Mac clone 固定 commit 后手工构建并完成真机验收；
- 首版只支持 Apple Silicon，不构建 Intel 或 universal binary；
- 协作者只交付 DMG、`.app.tar.gz`、SHA-256 和验收记录，不接触正式 updater 私钥；项目维护者在 Windows 本机使用 Tauri CLI 对最终 `.app.tar.gz` 独立签名；
- macOS 本期使用 ad-hoc 签名，不做 Developer ID 正式签名和 Apple 公证；Gatekeeper 指引采用 Apple 当前的“隐私与安全 → Open Anyway”流程并如实提示风险；
- macOS 最低版本定为 11.0；
- macOS 默认热键确定为 `Command+Shift+Space`；已有设置不做猜测性迁移；
- 后台与启动器不占 Dock，管理窗显示时显示 Dock 图标；
- `docs/`、`worklogs/` 保持本地不入库；用户可见内容必须写入 README 与 Release 说明。

## 验证

- 文档类变更按 AGENTS.md §8 检查 Markdown 结构、内部链接与文件路径；
- 方案与当前 `main.rs`、`SettingsModal.vue`、`keybindings.ts`、`i18n.ts`、`tauri.conf.json`、更新清单脚本和测试交叉核对；
- macOS 最低版本、ad-hoc 签名、更新产物与 Gatekeeper 流程以 Tauri / Apple 官方文档校准；
- 本地执行 `npx tauri signer sign --help`，确认当前 CLI 支持对协作者交付的 `.app.tar.gz` 独立签名；
- `git status --short` 用于确认没有代码或配置改动。

## 遗留事项与风险

正式发布仍依赖 1024×1024 无损图标和可信协作者的 Apple Silicon 真机构建与验收。Developer ID / 公证延后会造成 Gatekeeper 转化损耗，此风险已接受但必须公开说明。Updater 私钥只保留在项目维护者本机与离线备份中；不得进入仓库、协作者环境、构建产物、日志或文档，在存量客户端迁移方案完成前不得轮换密钥对。
