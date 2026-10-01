# 2026-09-30 管理界面拖入 JSON 导入

作者（GitHub）：待确认
作者唯一标识：待确认

## 摘要与动机

管理器原先只能通过按钮选择文件导入，外部 JSON 拖入没有入口。新增全页文件投放提示，并将按钮与拖入入口统一到“未保存保护 → 文件校验 → 导入方式 → 覆盖或追加”的顺序。

## 影响区域与实现决策

- `src/components/ManagerApp.vue`、`src/components/import/ImportModeDialog.vue`、`src/lib/import-drop.ts`、`src/lib/i18n.ts`：仅把浏览器 `Files` 拖拽识别为外部导入，保留原有排序拖拽；正常管理页提供提示层和单文件检查；以明确可关闭的双操作对话框选择覆盖或追加。关闭或 Esc 取消，不进行导入。
- `src/lib/api.ts`、`src-tauri/src/main.rs`、`src-tauri/src/import_logic.rs`：按钮入口读取文件内容，拖入入口读取 `File` 内容；两者均由 Rust 执行现有格式校验。`import_prompts` 和 `precheck_import` 的内部参数由路径改为内容，前后端同步；后续覆盖及追加预检查使用同一内容快照，并在后端再次解析，避免验证与执行使用不同文件版本。读取命令只有在文件符合导入格式时才返回内容。
- `README.md`、`README_CN.md`：补充入口说明。`tests/import-drop.test.ts`、`tests/browser/import-flow.ts`、`tests/browser/import-flow-checks.js`、`tests/browser/import-drop-checks.js`：覆盖外部拖拽判别、文件数量与扩展名、现有导入方式和拖入交互。`package.json` 将新单元测试纳入 `npm test`。
- 公开资料审阅后，`worklogs/README.md` 补充当前公开范围说明，既有 updater 日志移除本地签名配置细节；完整需求方案保存在被 Git 忽略的本地 PRD。
- 无 JSON 格式、数据库 schema、依赖、版本或代码签名变更。

## 验证

- `npm test`：80/80 通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：67/67 通过。
- `node --check tests/browser/import-drop-checks.js`、`node --check tests/browser/import-flow-checks.js`：通过。
- `git diff --check`：通过；只有 Windows 行尾转换提示。
- 浏览器隔离夹具脚本已准备，本次未执行。

## 剩余风险与限制

- 浏览器隔离夹具使用模拟 Tauri 接口，不读取真实 Prompt 数据库；本次尚未运行。Windows WebView2 与 macOS 原生文件拖入行为仍需实机确认。
- 作者身份待确认，暂记为 `unassigned`。
