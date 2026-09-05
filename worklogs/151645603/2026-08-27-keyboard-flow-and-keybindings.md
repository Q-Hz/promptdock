# 全键盘操作流程与界面快捷键可配置

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

日期：2026-08-27

## 摘要与动机

用户希望 PromptDock 启动器全程无需鼠标：唤起后通过搜索 + 方向键 + Enter 选提示词，变量界面直接输入、Tab 切换。原有两个断点：

1. 选择型变量（单选 `{{x=[a|b]}}`、多选 `{{x+=[a|b]}}`）只能鼠标操作；
2. 变量/结果界面 Enter 是换行，只能 `Ctrl+Enter` 前进。

本次改动实现完整键盘流，并把"前进/换行/返回"三个界面键位开放到设置界面自定义。

## 确认后的交互方案

- 单选变量：可聚焦选项列表，↑↓ 直接改变选中值（原生下拉框手感），Space 幂等确认。
- 多选变量：可聚焦容器，↑↓ 移动高亮（蓝色环标识），Space 切换勾选项，鼠标点击仍可用。
- 文本变量：行为不变，直接输入、Tab 切换。
- 阶段推进：Enter（可配置）在搜索→选中、变量→生成、结果→复制并关闭；Shift+Enter（可配置）换行。
- 返回：Esc（可配置）逐级返回/隐藏。
- 输入法组合态（isComposing）与文本框内的普通字符输入不触发阶段级快捷键。

## 影响文件

- 新增 `src/lib/keybindings.ts`：`normalizeBinding` / `matchesKeybinding` / `formatKeybinding` / `DEFAULT_KEY_BINDINGS`（advance=enter、newline=shift+enter、back=escape）。
- 新增 `tests/keybindings.test.ts`：7 个用例覆盖归一化、修饰键精确匹配、space/esc 别名、IME 忽略、显示格式。
- `package.json`：test 脚本追加新测试文件。
- `src-tauri/src/main.rs`：`Settings` 增加 `advance_key` / `newline_key` / `back_key`；`default_settings`、`read_settings`（缺失/非法值回退默认）、`set_settings`（格式校验，错误码 `settings.invalid_key_binding`）同步扩展；新增 `is_valid_key_binding`；更新默认值测试并新增校验测试。
- `src/lib/api.ts`：`Settings` 接口同步三个字段（camelCase）。
- `src/components/LauncherApp.vue`：
  - `onKeydown` 重写，阶段切换由可配置键位驱动；移除 `Ctrl+Enter` 硬编码；
  - 单选/多选模板改为 `tabindex=0` 选项列表容器（内部控件 `tabindex=-1`，每个变量保持单一 Tab 停靠点），`onOptionKeydown` 处理 ↑↓/Space；
  - 变量/结果阶段底部新增按键提示栏，搜索阶段提示随键位配置动态渲染；
  - `onMounted` 加载设置并监听 `settings-changed` 实时更新键位；进入结果阶段自动聚焦文本框。
- `src/components/SettingsModal.vue`：新增"界面快捷键"录制区（前进/换行/返回三行，录制器与全局快捷键复用同一实现，点击行或"修改"按钮开始录制并自动聚焦）。
- `src/lib/i18n.ts`：中英双语新增键位标签、动态提示文案与错误映射。

## 重要决策

- Enter 语义变更为"前进"，换行改用 Shift+Enter；原 `Ctrl+Enter` 生成/复制快捷方式被可配置的 advance 键取代（默认 Enter），不再保留。
- 键位仅存 SQLite `settings` 表（advance_key/newline_key/back_key），Rust 端只做存储与格式校验，匹配逻辑在前端，老数据库读取时兜底默认值，无需迁移。
- 方向键、Tab、Space 保持固定，不纳入配置，避免设置面过度复杂与冲突配置。
- 多选高亮（activeOption）在进入变量界面时默认指向第一个选项并常显，作为键盘导航位置提示。

## 验证

- `npm test`：14 通过（原 7 + 新增 7）。
- `npm run build`：vue-tsc 类型检查与 vite 构建通过。
- `cargo fmt --check`、`cargo test --manifest-path src-tauri/Cargo.toml`：5 个测试通过（含新增键位校验与默认值断言）。
- `git diff --check`：无空白错误（仅 Windows CRLF 警告）。
- 未做：真机交互验证（`npm run tauri dev` 全键盘走查）——当前环境无法操作原生窗口的键盘输入，需要用户手动验证。

## 遗留风险与后续

- 若用户把前进键配为与文本输入重叠的单字符（如 `x`），文本框内输入该字符不会触发前进（已做输入保护），但文本框外按下会触发；设置界面未对此类配置做额外警告。
- 全键盘流程建议手动回归：唤起 → 中文输入不误触发选择 → ↑↓/Enter 选中 → Tab/↑↓/Space 填变量 → Enter 生成 → Enter 复制关闭；再改键位验证即时生效与重启持久化。

## 缺陷修复（同日用户反馈）

用户实测发现两个回归（当时运行的是修复前 48 分钟启动的旧进程，但问题真实存在）：

1. **Tab 会跳到"返回/生成提示词"等按钮**，焦点在"生成提示词"上按 Enter 后进入结果界面、再按一次即复制并关闭窗口（体验为"直接退出"）。
   - 修复：搜索结果列表按钮、变量/结果阶段的"返回""生成提示词""复制并关闭"按钮全部加 `tabindex="-1"`（鼠标点击不受影响）。加载失败时的"重试"按钮保留可聚焦，作为错误路径的键盘恢复手段。
2. **多选框进入界面即整框蓝色**：选项容器带 `focus-visible:ring-2`，而 `choose()` 程序化聚焦首个变量控件，键盘操作后浏览器对程序化聚焦应用 `:focus-visible`；另外多选首项的高亮环无条件常显。
   - 修复：移除容器的焦点环，新增 `focusedVar`（@focus/@blur 跟踪）与 `keyboardNav`（Tab/方向键/Space 置位、`reset`/`choose`/`generate` 清零）两个状态；光标环改为选项级（单选=选中项、多选=高亮项），且仅当 `focusedVar === 该变量 && keyboardNav` 时显示。
   - 效果：进入变量界面无任何蓝色标记；↑↓/Space 立即从隐藏焦点开始工作并按下即出现光标环；Tab 到达时出现光标环；鼠标操作不触发蓝色。

验证：`npm test` 14 通过、`npm run build` 通过。改动仅在 `src/components/LauncherApp.vue`。
注意：直接运行已启动的旧进程（如 `release/debug/promptdock.exe`）不会加载源码改动，需重启 `npm run tauri dev`。
