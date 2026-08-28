import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(repoRoot, "release", "release", "bundle", "nsis");

export interface LatestJsonInput {
  version: string;
  exeFileName: string;
  signature: string;
  notes: string;
  pubDate: string;
  downloadBaseUrl: string;
}

export function buildLatestJson(input: LatestJsonInput) {
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate,
    platforms: {
      "windows-x86_64": {
        signature: input.signature,
        url: `${input.downloadBaseUrl}/${input.exeFileName}`,
      },
    },
  };
}

export function parseGithubRepoFromEndpoint(
  endpoint: string
): { owner: string; repo: string } | null {
  const match = endpoint.match(/github\.com\/([^/]+)\/([^/]+)\/releases/);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}

export function formatRfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function fail(message: string): never {
  console.error(`生成 latest.json 失败：${message}`);
  process.exit(1);
}

function parseNotesArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--notes") {
      return args[i + 1] ?? "";
    }
    if (arg.startsWith("--notes=")) {
      return arg.slice("--notes=".length);
    }
  }
  return "";
}

async function main() {
  const notes = parseNotesArg(process.argv.slice(2));

  const confPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
  const conf = JSON.parse(await readFile(confPath, "utf8"));
  const version: string = conf.version;
  const endpoint: string | undefined = conf.plugins?.updater?.endpoints?.[0];
  const repoInfo = endpoint ? parseGithubRepoFromEndpoint(endpoint) : null;
  const owner = repoInfo?.owner ?? "Q-Hz";
  const repo = repoInfo?.repo ?? "promptdock";

  let files: string[];
  try {
    files = await readdir(bundleDir);
  } catch {
    fail(`找不到构建产物目录 ${bundleDir}，请先运行 \`npm run tauri build\`。`);
  }

  const exeName = `PromptDock_${version}_x64-setup.exe`;
  const sigName = `${exeName}.sig`;
  if (!files.includes(exeName)) {
    fail(
      `目录中没有当前版本（${version}）的安装包 ${exeName}，请先运行 \`npm run tauri build\`。`
    );
  }
  if (!files.includes(sigName)) {
    fail(
      `缺少签名文件 ${sigName}，说明上次构建没有带签名密钥。` +
        "请设置 $env:TAURI_SIGNING_PRIVATE_KEY（私钥内容）和 $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=\"\" 后重新构建。"
    );
  }

  const signature = (await readFile(path.join(bundleDir, sigName), "utf8")).trim();
  const manifest = buildLatestJson({
    version,
    exeFileName: exeName,
    signature,
    notes,
    pubDate: formatRfc3339(new Date()),
    downloadBaseUrl: `https://github.com/${owner}/${repo}/releases/download/v${version}`,
  });

  const outPath = path.join(repoRoot, "latest.json");
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`latest.json 已生成：${outPath}`);
  console.log(`  version : ${version}`);
  console.log(`  url     : ${manifest.platforms["windows-x86_64"].url}`);
  console.log(`下一步：在 GitHub 创建 Release（tag 建议 v${version}），把 ${exeName} 和 latest.json 一起上传。`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(String(error)));
}
