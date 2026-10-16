<div align="center">

<img src="README_attachment/logo.png" alt="PromptDock Logo" width="128"/>

# PromptDock

**一款轻量的 Windows 与 macOS Prompt 管理与调用工具。**

[![版本](https://img.shields.io/badge/version-2.0.0-2563eb?style=flat-square)](./package.json)
[![平台](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078d4?style=flat-square)](#系统要求)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/backend-Rust-dea584?style=flat-square)](https://www.rust-lang.org/)

[English](./README.md) | [简体中文](./README_CN.md)

[项目主页](https://github.com/Q-Hz/promptdock) · [下载安装包](https://github.com/Q-Hz/promptdock/releases)

</div>

---

PromptDock 让常用提示词随时可用。你可以在本地整理 Prompt，通过轻量调用窗口快速搜索、填写变量、检查生成结果并复制，全程不需要打开浏览器或登录账号。

## 为什么选择 PromptDock？

| 随时调用 | 本地隐私 | 结构化管理 | 灵活模板 |
| :--- | :--- | :--- | :--- |
| 使用全局快捷键，从任意软件快速打开调用窗口。 | Prompt 和设置保存在本地 SQLite 数据库中。 | 使用文件夹、标签、收藏和调用历史整理提示词。 | 通过变量和选项将模板快速生成为可复制的 Prompt。 |

## 主要功能

- **全局调用窗口**：Windows 默认按下 `Ctrl + Shift + Space`，macOS 默认按下 `Command + Shift + Space`，即可从任意软件打开 PromptDock。
- **Prompt 变量**：支持文本变量、默认值、可选值和多选值。
- **提示词管理**：在管理器中创建、编辑、删除、分组、添加标签或收藏 Prompt。
- **快速搜索**：支持搜索 Prompt 标题、标签和文件夹，并可使用键盘选择结果。
- **本地存储**：不需要账号、云服务或远程数据库。
- **导入与导出**：可以通过管理界面的“导入”按钮或拖入单个 JSON 文件导入，也可以导出 JSON。

## 安装与使用

### 系统要求

- Windows 10 或 Windows 11（x64）；或 macOS 11 及以上（Apple Silicon）
- 具备安装桌面软件的权限

### 使用 EXE 安装

1. 打开 [PromptDock Releases 页面](https://github.com/Q-Hz/promptdock/releases)。
2. 下载最新版 `PromptDock_<版本号>_x64-setup.exe`。
3. 运行安装程序，然后从 Windows 开始菜单启动 PromptDock。
4. 按下 `Ctrl + Shift + Space` 打开提示词调用窗口。

PromptDock 会继续在系统托盘中运行。关闭管理器窗口不会退出软件；如果需要完全退出，请在托盘菜单中选择**退出**。

### 使用 DMG 安装（Apple Silicon Mac）

1. 打开 [PromptDock Releases 页面](https://github.com/Q-Hz/promptdock/releases)。
2. 下载最新版 Apple Silicon `.dmg`，打开后把 PromptDock 拖入“应用程序”。
3. 首次打开时，由于当前版本采用 ad-hoc 签名且未经 Apple 公证，macOS 可能阻止启动。请先正常尝试打开，然后前往**系统设置 → 隐私与安全性**，确认应用来源无误后选择**仍要打开**。
4. 启动后按下 `Command + Shift + Space` 打开提示词调用窗口。

请勿为安装 PromptDock 全局关闭 Gatekeeper。受组织策略管理且没有“仍要打开”权限的 Mac 暂不支持。首个 macOS 版本仅支持 Apple Silicon，不支持 Intel Mac。


## 应用界面与使用指南

### 1. 全局调用窗口

在任意软件中按下 `Ctrl + Shift + Space`（默认按键，可在设置中修改），即可唤出调用窗口。输入关键词即可按标题、标签和文件夹快速搜索，全程支持键盘操作。

![调用窗口：搜索 Prompt](README_attachment/zh/launcher-search-zh.png)

### 2. 填写变量并生成

选中包含变量的 Prompt 后，会弹出对应的填写表单，对 Prompt 中预设位置的内容进行填充。支持四种基础变量，以及用于长内容的可选片段组：

| 变量类型 | 语法示例 | 调用时呈现 |
| :--- | :--- | :--- |
| 文本变量 | `{{source_prompt}}` | 输入框 |
| 带默认值的文本变量 | `{{source_prompt=test}}` | 输入框（预填默认值） |
| 可选值 | `{{note_language=[提示词用中文输出\|提示词用英文输出]}}` | 下拉选项 |
| 多选值 | `{{tone+=[正式\|客气\|友好]}}` | 复选框（勾选值用 `, ` 连接） |
| 可选片段组 | `{{@附加要求}}`，配合正文底部定义 | 单段开关或多选，短标题可展开全文 |

![调用窗口：填写变量](README_attachment/zh/launcher-variables-zh.png)

填写时可选择**打开预览**，随输入和片段勾选实时查看生成结果；宽窗口左右排列，窄窗口上下排列，也可随时收起预览。填写页和结果页点击窗口外部均保持打开，按 Esc 逐级返回后退出。生成后选择**复制提示词**，内容进入剪贴板，窗口自动收起。

![调用窗口：生成结果](README_attachment/zh/launcher-result-zh.png)

### 3. Prompt 管理器

从托盘菜单打开管理器，可以创建、编辑、删除 Prompt，并用文件夹、标签和收藏整理。列表中可以直接查看每条 Prompt 的标题、内容和标签。

![管理器：Prompt 列表](README_attachment/zh/manager-list-zh.png)

点击**新建**即可添加 Prompt：填写标题和内容，按需设置标签、文件夹、收藏状态，并在内容中使用变量语法。正文编辑器用文字颜色区分变量语法，从 `:::options` 到 `:::end` 的整个可选片段定义模块使用浅色背景。

### 4. Prompt 导入

可以直接拖入json文件进行提示词的导入
![管理器：Prompt 导入](README_attachment/zh/import-pronot-zh.png)


### 5. 设置

全局快捷键、主题（亮/暗）、界面语言、开机启动和软件更新等选项都可以在设置界面中调整。

![设置界面](README_attachment/zh/settings-zh.png)


## 变量语法

在 Prompt 内容中用双大括号 `{{ }}` 声明变量，调用时即可在弹出的表单中填充：

- **文本变量**：`{{source_prompt}}`，调用时在输入框中填写任意内容。
- **带默认值**：`{{source_prompt=test}}`，等号后为默认值，调用时已预填，可直接修改。
- **可选值**：`{{note_language=[提示词用中文输出|提示词用英文输出]}}`，方括号内用 `|` 分隔候选值，调用时从下拉选项中选择。
- **多选值**：`{{tone+=[正式|客气|友好]}}`，调用时以复选框勾选多个值，勾选的值默认用 `, ` 连接；也可以用 `~` 指定连接符（支持 `\n`、`\t` 转义），例如 `{{lines+=[a|b|c]~\n}}` 会把每个值单独一行拼接。

### 可选片段组：长内容放在底部，正文引用

在需要插入内容的位置写 `{{@组名}}`，在同一条 Prompt 正文底部定义片段：

```text
请检查以下内容。
{{@附加要求}}
请输出检查结果。

:::options 附加要求
:::option [x] 给出修改说明
- 用 {{语言=中文}} 解释主要修改。

:::option [ ] 检查格式
- 检查标题与列表格式。
  保留必要的缩进。
:::end
```

- `:::options 组名` 开始定义，`:::end` 结束；控制标记各自独占一行，组名不能重复。
- `:::option [x] 标题` 表示默认勾选；`:::option [ ] 标题` 表示默认不选。下一行开始的内容属于该片段，直到下一个 `:::option` 或 `:::end`。一个选项就是开关，多个选项就是多选。
- 调用时显示短标题，可以展开只读全文。勾选后才显示片段中的变量填写项；收起全文不会隐藏填写框。片段支持上述四种基础变量，不能继续引用其他组或嵌套定义组。
- 默认项按定义顺序排列，之后按勾选顺序插入；取消后重新勾选追加到末尾。每个片段去掉头尾空白行，内部空行与缩进保留，片段之间以一个换行连接。
- 同名组可以重复引用，勾选和填写一次，各引用位置使用相同结果。同名普通变量也只填写一次；不同组各自维护片段内容。
- 取消勾选会隐藏填写项，并在本次调用暂存填写值；再次勾选恢复。未选片段及其暂存值不参与生成，也不单独触发返回确认。重新调用按模板默认配置初始化。
- 生成时移除全部定义区；没有选中内容时，独占一行的引用连同该行一起删除，行内引用只替换为空，其他固定文字保留。
- 管理器实时显示语法错误及行号，仍允许保存。潜在的同名变量冲突会提前提醒；调用时只有实际使用的定义冲突才阻止生成。请统一同名变量的类型、默认值、候选项和多选连接符。

### 用“提示词标准化”快速编写

软件安装后默认自带一条名为**提示词标准化**的 Prompt。它是一份可发给 AI 的完整语法指南，说明四种基础变量、可选片段组、共享填写项、默认行为与校验规则。

1. 调用“提示词标准化”，填写原始提示词、选择输出语言并补充备注，生成后将完整内容发送给 AI。
2. 填写原始提示词时，AI 会按本软件支持的语法直接改写；留空时，仅确认已理解指南，等待你发送具体任务。
3. 将 AI 给出的 Prompt 正文保存到管理器，在调用界面填写或勾选后生成。

默认安装数据已同步[中文指南](examples/promptdock-syntax-guide.zh.md)与 [English guide](examples/promptdock-syntax-guide.en.md)，保留原始提示词、输出语言和备注填写项。教学示例采用单大括号等记法，在调用时完整保留，并明确要求 AI 输出模板时使用真实的双大括号语法。已有库中的已保存正文不会自动覆盖。

管理器的“查看变量示例”打开“变量语法介绍文档”，按“适用场景 → Prompt 语法 → 调用界面 → 生成结果示例”四列展示每种语法，并保留控件示意。窄窗口可横向滚动对照。测试可选片段功能时，可追加导入[测试 JSON](examples/optional-snippets-test.json)，按[验收步骤](examples/README.md)检查。

## 数据与隐私

PromptDock 的 Prompt 和设置保存在本地：

```text
Windows: %APPDATA%\com.promptdock.app\prompts.db
macOS:   ~/Library/Application Support/com.promptdock.app/prompts.db
```

## 从源码运行

### 环境要求

- [Node.js](https://nodejs.org/) 22 LTS（22.6 或更高版本）
- [Rust](https://rustup.rs/) stable 工具链
- Windows：Microsoft C++ Build Tools（**Desktop development with C++** 工作负载）和 Microsoft Edge WebView2 Runtime
- macOS：Xcode Command Line Tools（运行 `xcode-select --install`）

安装 Rust 后，请重新打开终端并确认 Cargo 能被识别：

```powershell
cargo --version
```

### 启动开发版本

```powershell
git clone https://github.com/Q-Hz/promptdock.git
cd promptdock
npm install
npm run tauri dev
```

## 技术栈

- Tauri 2 与 Rust
- Vue 3、TypeScript 与 Vite
- Tailwind CSS
- SQLite（`rusqlite`）

## 项目结构

```text
src/                         Vue 前端
  components/                调用、管理和设置界面
  lib/                       Tauri API、偏好设置、国际化和 Prompt 工具
src-tauri/                   Rust/Tauri 应用
  src/main.rs                数据库、托盘、快捷键、剪贴板和命令
  src/default-prompts.json   软件内置的默认 Prompt
tests/                       前端工具测试
```

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交修改前，请运行前端与 Rust 测试，并避免提交本地数据库、导出的个人 Prompt 文件或构建产物。

## 致谢

PromptDock 的产品思路在一定程度上受到 [PromptDeck 浏览器插件](https://www.promptdeck.site/) 的启发。目前 PromptDock 仍兼容导入 PromptDeck 导出的 JSON 文件（`format: "promptdeck"`），同时也支持 `promptdock` 格式；由 PromptDock 导出的文件使用 `promptdeck` 格式。
