# 2026-08-30 macOS 协作构建与自动更新操作手册

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

在 macOS 平台扩展方案确认后，补充一份面向 Apple Silicon Mac 协作者和 Windows 项目维护者的可执行操作手册。文档明确环境安装、固定 commit 构建、真机验收、产物交付、跨机器 updater 签名、staging 更新验证和 GitHub Release 资产清单。

## 影响的文件

- 新增 `docs/自动更新方案说明（macOS协作构建与发布）.md`；
- 在 macOS PRD 和既有 Windows updater 说明中增加相互引用；
- 新增本 worklog；
- 未修改应用代码、配置、版本号或发布资产。

## 关键决策

- 只维护单仓库和一套业务代码；macOS v1.4.0 首版只支持 Apple Silicon；
- 协作者在固定 commit SHA 上构建 ad-hoc 签名的 DMG 与 `.app.tar.gz`，不接触正式 updater 私钥；
- 构建若要求 updater 私钥，协作者使用一次性临时密钥生成归档并丢弃临时签名；
- 项目维护者复核 SHA-256 后，在 Windows 使用当前 Tauri CLI 的 `signer sign` 对最终 `.app.tar.gz` 独立签名；
- 正式发布前，由协作者通过本地 staging endpoint 完成一次真实 macOS 自动更新；
- GitHub Release 同时包含 Windows NSIS、Apple Silicon DMG、macOS updater archive、签名、统一 `latest.json` 和 SHA-256 清单。

## 验证

- 逐项核对当前 `package.json`、`.cargo/config.toml`、`tauri.conf.json`、更新清单脚本、测试和现有 Windows updater 文档；
- 本地执行 `npx tauri signer generate --help`、`npx tauri signer sign --help` 和 `npx tauri build --help`，确认临时密钥生成、独立文件签名和 target/config 参数；
- 以 Tauri 官方 prerequisites、macOS bundle、DMG、code signing 和 updater 文档校准命令与产物类型；
- 检查文档未写入真实私钥内容、数据库或个人 Prompt 数据。

## 遗留事项与风险

- 当前 v1.3.1 尚未实现 macOS 适配，手册中的正式构建流程只能在 PRD 适配完成后执行；
- `npm run latest-json -- --artifact-dir ...` 是 macOS 适配阶段需要实现的发布接口，当前脚本仍只支持 Windows；
- staging 本地更新配置必须保持未提交状态，不能进入正式产物；
- 最终产物路径和文件名需在第一次 Apple Silicon 真机构建后按 Tauri 实际输出复核。
