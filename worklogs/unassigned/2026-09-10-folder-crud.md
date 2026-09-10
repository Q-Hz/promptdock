# 文件夹创建、重命名与删除

作者（GitHub）：待确认  
作者唯一标识：待确认（尚未提供可核验的 GitHub 账号）

## 摘要与动机

实现文件夹创建、重命名和删除需求，使空文件夹成为可持久化、可排序、可导入导出的一级实体，并在组织操作期间保护编辑器中尚未保存的 Prompt 草稿。此前文件夹仅由 Prompt 的 `folder` 字段隐式存在，因此无法可靠保存空文件夹，也无法对文件夹执行原子重命名或删除。

## 影响区域

- `src-tauri/src/main.rs`：新增 `folders` 表、迁移、CRUD command、事务实现及保存 Prompt 时自动创建新文件夹的兼容逻辑。
- `src-tauri/src/organization.rs`、`src-tauri/src/import_logic.rs`：以显式文件夹规范化组织数据，支持空文件夹导入导出并校验文件夹元数据。
- `src/components/ManagerApp.vue`、`src/components/manager/FolderSection.vue`、`src/components/manager/ActionMenu.vue`：新增创建行、行内重命名、右键菜单、删除确认、空文件夹展示和编辑器校验。
- `src/lib/api.ts`、`src/lib/folder-name.ts`、`src/lib/i18n.ts`、`src/lib/organization.ts`：补充 API、跨端一致的名称校验、双语文案和空文件夹排列逻辑。
- `tests/folder-name.test.ts`、`tests/organization.test.ts`、`tests/browser/manager-layout.ts`、`tests/browser/manager-layout-checks.js`、Rust 回归测试：覆盖名称边界、事务回滚、迁移、导入导出和 UI 完整流程。

## 重要实现决策

- 新增 `folders(name TEXT PRIMARY KEY)`，旧数据库迁移时只物化当前 Prompt 实际使用的非空文件夹，避免把历史组织残留项误恢复为“幽灵文件夹”。
- 名称在前后端均按 Unicode 空白修剪，以 Unicode 码点计数，限制为 1–50 个字符，拒绝 C0/C1 控制字符；重复名区分大小写。
- 创建、重命名、删除及相应 Prompt/组织顺序更新均在 SQLite 单事务内完成；失败时不留下部分更新。
- 删除文件夹不会删除 Prompt，而是按原成员顺序移入系统“未分类”；系统分类与用户创建的同名普通文件夹在界面上明确区分。
- 导入导出继续兼容既有数据，同时保留合法的显式空文件夹；Prompt 中已有的历史超长文件夹名不会在普通保存时被破坏。
- 文件夹组织操作只同步编辑器的文件夹字段与基线，正文、标题、标签、收藏和置顶等未保存草稿保持不变。
- 后续界面微调统一把文件夹和 Prompt 拖拽手柄放在行右侧、菜单按钮左侧，并限定为只有手柄可启动拖动；Prompt 行右键复用 `Prompt 操作` 菜单，菜单新增带分隔线的删除入口。
- “全部展开”和“全部收起”保持始终可点击的幂等操作；最终采用同尺寸、同线宽且带箭杆的成对图标，展开明确向外、收起明确向内，避免小尺寸下两个折线在中心重合而难以辨认。

## 验证

- `npm test`：通过，72 项测试全部成功。
- `npm run build`：通过，Vue TypeScript 检查及 Vite 生产构建成功。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，66 项测试全部成功。
- 有界面浏览器验收：通过，共 11 组 215 条断言；覆盖批量展开/收起、统一拖拽手柄、Prompt 右键菜单、定向删除和草稿保留，浏览器控制台无错误。
- `git diff --check`：通过（仅报告工作区既有的 LF/CRLF 转换提示）。

## 剩余风险与后续工作

- 本次使用隔离的浏览器夹具验证完整前端流程，没有读取或修改用户本地数据库，也未启动真实 Tauri 应用进行数据库手工验收。
- 日志作者的 GitHub 数字 ID 尚未提供，暂存于 `worklogs/unassigned/`，确认身份后应移动到对应数字 ID 目录并补齐作者链接。
