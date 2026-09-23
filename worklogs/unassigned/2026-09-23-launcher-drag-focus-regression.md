# 修复拖动和缩放时调用窗口意外隐藏

Author (GitHub): 待确认
Author ID: 待确认

日期：2026-09-23

## 摘要与修改动机

开启无边框调用窗口的边缘缩放后，用户反馈点击拖动区域或窗口边缘时无法移动、无法缩放，界面像闪退一样消失。搜索页原有的 `window.blur` 处理会立即隐藏调用窗口；Windows 上原生窗口拖动或缩放可短暂使 WebView 失焦，因此该处理有误隐藏风险。

## 受影响区域

- `src/components/LauncherApp.vue`：拖动条显式调用 Tauri 的 `startDragging()`；延迟处理搜索页失焦，再次检查 WebView 与原生窗口焦点后才隐藏。
- `tests/browser/launcher-preview.ts`：合成验收页记录 `hide_main` 调用次数，用于短暂失焦回归检查。

## 重要实现决策

- `focus`、窗口 `resize` 会取消待执行的隐藏；延迟后的原生 `isFocused()` 检查可区分 WebView 短暂失焦与用户真正切换到其他应用。
- 异步检查通过序号防止过期的失焦回调在重新聚焦后隐藏窗口；原生焦点查询失败时保持窗口显示。
- 拖动条不再依赖 `data-tauri-drag-region` 的隐式事件处理，改用现有 `core:window:allow-start-dragging` 权限执行显式拖动；窗口边缘仍使用原生缩放。

## 验证

- `npm test`：78 项通过。
- `npm run build`：通过。
- 合成浏览器验收：原生窗口仍聚焦时不隐藏；真正失焦时调用一次 `hide_main`；连续触发 `blur` 和 `focus` 不增加隐藏次数。页面无错误。
- 合成浏览器验收：点击拖动条会调用一次 `start_dragging`，页面无错误。
- `git diff --check`：通过。

## 剩余风险与后续工作

- 失焦根因根据代码和 Windows/Tauri 事件行为推断；尚未在用户实际窗口中用鼠标复验拖动、缩放及所述“闪退”现象。
- 工作负责人 GitHub 数字 ID 未提供，作者暂列待确认。
