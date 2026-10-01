# 新手引导与界面聚光导览

作者（GitHub）：待确认  
作者唯一标识：待确认

## 摘要与动机

依据本地 `docs/PRD/新手引导需求文档.md` 实现首次安装引导、老用户静默迁移、设置页重播和正文变量帮助。初版中央内容卡片无法让说明与真实界面位置建立联系；人工检查后改为产品界面内的 8 步 spotlight tour：前五步结合真实管理界面介绍新建、正文、管理与设置，后三步使用调用窗口截图说明选择 Prompt、填写变量和复制结果。

## 受影响区域

- `src-tauri/src/main.rs`、`manager_regression_tests.rs`：数据库初始化事务内判定全新/旧版/未知 schema，持久化与版本无关的引导状态；启动时自动打开管理器；提供读取和完成命令；记录快捷键注册可用性。
- `src/components/ManagerApp.vue`、`InterfaceTour.vue`、`SettingsModal.vue`、`VariableExamplesModal.vue`：真实界面聚光导览、焦点约束、重播、变量示例与焦点恢复。
- `src/assets/onboarding/`：调用搜索、变量填写和完整结果三张引导截图。
- `src/lib/api.ts`、`i18n.ts`、`onboarding.ts`、`vite-env.d.ts`：前后端类型、双语文案、8 步状态辅助函数和静态图片类型声明。
- `tests/onboarding.test.ts`、`tests/browser/manager-layout.ts`、`tests/browser/import-flow.ts`、`package.json`：导航矩阵单测及合成 Tauri 边界适配。

## 重要实现决策

- 引导完成状态写入 SQLite `settings`，不进入 Prompt 导入导出，也不按版本重置。
- 初始化前先识别既有 PromptDock schema：全新数据写入待完成，旧 schema 缺字段时写入已完成，未知业务表直接拒绝初始化且不覆盖。
- 引导中的背景通过 `inert` 和 `aria-hidden` 锁定；聚光框只负责呈现真实控件，不允许误操作背景。
- 气泡根据目标和视口剩余空间选择上下左右位置；正文变量步骤在最小窗口下自动使用窄气泡，避免遮住被讲解区域。
- 第一步只统一压暗背景，不制造无意义的亮区；第四步聚光完整的左侧 Prompt 管理区；第六至八步在居中卡片中展示随应用打包的调用界面截图。
- 后续文案复核删除了第一步的步骤概述提示；变量示例统一为“正文语法 / 调用结果”两列表达，并用行内代码突出默认值。
- 主动重播不写永久状态，设置组件保持挂载，因此未保存草稿不会被保存、重读或丢弃。
- 2026-09-10 人工复验发现设置弹窗会遮住重播时的聚光目标；修正为点击“重新播放”后立即用 `v-show` 隐藏设置弹窗，引导结束后恢复同一组件实例和原焦点。

## 验证

- `npm test`：72/72 通过。
- `npm run build`：Vue/TypeScript 检查与 Vite 生产构建通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：65/65 通过；含全新安装、旧库迁移、重复启动和未知数据库保护。
- `git diff --check`：通过，仅有工作区既有 CRLF 转换提示。
- 无头 Chromium，合成数据，不访问本地数据库：
  - 中文浅色及英文深色，860×560；8 步卡片均在视口内，四个真实控件目标与气泡不重叠，第一步没有 spotlight，第四步覆盖左侧管理区约 96% 且聚光框不越界。
  - 第六至八步的三张图片均加载为预期的 642×477 或 640×480 原图；默认快捷键按指定格式显示为 `Ctrl + Shift + 空格`。
  - 设置页点击“重新播放”后，其显示状态从 `flex` 变为 `none`，引导从第 1 步开始；跳过后设置页恢复为 `flex`，焦点返回“重新播放”。
  - 后续文案定向回归确认第一步正文只剩一个段落；变量示例标题、说明、两列表头和四行语法/结果均与最终文案一致，默认值 `5` 使用独立行内代码元素呈现。
  - 浏览器未报告页面运行错误。
  - 变量示例展示四类完整句子，Esc 关闭后焦点返回入口。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：未通过；报告的是任务开始前已有的文件夹功能未提交改动中的格式差异。为避免重排用户修改，本任务未运行全仓库自动格式化；新增引导代码未出现在该检查的差异列表中。

## 剩余风险与后续

- 无头 Chromium 不能替代 Windows WebView2 和 macOS 原生窗口、系统托盘及 DPI 的最终实机验收。
- 第六至八步使用静态截图解释调用流程，不会在管理器引导中实际触发全局快捷键或操作系统剪贴板。
- 日志作者身份尚未由负责开发者确认，暂存于 `worklogs/unassigned/`。

## 验证截图

- [中文浅色：第三步正文变量](onboarding-interface-tour-variable-zh-light.png)
- [中文浅色：第四步 Prompt 管理](onboarding-interface-tour-library-zh-light.png)
- [中文浅色：第六步调用 PromptDock](onboarding-interface-tour-call-zh-light.png)
- [中文浅色：第八步复制完整 Prompt](onboarding-interface-tour-copy-zh-light.png)
- [英文深色：第四步 Prompt 管理](onboarding-interface-tour-en-dark.png)
- [英文深色：第七步填写变量](onboarding-interface-tour-variable-en-dark.png)
