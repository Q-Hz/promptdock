# 新手引导增加 JSON 导入步骤

作者（GitHub）：待确认  
作者唯一标识：待确认

## 已确认方案

- 2026-10-05 用户明确确认方案并授权记录、实施。
- 在现有第二步“新建 Prompt”之前加入“导入 Prompt”，总计九步。
- 中文正文：可以将提示词文件（ JSON 文件）拖入，一次一个文件；也可以点击顶部“导入”按钮选择导入的文件。
- 只展示图文，不在引导中执行导入；新增步骤采用居中卡片。
- 用户提供的截图原样复制到 `src/assets/onboarding/`，中文和英文共用；正文和替代文本分别本地化。
- 已完成用户不自动重播，仍可从设置重新播放。保持现有导入功能及引导状态规则。

## 修改范围与实现顺序

1. 记录方案，更新导航测试以覆盖九步。
2. 复制图片，更新 `InterfaceTour.vue`、`onboarding.ts` 和 `i18n.ts`。
3. 同步顺延聚光目标、正文变量帮助、调用截图及最后一步完成按钮。
4. 验证九步导航、中英文、浅深色和最小窗口布局，执行前端及 Rust 检查并检查 diff。

## 验证

- Red：`node --experimental-strip-types --test tests/onboarding.test.ts` 在沙箱中遇到 `spawn EPERM`，PowerShell 重试后仍受阻；获准在沙箱外执行，两个测试按预期因旧八步实现失败。
- Green：`powershell -Command "npm test"`：80/80 通过。
- `powershell -Command "npm run build"`：通过，新增图片纳入生产构建。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：67/67 通过。
- `node --check tests/browser/onboarding-checks.js`：通过。
- 使用 test-browser 技能与 agent-browser，在用户明确选择的后台模式下运行合成管理器页面；中文浅色、英文深色均在 860×560 视口通过九步正向及返回第二步的反向导航检查，标题、文案、图片、聚光、焦点和按钮位置均通过。
- 英文深色下设置页重播同样通过九步检查，跳过后关闭引导且焦点返回“Replay guide”。浏览器未报告页面错误。
- 新增可复用脚本 `tests/browser/onboarding-checks.js`；原图和副本 SHA-256 相同（1241×752），截图人工检查确认完整显示。
- `git diff --check`：通过，仅 Windows 行尾转换提示。
- 验收后已关闭浏览器会话和本次 Vite 测试服务。

## 风险与限制

- 英文界面按用户确认共用中文截图。
- 作者身份未核实，按项目规则暂存 `worklogs/unassigned/`。
- 保留任务开始前已有的提示词分享文件删除及新增变更。
- 任务期间另有 `ActionMenu.vue`、`FolderSection.vue` 等并行修改，本任务未编辑或回退它们。
- 浏览器验收使用合成 Tauri 接口，不访问真实数据库；未运行原生 Tauri 手动验收或 macOS 实机检查。
