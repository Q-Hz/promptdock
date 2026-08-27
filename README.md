<div align="center">

# PromptDock

**A fast, local-first prompt manager and launcher for Windows.**

[![Version](https://img.shields.io/badge/version-1.1.0-2563eb?style=flat-square)](./package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square)](#system-requirements)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?style=flat-square)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/backend-Rust-dea584?style=flat-square)](https://www.rust-lang.org/)

[English](./README.md) | [简体中文](./README_CN.md)

[Project repository](https://github.com/Q-Hz/promptdock) · [Download EXE](https://github.com/Q-Hz/promptdock/releases)

</div>

---

PromptDock keeps reusable prompts one shortcut away. Organize prompts locally, search them from a lightweight launcher, fill in variables, review the generated text, and copy it without opening a browser or signing in to an account.

## Inspiration

PromptDock is an independent Windows desktop application inspired by the [PromptDeck browser extension](https://www.promptdeck.site/). It brings a similar local-first prompt library and variable workflow to a system-wide desktop launcher instead of limiting prompt access to supported web pages.

PromptDock can import JSON files exported by PromptDeck (`format: "promptdeck"`). It also accepts the `promptdock` format for backward compatibility, while files exported by PromptDock continue to use the `promptdeck` format. PromptDock is an independent implementation and is not an official PromptDeck desktop client.

## Why PromptDock?

| Instant access | Local and private | Structured library | Flexible templates |
| :--- | :--- | :--- | :--- |
| Open the launcher from anywhere with a global shortcut. | Prompts and settings stay in a local SQLite database. | Organize prompts with folders, tags, favorites, and usage history. | Turn reusable variables and choices into a ready-to-copy prompt. |

## Key features

- **Global launcher** — Press `Ctrl + Shift + Space` by default to open PromptDock from any application.
- **Prompt variables** — Use text variables, defaults, selectable values, and multi-select values such as `{{topic}}`, `{{count=15}}`, `{{tone=[formal|friendly]}}`, and `{{tags+=[React|Vue|Svelte]}}`. Multi-select variables render as checkboxes in the launcher, with selected values joined by `, `; use `~` to pick a custom separator (supports `\n` and `\t` escapes), e.g. `{{lines+=[a|b|c]~\n}}` puts each value on its own line.
- **Prompt management** — Create, edit, delete, group, tag, and favorite prompts in the manager window.
- **Fast search** — Search prompt titles, tags, and folders; navigate results with the keyboard.
- **Local storage** — No account, cloud service, or remote database is required.
- **Import and export** — Import both `promptdeck` and `promptdock` JSON files; exports remain compatible with the `promptdeck` format.

## Installation

### System requirements

- Windows 10 or Windows 11 (x64)
- Permission to install a desktop application

### Install with the EXE installer

1. Open the [PromptDock Releases page](https://github.com/Q-Hz/promptdock/releases).
2. Download the latest `PromptDock_<version>_x64-setup.exe` file.
3. Run the installer and launch PromptDock from the Windows Start menu.
4. Press `Ctrl + Shift + Space` to open the prompt launcher.

PromptDock continues running in the system tray. Closing the manager window does not quit the application; use **Quit** from the tray menu when you want to stop it completely.

## Basic usage

1. Open **Prompt Manager** from the tray menu.
2. Create a prompt and optionally assign tags, a folder, favorite status, and variables.
3. Press the global shortcut and search for the prompt.
4. Select it, fill in any variables, and generate the final text.
5. Review the result, then choose **Copy and Close**.

The global shortcut, theme, language, and startup behavior can be changed from **Settings**.

## Improve prompts with AI

If you already have prompts that you use regularly, you can refine them with the built-in **提示词标准化 (Prompt Standardization)** template:

1. Open **提示词标准化 (Prompt Standardization)** and enter the original prompt you want to improve.
2. Ask an AI assistant to rewrite it into a clearer, more consistent prompt based on your requirements.
3. Add the optimized prompt to Prompt Manager, then assign tags, a folder, favorite status, and variables as needed.

You can then find and reuse the optimized prompt at any time with the global shortcut.

## Data and privacy

PromptDock stores prompts and settings locally at:

```text
%APPDATA%\com.promptdock.app\prompts.db
```

## Run from source

### Prerequisites

- [Node.js](https://nodejs.org/) 20 LTS or newer
- [Rust](https://rustup.rs/) stable toolchain
- Microsoft C++ Build Tools with the **Desktop development with C++** workload
- Microsoft Edge WebView2 Runtime

After installing Rust, open a new terminal and confirm that Cargo is available:

```powershell
cargo --version
```

### Start the development version

```powershell
git clone https://github.com/Q-Hz/promptdock.git
cd promptdock
npm install
npm run tauri dev
```

## Technology stack

- Tauri 2 and Rust
- Vue 3, TypeScript, and Vite
- Tailwind CSS
- SQLite via `rusqlite`

## Project structure

```text
src/                         Vue frontend
  components/                Launcher, manager, and settings views
  lib/                       Tauri API, preferences, i18n, and prompt utilities
src-tauri/                   Rust/Tauri application
  src/main.rs                Database, tray, shortcuts, clipboard, and commands
  src/default-prompts.json   Bundled default prompts
tests/                       Frontend utility tests
```

## Contributing

Issues and pull requests are welcome. Before submitting a change, run the frontend and Rust tests and avoid committing local databases, exported prompt libraries, or build artifacts.
