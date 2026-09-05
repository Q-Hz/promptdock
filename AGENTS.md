# Agent 工作指南

最后更新：2026-09-05

## 1. 目的与优先级

- `AGENTS.md` 是 agent 在本仓库工作的必读项目入口。
- 本文件规定仓库阅读顺序、目录职责、变更记录要求、命令使用规则和验证要求。
- 用户的明确指令优先于本指南。
- 修改范围应限定于当前任务。除非用户明确要求，否则不得升级版本、发布 Release 或更改运行时签名。

## 2. 开发环境与技术栈

- 主要 Shell：PowerShell。使用 `Get-Content -Encoding UTF8` 读取 UTF-8 文件。
- 应用技术栈：
  - `src/`：Vue 3、TypeScript、Vite 和 Tailwind CSS。
  - `src-tauri/`：Tauri 2 和 Rust。
  - 通过 `rusqlite` 访问 SQLite。
  - 使用 Node 内置 test runner 执行前端工具函数测试。

## 3. 阅读顺序

1. 首先阅读本文件。
2. 阅读 `README.md` 或 `README_CN.md` 中与任务相关的部分，了解产品行为、环境配置和架构背景。
3. 检查 `worklogs/` 中与任务相关的历史变更。
4. 需要本地产品或设计资料且存在 `docs/README.md` 时，先阅读该入口，再按需阅读相关文件；公开仓库不包含此目录，不应默认依赖它。
5. 阅读受影响的源文件及其直接关联的测试。
6. 涉及前后端交互的修改，须同时阅读 `src/lib/api.ts`，以及 `src-tauri/src/main.rs` 中对应的 Tauri command 和 handler 注册。
7. 仅在相关时阅读配置文件：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 和 `src-tauri/capabilities/default.json`。

避免大范围扫描生成物、依赖或发布目录。优先按任务范围定向读取和搜索。

## 4. 项目架构与目录职责

- `src/`
  - Vue 前端和共享 TypeScript 代码。
  - `components/`：启动器、管理器和设置界面。
  - `lib/api.ts`：Tauri command 的类型化前端封装。
  - `lib/preferences.ts`：前端偏好设置辅助函数。
  - `lib/i18n.ts`：面向用户的中英文文案。
  - `style.css`：共享视觉样式。
- `src-tauri/`
  - Rust/Tauri 桌面应用。
  - `src/main.rs`：SQLite 访问、command、窗口、托盘、全局快捷键、剪贴板、导入导出和事件连接。
  - `src/default-prompts.json`：内置 Prompt 数据。
  - `capabilities/default.json`：Tauri capability 权限。
  - `tauri.conf.json`：应用和打包配置。
- `tests/`
  - 通过 `npm test` 执行的前端工具函数测试。
- `docs/`
  - 不公开的本地资料目录；存在时，其使用说明见 `docs/README.md`。
- `worklogs/`
  - 本项目统一的变更记录目录，详见第 5 节。
- `dist/`、`release/`、`release-artifacts/`、`src-tauri/target/`、`src-tauri/gen/` 和 `node_modules/`
  - 生成物或依赖。除非用户明确要求，否则不得检查或编辑。

## 5. 变更记录（`worklogs/`）

- `worklogs/` 是本项目的变更记录目录。
- 实现修改前，应查看已有的相关日志，避免重复已有决策或已知问题。
- 涉及行为、代码、配置、数据格式或发布的修改，须在同一任务中创建或更新简明的 worklog。
- 每项完整且相关的变更优先使用一个文件，命名为 `YYYY-MM-DD-short-topic.md`。主题名称应稳定且具有描述性，仅在避免歧义时添加数字后缀。
- 新日志存放于 `worklogs/<GitHub numeric user ID>/YYYY-MM-DD-short-topic.md`，目录不存在时创建。这里的 ID 属于对该工作负责的人类开发者，不是 agent 或模型的标识，也不能直接套用仓库所有者或最近提交者的 ID。
- 根据任务中明确提供的身份，或该开发者已经核实的身份映射，确定开发者身份。仅知道 GitHub 用户名时，查询 `https://api.github.com/users/<username>`，使用 GitHub 返回的数字 `id`。不得仅凭仓库 remote、本地 Git 姓名或邮箱、已有日志推断归属。无法确定身份时，使用 `worklogs/unassigned/`，将作者标为待确认，并在交接说明中报告；不得猜测或复制其他贡献者的 ID。
- 目录名仅包含 GitHub 数字用户 ID。用户名和邮箱可能变化，不得用作目录分类依据。账号改名或更换邮箱时，不移动日志。换用其他 GitHub 账号时，使用该账号自己的 ID 目录，并保留历史归属、记录账号变更关系。
- 在每篇日志标题下方填写作者元信息：`Author (GitHub): @<username>` 和 `Author ID: github.com:<numeric ID>`，附上主页链接及 ID 查询链接 `https://api.github.com/user/<numeric ID>`。字段标签可使用含义相同的中文。用户名仅是记录时的展示信息，账号改名后通过数字 ID 查询当前账号。不得为此收集或公开邮箱。
- 多人共同完成的工作，在主记录者的 ID 目录中保留一篇日志，并列出所有贡献者、各自数字 ID 和职责。修改已有日志时，保留原目录和原作者，追加修改者身份及日期，不替换原归属。
- 可行时，将相关附件与日志放在同一目录。移动日志或附件时，更新受影响的相对链接。示例及历史归属限制见 `worklogs/README.md`；本规则适用于所有贡献者，不得默认将新工作归入任何已有 ID 目录。
- 每篇 worklog 至少包含：
  - 摘要与修改动机；
  - 受影响的区域或文件；
  - 重要实现决策；
  - 验证命令和结果；
  - 剩余风险、限制或后续工作。
