# 调用窗口文本变量布局与预览状态持久化

Author (GitHub): 待确认
Author ID: 待确认

## 摘要与已确认要求

用户于 2026-10-09 确认执行：文本变量（含默认值）平均使用剩余高度；选择型变量保持紧凑；变量多时滚动；返回与生成按钮固定底部；保留手动拖高。所有 Prompt 共用最后一次预览开关状态，正常退出应用并重启后恢复。

## 修改区域与实现决策

- `src/components/LauncherApp.vue`：变量页分为固定标题、滚动表单、固定按钮。通过 ResizeObserver 测量可用高度、标签和选项高度，文本框平分剩余空间，最小 80px。手动拖高改变原生 textarea 高度，后续字段正常下移并由表单滚动；不保存文本框手动高度。
- `src/lib/launcher-preview-preference.ts`：沿用 `launcher.markdownPreviewOpen` 和现有 SQLite `ui_prefs`，串行恢复、写入和退出 flush。用操作序号防止较早成功写入或较晚启动读取覆盖新的选择；保存失败时退出可重试最后值。
- `src-tauri/src/main.rs`、`src/lib/api.ts`：正常托盘退出先完成原管理器草稿保护，再通知调用窗口完成偏好写入；管理器已销毁时同样等待调用窗口。写入失败取消本次退出，显示调用窗口中的错误。重复退出请求被合并。
- `get_ui_prefs` 区分不存在的偏好（空值）与真实读取错误；启动以及每次唤起恢复预览状态，读取失败提示并在下次唤起重试。
- `src/lib/i18n.ts`：增加中英文恢复失败提示；调用窗口各阶段均可显示偏好错误。
- `package.json`、`tests/launcher-preview-preference.test.ts`、`tests/browser/launcher-preview.ts`、`tests/browser/launcher-layout-checks.cjs`：保存逻辑单元测试、合成数据布局与退出回归。

无 schema、导出格式、版本号或依赖变更。既有预览偏好直接兼容。

## 验证

- Red：新增预览偏好测试先因待实现模块不存在而失败；实现后通过，随后补充三次切换最终保存失败的回归。
- `npm test`：89/89 通过。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：74/74 通过；临时 SQLite 文件验证 true/false 经数据库关闭、重开及初始化后保留，另验证读取错误不被当成缺失偏好。
- Edge 无界面浏览器 `launcher-layout-checks.cjs`：单个、两个、三个与混合变量平均高度、默认值、选项紧凑、手动拖高不重叠、320px 最小高度滚动、固定按钮、窗口调整、换行、返回和再次唤起保留预览、新页面恢复开/关、延迟保存退出、失败取消退出及重试、读取失败恢复均通过，无页面错误。
- 既有 `launcher-back-checks.cjs`：返回保护、恢复基线、取消与焦点、Esc/Enter、生成无穿透及附带的 31 项文件夹图标检查通过。
- 已查看合成数据的 640×720 双文本框截图，默认高度均分且按钮位于底部。
- `git diff --check`：通过；`git status --short`：仅本任务的源代码、测试与日志改动。验证服务器已停止，进程检查未发现残留的本次 Vite/1431 Node 进程。
- Windows 沙箱阻止 npm、Cargo 格式化/构建环境及 Edge 启动的初次执行；改用获准的沙箱外 PowerShell 命令完成上述检查。

## 限制与交接

任务开始时工作区干净。未读取或修改用户数据库，SQLite 测试只使用自动删除的临时合成库；浏览器模拟 Tauri IPC，不替代真实原生窗口退出重启人工验收，本次未启动真实 Tauri 应用。强制终止进程不经过正常退出握手；窗口手动尺寸的跨重启保存不在范围内。

负责人 GitHub 身份未提供，日志存于 `unassigned`，作者待确认。
