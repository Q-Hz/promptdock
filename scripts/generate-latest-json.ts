import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface LatestJsonInput {
  version: string;
  windowsFileName: string;
  windowsSignature: string;
  macFileName: string;
  macSignature: string;
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
        signature: input.windowsSignature,
        url: `${input.downloadBaseUrl}/${encodeURIComponent(input.windowsFileName)}`,
      },
      "darwin-aarch64": {
        signature: input.macSignature,
        url: `${input.downloadBaseUrl}/${encodeURIComponent(input.macFileName)}`,
      },
    },
  };
}

export interface ReleaseArtifacts {
  windowsFileName: string;
  macDmgFileName: string;
  macFileName: string;
}

function requireSingleFile(files: string[], predicate: (file: string) => boolean, label: string): string {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${label} 应恰好有 1 个，实际找到 ${matches.length} 个。`);
  }
  return matches[0];
}

export function selectReleaseArtifacts(files: string[], version: string): ReleaseArtifacts {
  const windowsFileName = `PromptDock_${version}_x64-setup.exe`;
  if (!files.includes(windowsFileName)) {
    throw new Error(`缺少 Windows 安装包 ${windowsFileName}。`);
  }
  if (!files.includes(`${windowsFileName}.sig`)) {
    throw new Error(`缺少 Windows 签名 ${windowsFileName}.sig。`);
  }

  const macPayloads = files.filter(
    (file) => file.endsWith(".dmg") || file.endsWith(".app.tar.gz")
  );
  if (macPayloads.some((file) => /(?:x86_64|intel|universal)/i.test(file))) {
    throw new Error("发现非 Apple Silicon 的 macOS 产物；v1.4.0 只支持 Apple Silicon。");
  }

  const macDmgFileName = requireSingleFile(files, (file) => file.endsWith(".dmg"), "macOS DMG");
  const macFileName = requireSingleFile(
    files,
    (file) => file.endsWith(".app.tar.gz"),
    "macOS updater 归档"
  );
  if (!files.includes(`${macFileName}.sig`)) {
    throw new Error(`缺少 macOS 正式签名 ${macFileName}.sig。`);
  }
  return { windowsFileName, macDmgFileName, macFileName };
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

function parseArtifactDirArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--artifact-dir") return args[i + 1] ?? null;
    if (arg.startsWith("--artifact-dir=")) return arg.slice("--artifact-dir=".length);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const notes = parseNotesArg(args);

  const confPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
  const conf = JSON.parse(await readFile(confPath, "utf8"));
  const version: string = conf.version;
  const endpoint: string | undefined = conf.plugins?.updater?.endpoints?.[0];
  const repoInfo = endpoint ? parseGithubRepoFromEndpoint(endpoint) : null;
  const owner = repoInfo?.owner ?? "Q-Hz";
  const repo = repoInfo?.repo ?? "promptdock";

  const artifactDirValue = parseArtifactDirArg(args);
  if (!artifactDirValue) {
    fail(
      "缺少 --artifact-dir。请先把 Windows 与 macOS 发布产物汇总到同一目录，" +
        "再运行 `npm run latest-json -- --artifact-dir <目录>`。"
    );
  }
  const artifactDir = path.resolve(repoRoot, artifactDirValue);

  let files: string[];
  try {
    files = await readdir(artifactDir);
  } catch {
    fail(`找不到发布产物目录 ${artifactDir}。`);
  }

  let artifacts: ReleaseArtifacts;
  try {
    artifacts = selectReleaseArtifacts(files, version);
  } catch (error) {
    fail(String(error));
  }

  const windowsSignature = (
    await readFile(path.join(artifactDir, `${artifacts.windowsFileName}.sig`), "utf8")
  ).trim();
  const macSignature = (
    await readFile(path.join(artifactDir, `${artifacts.macFileName}.sig`), "utf8")
  ).trim();
  const manifest = buildLatestJson({
    version,
    windowsFileName: artifacts.windowsFileName,
    windowsSignature,
    macFileName: artifacts.macFileName,
    macSignature,
    notes,
    pubDate: formatRfc3339(new Date()),
    downloadBaseUrl: `https://github.com/${owner}/${repo}/releases/download/v${version}`,
  });

  const outPath = path.join(artifactDir, "latest.json");
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`latest.json 已生成：${outPath}`);
  console.log(`  version : ${version}`);
  console.log(`  url     : ${manifest.platforms["windows-x86_64"].url}`);
  console.log(`  url     : ${manifest.platforms["darwin-aarch64"].url}`);
  console.log(
    `下一步：上传 Windows EXE、macOS DMG、macOS updater 归档和 latest.json，` +
      `创建 GitHub Release v${version}。`
  );
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(String(error)));
}
