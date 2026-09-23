# 允许拖拽调用窗口边缘调整尺寸

Author (GitHub): 待确认
Author ID: 待确认

日期：2026-09-23

## 摘要与修改动机

调用窗口此前设置为不可调整大小，读者无法按屏幕和内容长度拖拽窗口边缘。增加原生窗口缩放，并避免 Markdown 预览切换覆盖手动调整的尺寸。

## 受影响区域

- `src-tauri/tauri.conf.json`：主调用窗口开启 `resizable`，设置最小宽高，继续禁用最大化。
- `src-tauri/src/main.rs`：记录本次运行中的普通与预览宽度；切换预览时保持当前高度，并恢复手动调整的普通宽度。

## 重要实现决策

- 使用 Tauri 的原生无边框窗口边缘缩放，无需额外的网页拖拽手柄或前端权限。
- 普通与预览宽度分别记录在运行时状态中；用户拖拽后的尺寸在隐藏、再次唤起和切换预览时保留。预览仍会初次自动加宽，并在较窄显示器上限制目标宽度。
- 保留既有居中唤起行为；尺寸在应用完整退出后恢复初始值，未新增尺寸持久化字段。

## 验证

- `npm test`：78 项通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：67 项通过，含宽度恢复测试。
- `git diff --check`：通过。

## 剩余风险与后续工作

- 未在真实 Tauri 窗口中执行鼠标拖拽验收；原生边缘命中区域仍需在目标系统上人工确认。
- 工作负责人 GitHub 数字 ID 未提供，作者暂列待确认。
