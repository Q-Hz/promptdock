# 关闭调用窗口搜索框的自动填充建议

Author (GitHub): 待确认
Author ID: 待确认

日期：2026-09-23

## 摘要与修改动机

调用窗口搜索时，WebView 会弹出“保存的信息”建议，遮挡 Prompt 搜索结果。搜索框只用于即时过滤，无需浏览器记忆或推荐历史输入。

## 受影响区域

- `src/components/LauncherApp.vue`

## 重要实现决策

- 为调用窗口搜索输入框设置 `autocomplete="off"`，请求 WebView 不显示原生自动填充历史建议；不改变搜索、焦点或键盘导航逻辑。

## 验证

- `npm test`：74 项测试通过。
- `npm run build`：TypeScript 检查和 Vite 构建通过。
- `git diff --check`：通过。

## 剩余风险与后续工作

- 尚未在真实 WebView2 中对已保存过搜索历史的环境做人工复验；具体是否显示原生建议仍由 WebView2 实现决定。
- 工作负责人 GitHub 数字 ID 未提供，作者暂列待确认。
