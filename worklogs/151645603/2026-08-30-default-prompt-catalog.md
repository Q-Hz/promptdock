# 更新内置默认提示词模板

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

将新安装 PromptDock 时写入空数据库的内置提示词，从原有 5 条替换为 `docs/test.json` 中确认的 12 条模板，使发布版本默认内容与用户提供的模板集一致。

## 影响范围

- `src-tauri/src/default-prompts.json`：替换为新的 `promptdeck` v1 模板数据。
- `src-tauri/src/main.rs`：更新内置模板测试，校验 12 条提示词及其标题。

## 重要决定

- 保留源文件中的 ID、正文、标签、文件夹、收藏状态和时间字段，不做二次改写。
- 默认模板只在提示词表为空时写入，因此不会覆盖或追加到已有用户数据库。

## 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm test`
- `git diff --check`

## 风险与后续

- 已有安装如果数据库中已有提示词，不会自动获得这组新模板；用户可通过导入文件获取。
