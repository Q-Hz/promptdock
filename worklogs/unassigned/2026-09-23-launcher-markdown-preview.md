# 调用结果页增加 Markdown 侧边预览

Author (GitHub): 待确认
Author ID: 待确认

日期：2026-09-23

## 摘要与修改动机

调用窗口的生成结果页原本只显示可编辑纯文本。较长的 Markdown Prompt 难以快速检查标题、列表和强调效果，因此增加可切换的右侧预览。

## 受影响区域

- `src/components/LauncherApp.vue`、`src/style.css`、`src/lib/i18n.ts`：结果页双栏、预览开关、双语文案与浅色/深色排版。
- `src/lib/markdown-preview.ts`、`tests/markdown-preview.test.ts`：Markdown 渲染与内容安全检查。
- `src/lib/api.ts`、`src-tauri/src/main.rs`：调用窗口宽度切换及屏幕宽度约束。
- `package.json`、`package-lock.json`：添加 `markdown-it`，并将预览测试纳入 `npm test`。
- `tests/browser/launcher-preview.html`、`tests/browser/launcher-preview.ts`：使用合成 Prompt 的浏览器验收页面，不访问本地 Prompt 数据。

## 重要实现决策

- 预览仅在生成结果页显示，渲染当前可编辑结果文本；复制时仍复制原文。
- 打开预览时窗口从 640 逻辑像素扩至最多 1100，并根据当前显示器宽度留出边距；离开结果页或收起预览时恢复 640。再次唤起调用窗口时先以原宽度显示。
- 开关状态以 `launcher.markdownPreviewOpen` 键写入现有 `ui_prefs`，记录上次状态。该偏好不进入 Prompt 导出；无需数据库迁移。
- 禁用原始 HTML，阻止远程图片加载；预览中的链接不触发跳转，也不进入键盘焦点顺序，避免影响 Enter 复制快捷键。

## 验证

- `npm test`：78 项通过。
- `npm run build`：TypeScript 检查与 Vite 构建通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：67 项通过。
- 合成浏览器验收：原文与预览双栏显示、编辑后即时更新、开启和关闭状态在页面重载后恢复；浅色和深色截图检查正常，浏览器无页面错误。
- `git diff --check`：通过。

## 剩余风险与后续工作

- 尚未在真实 Tauri 窗口中人工复验窗口尺寸切换；浏览器验收页模拟该 command，不验证操作系统窗口行为。
- 工作负责人 GitHub 数字 ID 未提供，作者暂列待确认。
