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
}

export interface ParsedVar {
  name: string;
  type: "text" | "select";
  default: string;
  options: string[];
}

const invoke = (window as any).__TAURI__.core.invoke;

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
  importPrompts: (path: string, replace: boolean): Promise<number> =>
    invoke("import_prompts", { path, replace }),
};

export function parseVariables(body: string): ParsedVar[] {
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const seen = new Set<string>();
  const result: ParsedVar[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    if (raw.includes("=")) {
      const [name, value] = raw.split("=", 2);
      if (value.startsWith("[") && value.endsWith("]")) {
        result.push({
          name,
          type: "select",
          default: value.slice(1, -1).split("|")[0],
          options: value.slice(1, -1).split("|"),
        });
      } else {
        result.push({ name, type: "text", default: value, options: [] });
      }
    } else {
      result.push({ name: raw, type: "text", default: "", options: [] });
    }
  }
  return result;
}

export function renderBody(body: string, values: Record<string, string>): string {
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  return body.replace(re, (_full, raw: string) => {
    const name = raw.includes("=") ? raw.split("=", 2)[0] : raw;
    return values[name] ?? "";
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
      p.tags.some((t) => t.toLowerCase().includes(q))
  );
}
