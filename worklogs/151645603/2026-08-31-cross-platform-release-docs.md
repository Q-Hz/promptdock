# 重构跨平台协作构建与发布文档

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 摘要与动机

将原先同时面向维护者和 macOS 协作者的长篇发布说明拆分为三层职责，减少固定 SHA、产物交付、签名和 Release 流程的重复描述，并降低协作者在构建失败后自行修改源码的风险。

## 影响范围

- 新增 `docs/跨平台协作构建与发布总流程.md`：负责角色、阶段、交接输入输出和发布门槛。
- 重构 `docs/自动更新方案说明（macOS协作构建与发布）.md`：仅保留 Mac 环境、固定 SHA、验证、构建、真机验收、报告和交付操作。
- 重构 `docs/自动更新方案说明（Updater接入）.md`：负责 Windows 构建、正式 updater 签名、双平台 `latest.json`、tag 和 GitHub Release。

## 重要决定

- 详细命令只放在负责执行该动作的文档中；总流程只串联责任和交接。
- macOS 协作者遇到失败必须停止并反馈，不得修改源码、依赖或锁文件；`Source deviation: none` 是交付门槛。
- 正式 updater 私钥和两平台正式签名只由 Windows 项目维护者处理。
- Windows 构建可与 Mac 构建并行，但正式 `latest.json` 和 Release 必须等待合格的 Mac 交付。
- `docs/` 继续保持 Git 忽略状态，本次不改变仓库文档策略。
- Windows updater 说明补充现有密钥检查、首次生成和异常密钥更换流程；明确禁止普通发版覆盖密钥，并记录旧客户端公钥迁移限制。

## 验证

- 三份文档的 Markdown 围栏均成对闭合。
- 三份文档的相对链接均能解析到现有文件。
- 15 个 Windows PowerShell 代码块均通过 PowerShell 语法解析。
- 边界搜索确认 macOS 文档不包含 Windows 签名、复制、tag 或 `latest-json` 命令；Windows 文档不包含 Mac 环境安装、`shasum`、`codesign` 或 `hdiutil` 命令。
- 检查完整 SHA 示例为 40 位，未残留模板替换字符或明显列表格式错误。

## 风险与后续

- 文档中的版本号和产物示例以 v1.4.0 为主，后续发版需同步更新版本示例。
- Mac 命令仍需由 Apple Silicon 协作者按正式固定 SHA 实际执行并反馈；Windows 环境无法代替真机验证。
