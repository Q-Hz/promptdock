# 版本号升级至 v1.3.1（自动更新验证用途）

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

日期：2026-08-28

## 摘要与动机

v1.3.0 已接入应用内自动更新（tauri-plugin-updater）。为了验证更新链路端到端可用，需要构建一个更高版本的安装包（v1.3.1），发布到 GitHub 后，已安装 v1.3.0 的客户端应能检测到更新并完成升级。

本次仅做版本号变更，不含功能改动。

## 影响文件

- `package.json`：version 1.3.0 -> 1.3.1（通过 `npm version 1.3.1 --no-git-tag-version`）
- `package-lock.json`：根包与 packages."" 版本同步更新（由 npm 自动生成）
- `src-tauri/tauri.conf.json`：version 1.3.0 -> 1.3.1
- `src-tauri/Cargo.toml`：version 1.3.0 -> 1.3.1
- `src-tauri/Cargo.lock`：promptdock 条目同步（通过 `cargo update -p promptdock --precise 1.3.1`）

## 验证

- `npm version` 与 `cargo update` 均执行成功，锁文件由工具更新，未手工编辑。
- `git diff --stat` 确认仅上述 5 个文件变更，无其他无关改动。
- 纯版本号变更，未运行构建；后续由用户本地执行 `npm run tauri build` 打包。

## 后续步骤（由用户手动执行）

1. 使用签名密钥构建安装包，确保生成 updater 所需的 `.nsis.zip` 与 `.sig`。
2. 上传产物至 GitHub Releases（Q-Hz/promptdock）并更新 latest.json，使版本与平台字段指向 1.3.1。
3. 在已安装 v1.3.0 的机器上启动应用，验证更新提示、下载与重启升级流程。

## 风险与说明

- 该版本仅用于验证更新链路；验证完成后如需正式发布，应决定是否保留或清理此补丁版本。
