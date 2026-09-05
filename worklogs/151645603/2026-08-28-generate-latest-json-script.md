# 新增 latest.json 自动生成脚本

作者（GitHub）：[@Q-Hz](https://github.com/Q-Hz)  
作者唯一标识：`github.com:151645603`（[按数字 ID 查询当前账号](https://api.github.com/user/151645603)）  
归属依据：历史日志按本地相关提交作者补录，说明见 [作者标识规范](../README.md)。

日期：2026-08-28

## 摘要与动机

v1.3.0 接入自动更新后，`latest.json` 更新清单需手工编写，容易填错
`signature`（须为 `.sig` 文件全文）与 `url`（须指向 Release 资产）。
本次新增脚本，在 `npm run tauri build` 后一键生成清单。

## 影响范围

- `scripts/generate-latest-json.ts`：新脚本。
  - 从 `src-tauri/tauri.conf.json` 读取当前 `version` 与更新端点；
    仓库 owner/repo 从端点 URL 解析，避免硬编码。
  - 在 `release/release/bundle/nsis/` 下按当前版本号定位
    `PromptDock_<version>_x64-setup.exe` 与 `.sig`，任一缺失即报错退出，
    并对"缺签名"给出重设环境变量后重建的提示。
  - `signature` 取 `.sig` 文件内容（trim）；`pub_date` 取当前时间
    （RFC 3339，UTC 秒精度）；`url` 为
    `https://github.com/<owner>/<repo>/releases/download/v<version>/<exe 文件名>`。
  - 输出到仓库根目录 `latest.json`。
  - 支持 `--notes "..."` 传入更新说明，缺省为空字符串。
  - 纯逻辑函数（`buildLatestJson` / `parseGithubRepoFromEndpoint` /
    `formatRfc3339`）导出，供单测使用；仅当作为入口直接运行时执行主流程。
- `tests/generate-latest-json.test.ts`：3 个用例覆盖上述纯函数。
- `package.json`：`test` 脚本加入新测试文件；新增
  `"latest-json": "node scripts/generate-latest-json.ts"`。

## 重要实现决策

- 使用 Node（`node scripts/generate-latest-json.ts`，Node 24 原生支持
  TS 类型剥离），不引入新依赖，与现有 `npm test` 运行方式一致。
- 按当前版本号精确匹配安装包，忽略目录中残留的旧版本产物。
- 发布流程中创建 Release、上传资产仍由人工完成，脚本只负责清单生成。

## 验证

- `npm test`：17 通过 0 失败（含 3 个新用例）。
- 未对真实构建产物做端到端运行验证：当前 `release/release/bundle/nsis/`
  中的 1.3.1 安装包无 `.sig`（上次构建未带签名密钥），脚本在缺签名时
  会报错退出，待用户带签名重建后可完整验证。

## 遗留风险与后续

- 若未来产物命名规则（`PromptDock_<version>_x64-setup.exe`）变化，
  脚本需同步更新。
- 建议后续将"构建 + 生成清单 + 发 Release"并入 GitHub Actions 自动化。
