# PromptDock

Windows 轻量化 Prompt 管理与调用工具。本地优先、无账号、无云同步。

## 技术栈

- Tauri 2.x（Rust 后端）
- Vue 3 + TypeScript + Vite
- TailwindCSS
- SQLite（rusqlite）

## 功能

- 全局快捷键 `Ctrl+Shift+Space` 呼出 Spotlight 风格调用浮层
- Prompt 搜索（title / tags）、键盘操作（↑↓ Enter Esc）
- 变量系统：`{{text}}` / `{{count=15}}` / `{{tone=[a|b|c]}}`
- 生成 → 编辑 → 一键复制并关窗
- 管理界面：Folder 分组、Tags、Favorite、使用历史排序
- JSON 导入导出（兼容 PromptDeck 格式）
- 系统托盘、开机自启、自动/浅色/深色主题

## 开发

```bash
npm install
npm run tauri dev
```

## 打包

```bash
npm run tauri build
```

## 目录结构

```
src/                  # Vue 3 前端
  lib/api.ts          # Tauri invoke 封装 + 变量解析/渲染/排序/过滤
  App.vue             # 双窗口路由
  components/
    LauncherApp.vue   # 调用浮层
    ManagerApp.vue    # 管理界面
    SettingsModal.vue # 设置
src-tauri/             # Rust 后端
  src/main.rs          # SQLite CRUD、托盘、快捷键、剪贴板、自启动
  src/default-prompts.json  # 内置默认提示词
```