- 日志应客观记录改了什么、如何验证，不替代产品需求文档。
- 不得在日志中写入密钥、凭据、本地数据库内容、个人 Prompt 导出或其他敏感用户数据。
- `worklogs/` 按当前 `.gitignore` 规则参与版本管理。公开日志不得包含本地私有资料；不得强制添加被忽略的附件。
- 纯解释性答复和只读调查无需新建日志。如果调查形成可复用的项目决策或发现长期存在的已知问题，可在有帮助时记录。

## 6. 实现规则

- 保留用户已有修改，避免无关清理。
- 优先采用满足需求的最小完整修改。
- 行为变更在可行时采用 `Red -> Green -> Refactor`：先新增或修改测试使其失败，再实现修改，最后在不改变行为的前提下简化代码。
- 保持前端 Tauri command 名称、参数结构、返回类型、Rust command 实现与 `generate_handler!` 注册同步。
- 新增用户文案时，须更新 `src/lib/i18n.ts` 中两种受支持语言，除非任务明确限定本地化范围。
- 新增 Tauri plugin 或特权 API 时，按需更新 Rust 依赖、JavaScript 依赖、plugin 初始化和 capability 权限。权限范围不得超出功能需要。
- 保持持久化 SQLite 数据、设置和导入导出 JSON 的向后兼容性。任何 schema 或数据格式变化都必须包含 migration 或明确的兼容方案，并在 `worklogs/` 中记录。
- 除非明确要求，否则不得读取、修改或提交本地数据库或导出的个人 Prompt 数据。
- 不得手工修改生成的 lockfile。依赖变更获得明确授权后，由对应 package manager 更新。
- 除非明确要求，否则不得升级版本、生成安装包、进行代码签名或发布 Release。

## 7. 命令使用规则

- 优先使用 `rg` 和 `rg --files` 搜索内容与查找文件。
- Windows 下若直接执行命令因 sandbox 进程创建或路径处理失败，应先通过 PowerShell 重试同一操作，再考虑改变方案。
- 前端依赖和脚本使用 `npm`；仓库统一的 lockfile 为 `package-lock.json`。
- 在仓库根目录执行 Rust 检查时，使用 Cargo 并指定 `--manifest-path src-tauri/Cargo.toml`。
- 安装或更新依赖、访问网络必须有明确的任务需要，不得顺便刷新依赖。
- patch 中使用相对于仓库根目录的路径，并使用正斜杠。

常用命令：

```powershell
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

`npm run tauri dev` 会启动桌面 GUI，仅在需要交互验证时使用。验证结束后，不得留下仍在运行的开发进程。

## 8. 验证要求

- 仅修改文档：检查最终 diff、Markdown 结构和路径，无需构建代码。
- 修改前端或共享 TypeScript：运行 `npm test` 和 `npm run build`。
- 修改 Rust/Tauri 后端：运行 Cargo 格式检查、check 和测试。
- 涉及前后端交互或应用行为的修改：运行前端和 Rust 两侧验证；可行时进行针对性的手动 Tauri 验证。
- 修改配置、权限、打包或依赖：运行相关前端和 Rust 验证，并明确报告无法在本地验证的内容。
- 修改代码后，在报告完成前检查 `git diff --check` 和 `git status --short`。
- 不得声称未实际执行的检查已通过。须说明跳过或受阻的检查及原因。

## 9. Git 与安全规则

- 本工作区位于 Windows，检查和报告仓库状态时使用 Windows Git。
- 不得丢弃、覆盖、暂存或提交与任务无关的用户修改。
- 未获得明确授权并核实目标前，不得使用破坏性的 Git 或文件系统命令。
- 不得提交生成物、本地数据库、环境文件、运行日志、个人导出或密钥。
- 遵守 `.gitignore`。`docs/` 仅保存在本地，不提交或公开；除非用户明确要求，否则不得改变其忽略策略。
- 报告仓库状态时，区分任务开始前已有的修改与本次任务的修改。

## 10. 完成检查清单

结束变更任务前：

1. 确认请求的行为和范围已完整实现。
2. 按需更新或新增受影响的测试。
3. 根据修改范围完成相应验证。
4. 第 5 节要求记录时，创建或更新对应的 `worklogs/` 变更日志。
5. 检查 diff，排除无关修改、敏感数据、生成文件和意外的大范围格式变化。
6. 报告结果、修改文件、验证结果，以及剩余风险或后续工作。
