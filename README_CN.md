<div align="center">

# PromptDock

**一款快速、本地优先的 Windows Prompt 管理与调用工具。**

[![版本](https://img.shields.io/badge/version-1.1.0-2563eb?style=flat-square)](./package.json)
[![平台](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square)](#系统要求)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/backend-Rust-dea584?style=flat-square)](https://www.rust-lang.org/)

[English](./README.md) | [简体中文](./README_CN.md)

[项目主页](https://github.com/Q-Hz/promptdock) · [下载 EXE](https://github.com/Q-Hz/promptdock/releases)

</div>

---

PromptDock 让常用提示词随时可用。你可以在本地整理 Prompt，通过轻量调用窗口快速搜索、填写变量、检查生成结果并复制，全程不需要打开浏览器或登录账号。

## 参考来源

PromptDock 是一款独立开发的 Windows 桌面应用，产品思路参考了 [PromptDeck 浏览器插件](https://www.promptdeck.site/)。它将类似的本地优先提示词库和变量填写流程扩展到了 Windows 全局调用场景，不再局限于插件支持的网页。

PromptDock 可以直接导入 PromptDeck 导出的 JSON 文件（`format: "promptdeck"`），同时兼容 `promptdock` 格式；由 PromptDock 导出的文件仍使用 `promptdeck` 格式。PromptDock 是独立实现，并非 PromptDeck 官方桌面客户端。

## 为什么选择 PromptDock？

| 随时调用 | 本地隐私 | 结构化管理 | 灵活模板 |
| :--- | :--- | :--- | :--- |
| 使用全局快捷键，从任意软件快速打开调用窗口。 | Prompt 和设置保存在本地 SQLite 数据库中。 | 使用文件夹、标签、收藏和调用历史整理提示词。 | 通过变量和选项将模板快速生成为可复制的 Prompt。 |

## 主要功能

- **全局调用窗口**：默认按下 `Ctrl + Shift + Space`，即可从任意软件打开 PromptDock。
- **Prompt 变量**：支持文本变量、默认值、可选值和多选值，例如 `{{topic}}`、`{{count=15}}`、`{{tone=[正式|友好]}}` 和 `{{tags+=[React|Vue|Svelte]}}`。多选变量在调用时以复选框呈现，勾选的值用 `, ` 连接；也可以用 `~` 指定连接符（支持 `\n`、`\t` 转义），例如 `{{lines+=[a|b|c]~\n}}` 会把每个值单独一行拼接。
- **提示词管理**：在管理器中创建、编辑、删除、分组、添加标签或收藏 Prompt。
- **快速搜索**：支持搜索 Prompt 标题、标签和文件夹，并可使用键盘选择结果。
- **本地存储**：不需要账号、云服务或远程数据库。
- **导入与导出**：可以导入 `promptdeck` 和 `promptdock` JSON；软件导出的文件保持 `promptdeck` 格式兼容。

## 安装与使用

### 系统要求

- Windows 10 或 Windows 11（x64）
- 具备安装桌面软件的权限

### 使用 EXE 安装

1. 打开 [PromptDock Releases 页面](https://github.com/Q-Hz/promptdock/releases)。
2. 下载最新版 `PromptDock_<版本号>_x64-setup.exe`。
3. 运行安装程序，然后从 Windows 开始菜单启动 PromptDock。
4. 按下 `Ctrl + Shift + Space` 打开提示词调用窗口。

PromptDock 会继续在系统托盘中运行。关闭管理器窗口不会退出软件；如果需要完全退出，请在托盘菜单中选择**退出**。


## 基本使用流程

1. 从托盘菜单打开 **Prompt 管理器**。
2. 新建 Prompt，并根据需要设置标签、文件夹、收藏状态和变量。
3. 按下全局快捷键，搜索刚才创建的 Prompt。
4. 选中 Prompt、填写变量并生成最终内容。
5. 检查生成结果，然后选择**复制并关闭**。

全局快捷键、主题、语言和开机启动选项都可以在**设置**中修改。

## 使用 AI 优化提示词

如果已有常用提示词，可以使用软件内置的 “提示词标准化” 进行优化：

1. 打开 “提示词标准化”，输入需要优化的原始提示词。
2. 让 AI 根据要求生成更加清晰、规范的提示词。
3. 将优化后的提示词添加到 Prompt 管理器，并需要设置标签、文件夹、收藏状态和变量。

之后即可通过全局快捷键快速搜索和使用这些 Prompt。

## 数据与隐私

PromptDock 的 Prompt 和设置保存在本地：

```text
%APPDATA%\com.promptdock.app\prompts.db
```

## 从源码运行

### 环境要求

- [Node.js](https://nodejs.org/) 20 LTS 或更高版本
- [Rust](https://rustup.rs/) stable 工具链
- Microsoft C++ Build Tools，并安装 **Desktop development with C++（使用 C++ 的桌面开发）** 工作负载
- Microsoft Edge WebView2 Runtime

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
