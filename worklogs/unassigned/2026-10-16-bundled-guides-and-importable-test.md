# 安装默认语法指南、可导入验收模板与补充说明

Author (GitHub): 待确认

Author ID: 待确认（未提供可核实的人类开发者身份，按规则暂存 `unassigned/`）

## 摘要与需求确认

将两份中英文语法指南继续同步至安装默认数据中的“提示词标准化”和“Prompt Standardization”，恢复实际调用的原始提示词、输出语言和备注填写入口。将验收模板改成可直接导入的 JSON，并按用户提供的文字扩展第五种语法及底部补充说明。

用户已明确确认：原始提示词有实际内容时，AI 直接按指南改写；留空时，仅确认已理解并等待后续任务。两份指南均明确区分教学示例、本次填写项及未来生成模板的变量，要求改写模板而非执行原始任务。

## 修改范围与实现决定

- `examples/promptdock-syntax-guide.zh.md`、`examples/promptdock-syntax-guide.en.md`：加入真实变量 `source_prompt`、`note_language`、`note`，分别提供普通文本与语言单选填写项；保留原有语言候选项。修改首尾指令，消除“填入原文却仍要求等待”的冲突。教学示例继续使用单大括号及引用前缀，不在调用时被解析或移除。
- `src-tauri/src/default-prompts.json`：仅替换上述两条模板正文，与对应 Markdown 全文保持一致；12 条模板的 ID、标题、分类、收藏、时间及其他元数据均未改变。保持首次初始化载入默认数据的现有方式，不读取或覆盖实际用户库。
- `examples/optional-snippets-test.json`：采用已有 `promptdock`/版本 1 导入格式，包含一条“可选片段功能验收”Prompt，位于“功能测试”文件夹。保留原 TXT 的完整模板正文及所有选项，使用独立 ID。移除 TXT，更新 README、操作说明、单元测试和浏览器夹具中的有效引用。
- `src/lib/i18n.ts`、`src/components/VariableExamplesModal.vue`：第五种语法改名“按需添加附加要求”，说明文档修复场景、组合选择和单段开关。底部拆成重复变量、可选片段顺序、多选连接方式三段，提供共享变量与组引用、取消后重选、逗号及换行输出示例。中英文同步更新；补充说明在窄窗口按窗口宽度换行，原四列表格继续横向滚动。
- `tests/prompt-guides.test.ts`：检查默认正文与 Markdown 同步、恰好三个真实填写项、空输入及实际输入的替换结果、输入中的未来变量保持原文、JSON 内模板的功能。
- `src-tauri/src/main.rs`：仅新增两项测试，验证空内存库首次初始化载入完整指南，以及验收 JSON 经真实解析、预检查、追加导入事务后正文不变。
- `tests/browser/prompt-guide-checks.js`、`tests/browser/variable-examples-checks.js`、`tests/browser/launcher-preview.ts`：更新指南填写检查、JSON 夹具及补充说明布局检查。
- 未修改变量解析器、导入实现或调用交互逻辑；任务开始前已有修改均保留。

## 验证

- Red：将验收测试切换为读取 JSON 后，文件未创建时按预期因 `ENOENT` 失败；转换文件后通过。一次定向 Node 检查被 Windows 沙箱以 `spawn EPERM` 阻止，获准在沙箱外重试后通过。
- `npm test`：114 项通过，含中英文指南、教学示例、导入文件内模板及现有变量行为检查。
- `npm run build`：通过 Vue/TypeScript 和 Vite 构建。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过；新增测试的两处换行按格式检查结果调整。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：76 项通过，新增的首次初始化和真实 JSON 追加导入测试均使用临时内存库。
- 后台浏览器：语法文档在中文 1360×850、640×560 及英文深色 860×560 各通过 29 项检查；中英文指南的空原文、已填原文共四种调用各通过 4 项检查；JSON 中验收模板通过 7 项交互检查。
- 末尾可达性检查最初因 0.3125px 的子像素取整误报失败；检查截图及 DOM 尺寸确认文本未横向溢出，将断言容差调整为 1px 后三种窗口检查通过。未据此修改产品交互。
- 比较默认 JSON 的语义数据，确认只有两条指南正文变化，其他记录及全部元数据一致。
- 浏览器未报告页面运行时错误，测试浏览器及 Vite 服务已关闭。最终检查 `git diff --check`、本次未跟踪文本文件空白及工作区状态。

## 限制与后续

- 安装默认源文件已更新；现有库中已保存的正文按原有兼容规则保留，未新增覆盖用户模板的迁移。
- 调用页验证使用真实 Vue 控件及模拟 Tauri IPC；导入与首次初始化使用真实 Rust 实现和内存 SQLite。未启动原生桌面窗口，未调用外部 AI 验证其回答行为。
- 未升级版本或依赖，未生成安装包、暂存或提交。人类作者的 GitHub 身份仍待确认。

## 2026-10-16 同步分享包中的中文指南

修改者身份：待确认。

- 用户确认：只用 `examples/promptdock-syntax-guide.zh.md` 覆盖现有“提示词标准化”条目，本次不添加英文条目。
- 更新 `prompts-share/` 中第一弹至第五弹共五份 JSON，每份仅替换一条 Prompt 的 `body`，与中文指南全文一致。保留原有 `promptdeck` 版本 1 格式、条目 ID、标题、分类、排序、时间和其他数据。
- 验证：通过 Python 解析五份 JSON，并逐份与 Git 基线作语义比较，确认五条正文与指南一致，恢复对应旧正文后其余全部数据与修改前相同；`npm test` 118 项通过。
- 本轮只修改分享模板正文，未修改前后端代码；未重复构建、Rust 或界面验证。保留开始前已有的其他修改，未暂存或提交。日志作者身份仍待确认，继续保存在 `worklogs/unassigned/`。
