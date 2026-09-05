# 2026-09-03 移除导入摘要步骤

> 2026-09-05 清理说明：按维护者要求，已删除 worklogs 根目录下的 acceptance-2026-09-03-qwen、manager-fixes-2026-09-03 和 archive 三个历史材料目录。下文涉及这些目录的附件、备份和复现命令仅作历史记录，已不再可用；原验证结论保留。

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

## 依据与范围

用户明确要求删除导入摘要及对应按钮、界面。本轮决定覆盖原 PRD 8.1 的摘要页要求及 8.4 中重新预检查无冲突时显示摘要的要求；保留最终明确确认、事务重验、不静默重试写入等安全约束。原 PRD 不改写。

## 改动

- 删除 `src/components/import/ImportSummaryPage.vue`，清理 `ManagerApp.vue` 中 compare/summary 模式、决策中转、返回比较页及摘要确认回调。
- 比较页原“查看导入摘要”入口改为直接“确认导入”，发出 confirm 事件并提交全部已保存决策。未处理完、有未确认修改或更新目标重复时仍不可提交。完成一条选择本身不触发数据库提交。
- 删除中英文摘要页标题、数量统计、返回提示等无用文案；完成提示改为可确认导入。
- 保持现有比较页视觉风格及可拖动分区，不新增替代摘要页。
- 无冲突的首次追加继续直接提交。stale 后清空旧选择并基于同一导入文件内存快照重新检查：仍有冲突时显示全新的比较页；无冲突时仅弹出“是否继续导入”的简短原生确认，取消不写入，确认才用新计划提交。
- 新增提交忙碌锁：阻止重复提交；比较区暂时不可操作，取消按钮禁用；提交、重新预检查及刷新期间拒绝关窗、托盘退出和刷新。普通写入失败仍保留选择供重试；成功后直接刷新并回到编辑器。
- `tests/browser/import-layout.ts` 改用 confirm 回调；新增实际 ManagerApp 的隔离模拟接口样例和浏览器回归脚本：`import-flow.html`、`import-flow.ts`、`import-flow-checks.js`。
- 没有修改 Rust 接口、数据库 schema、JSON 格式或默认 Prompt、分享文件、托盘图标。

删除前已将原摘要组件留存于 `worklogs/archive/ImportSummaryPage.vue.before-removal`，可按需恢复；该本地备份不参与构建。

## 验证

- `npm test`：42/42 通过。
- `npm run build`：类型检查与 Vite 构建通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：25/25 通过，后端本轮无改动。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `git diff --check`：通过。搜索 `src/`、`tests/` 无摘要组件、摘要键或摘要事件回调残留。
- agent-browser：真实 ManagerApp + 合成 Tauri 接口共 7 个场景、116 个断言通过：直接提交/忙碌锁/关闭拦截/失败重试/选中项刷新，取消比较，重复更新目标，stale 后仍有冲突，stale 后无冲突取消，stale 后无冲突确认，以及初次无冲突直接提交。
- 检查 860×640 完成选择后的页面截图 `import-without-summary.png`：没有摘要按钮，确认导入可用，底部按钮在视口内。页面运行时错误日志为空。

浏览器重跑方式：启动 `npm run dev -- --host 127.0.0.1 --port 1425`，打开 `/tests/browser/import-flow.html`（查询参数见测试文件），通过 agent-browser eval 执行：

```js
import('/tests/browser/import-flow-checks.js').then(m => m.runImportFlowChecks('normal'))
```

## 限制

- 浏览器使用模拟 API，不连接或修改真实 Prompt 数据库；原生文件对话框及 WebView2 端到端导入未实测。
- 没有生成安装包、暂存或提交代码。测试浏览器与开发服务在验证后关闭。

## 后续提交

- 用户确认后提交为 `96a2313`（`feat: 完善导入冲突处理与未保存保护`），共 23 个需求相关代码和测试文件。
- 排除默认 Prompt、分享 JSON、托盘图标及 `main.rs` 对应图标路径片段；这些既有用户改动继续保留在工作区。暂存区已清空。
- `docs/`、`worklogs/` 继续按原策略仅留本地，没有强制加入 Git；未推送远程。
