export interface Prompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
  folder: string;
  favorite: boolean;
  useCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  hotkey: string;
  autostart: boolean;
  theme: "auto" | "light" | "dark";
  language: "auto" | "zh" | "en";
  advanceKey: string;
  newlineKey: string;
  backKey: string;
  autoCheckUpdate: boolean;
}

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export type PrecheckKind = "new" | "identical" | "conflict";

export interface PrecheckItem {
  imported: Prompt;
  candidates: Prompt[];
  kind: PrecheckKind;
}

export interface ImportPrecheck {
  items: PrecheckItem[];
  newCount: number;
  identicalCount: number;
  conflictCount: number;
}

export type ImportAction = "keep_local" | "use_imported" | "import_as_new";

export interface ImportDecision {
  importedId: string;
  action: ImportAction;
  targetLocalId?: string | null;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  insertedAsNew: number;
  skipped: number;
}

export interface ParsedVar {
  name: string;
  type: "text" | "select" | "multi";
  default: string;
  options: string[];
  separator: string;
}

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (window as any).__TAURI__.core.invoke(command, args);
}

export const api = {
  listPrompts: (): Promise<Prompt[]> => invoke("list_prompts"),
  savePrompt: (p: Prompt): Promise<Prompt> => invoke("save_prompt", { prompt: p }),
  deletePrompt: (id: string): Promise<void> => invoke("delete_prompt", { id }),
  markUsed: (id: string): Promise<void> => invoke("mark_used", { id }),
  copyText: (text: string): Promise<void> => invoke("copy_text", { text }),
  getSettings: (): Promise<Settings> => invoke("get_settings"),
  setSettings: (s: Settings): Promise<void> => invoke("set_settings", { settings: s }),
  hideMain: (): Promise<void> => invoke("hide_main"),
  openManager: (): Promise<void> => invoke("open_manager"),
  exportPrompts: (path: string): Promise<void> => invoke("export_prompts", { path }),
  // 覆盖模式导入：清空当前全部 Prompt 后导入文件内容
  importPrompts: (path: string, replace: true): Promise<number> =>
    invoke("import_prompts", { path, replace }),
  precheckImport: (path: string): Promise<ImportPrecheck> =>
    invoke("precheck_import", { path }),
  // stale 后基于首次读取的内存快照重新预检查，不重新读取磁盘文件
  precheckImportSnapshot: (prompts: Prompt[]): Promise<ImportPrecheck> =>
    invoke("precheck_import_snapshot", { prompts }),
  // 提交完整预检查快照，供后端在事务内核对候选关系和业务字段（PRD 8.4）
  commitImport: (precheck: ImportPrecheck, decisions: ImportDecision[]): Promise<ImportResult> =>
    invoke("commit_import", { precheck, decisions }),
  resolveClose: (allow: boolean): Promise<void> => invoke("resolve_close", { allow }),
  resolveQuit: (allow: boolean): Promise<void> => invoke("resolve_quit", { allow }),
  setManagerGuardReady: (ready: boolean): Promise<void> => invoke("set_manager_guard_ready", { ready }),
  checkForUpdates: (): Promise<UpdateInfo | null> => invoke("check_for_updates"),
  installUpdate: (): Promise<void> => invoke("install_update"),
};

const DEFAULT_MULTI_SEPARATOR = ", ";

function unescapeSeparator(raw: string): string {
  return raw.replaceAll("\\n", "\n").replaceAll("\\t", "\t");
}

// 从 {{name+=[a|b|c]~sep}} 的值部分解析选项与连接符；非多选语法返回 null
function parseMultiValue(value: string): { options: string[]; separator: string } | null {
  if (!value.startsWith("[")) return null;
  const close = value.indexOf("]");
  if (close === -1) return null;
  const rest = value.slice(close + 1);
  if (rest && !rest.startsWith("~")) return null;
  return {
    options: value.slice(1, close).split("|").filter((o) => o.length > 0),
    separator: rest ? unescapeSeparator(rest.slice(1)) : DEFAULT_MULTI_SEPARATOR,
  };
}

export function parseVariables(body: string): ParsedVar[] {
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const seen = new Set<string>();
  const result: ParsedVar[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    if (raw.includes("+=")) {
      const [name, value] = raw.split("+=", 2);
      const multi = parseMultiValue(value.trim());
      if (multi) {
        result.push({ name, type: "multi", default: "", options: multi.options, separator: multi.separator });
        continue;
      }
      // += 但不是选项列表时按带默认值的文本变量处理
      result.push({ name, type: "text", default: value, options: [], separator: "" });
    } else if (raw.includes("=")) {
      const [name, value] = raw.split("=", 2);
      if (value.startsWith("[") && value.endsWith("]")) {
        result.push({
          name,
          type: "select",
          default: value.slice(1, -1).split("|")[0],
          options: value.slice(1, -1).split("|"),
          separator: "",
        });
      } else {
        result.push({ name, type: "text", default: value, options: [], separator: "" });
      }
    } else {
      result.push({ name: raw, type: "text", default: "", options: [], separator: "" });
    }
  }
  return result;
}

// renderBody 需要从占位符本身取回多选连接符，因此与 parseVariables 共用同一套提取规则
function placeholderInfo(raw: string): { name: string; separator: string } {
  if (raw.includes("+=")) {
    const [name, value] = raw.split("+=", 2);
    const multi = parseMultiValue(value.trim());
    if (multi) return { name, separator: multi.separator };
    return { name, separator: "" };
  }
  return { name: raw.includes("=") ? raw.split("=", 2)[0] : raw, separator: DEFAULT_MULTI_SEPARATOR };
}

export function renderBody(body: string, values: Record<string, string | string[]>): string {
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  return body.replace(re, (_full, raw: string) => {
    const { name, separator } = placeholderInfo(raw);
    const value = values[name];
    if (Array.isArray(value)) return value.join(separator);
    return value ?? "";
  });
}

export function sortPrompts(prompts: Prompt[]): Prompt[] {
  return [...prompts].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
  });
}

export function filterPrompts(prompts: Prompt[], query: string): Prompt[] {
  const q = query.trim().toLowerCase();
  if (!q) return prompts;
  return prompts.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)) ||
      p.folder.toLowerCase().includes(q)
  );
}
