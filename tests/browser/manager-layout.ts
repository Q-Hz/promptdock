// Real ManagerApp + synthetic Tauri boundary. Never touches a database or the filesystem.
// Open /tests/browser/manager-layout.html?lang=zh&theme=light with npm run dev.
// Data and preferences live in localStorage so a page reload simulates an app restart.
// window.managerFixture exposes the recorded calls and reset/seed helpers for browser checks.
import { createApp } from "vue";
import ManagerApp from "../../src/components/ManagerApp.vue";
import type { Library, Organization, Prompt, PromptUpdate } from "../../src/lib/api";
import { setLanguage } from "../../src/lib/i18n";
import "../../src/style.css";

const query = new URLSearchParams(location.search);
setLanguage(query.get("lang") === "en" ? "en" : "zh");
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const DATA_KEY = "manager-layout-fixture-library";
const PREFS_KEY = "manager-layout-fixture-prefs";

// AC-01 需要按具体窗口尺寸验证，而浏览器视口不等于管理器窗口：
// 用 w/h 把 #app 固定成目标尺寸，测量结果即对应该窗口大小。
const simulatedWidth = Number(query.get("w"));
const simulatedHeight = Number(query.get("h"));
if (simulatedWidth > 0 && simulatedHeight > 0) {
  const app = document.getElementById("app");
  if (app) {
    app.style.width = `${simulatedWidth}px`;
    app.style.height = `${simulatedHeight}px`;
  }
  document.body.style.overflow = "auto";
}
if (query.get("fresh") === "1") {
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(PREFS_KEY);
}

function makePrompt(id: string, title: string, folder: string, extra: Partial<Prompt> = {}): Prompt {
  return {
    id, title, body: "Body of {{topic}}", tags: ["fixture"], folder,
    favorite: false, pinned: false, useCount: 0, lastUsedAt: null,
    createdAt: 1000, updatedAt: 1000, ...extra,
  };
}

// 合成数据：1 / 5 / 6 / 30 条文件夹、未分类、同名提示词，以及四种收藏与置顶组合
function seedRecords(): Prompt[] {
  const records: Prompt[] = [];
  for (let i = 1; i <= 30; i++) {
    records.push(makePrompt(
      `note-${String(i).padStart(2, "0")}`,
      i === 20 ? "Note about zeppelin docking" : `Note organization item ${i}`,
      "Note organization",
      { createdAt: 1000 + i },
    ));
  }
  for (let i = 1; i <= 6; i++) {
    records.push(makePrompt(`write-${i}`, `Writing draft ${i}`, "Writing", { createdAt: 2000 + i }));
  }
  for (let i = 1; i <= 5; i++) {
    records.push(makePrompt(`exact-${i}`, `Exactly five ${i}`, "Exactly five", { createdAt: 3000 + i }));
  }
  records.push(makePrompt("solo-1", "Solo prompt", "Solo", {
    createdAt: 4000,
    body: "Plain body without any variable",
  }));
  records.push(makePrompt("uncat-1", "Uncategorized one", "", { createdAt: 5000 }));
  records.push(makePrompt("uncat-2", "Uncategorized two", "", { createdAt: 5001 }));
  records.push(makePrompt("dup-1", "Same title", "Duplicates", { createdAt: 6000 }));
  records.push(makePrompt("dup-2", "Same title", "Duplicates", { createdAt: 6001 }));
  // 四种收藏 / 置顶组合
  records.push(makePrompt("combo-plain", "Combo plain", "Combos", { createdAt: 7000 }));
  records.push(makePrompt("combo-favorite", "Combo favorite only", "Combos", { createdAt: 7001, favorite: true }));
  records.push(makePrompt("combo-pinned", "Combo pinned only", "Combos", { createdAt: 7002, pinned: true }));
  records.push(makePrompt("combo-both", "Combo both", "Combos", { createdAt: 7003, favorite: true, pinned: true }));
  return records;
}

function seedOrganization(records: Prompt[]): Organization {
  const folderOrder: string[] = [];
  const promptOrderByFolder: Record<string, string[]> = {};
  for (const record of records) {
    if (!folderOrder.includes(record.folder)) folderOrder.push(record.folder);
    (promptOrderByFolder[record.folder] ??= []).push(record.id);
  }
  return {
    folderOrder,
    promptOrderByFolder,
    pinnedOrder: records.filter((record) => record.pinned).map((record) => record.id),
  };
}

function readStore<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    return fallback();
  }
}

const initial = readStore(DATA_KEY, () => ({ records: seedRecords(), organization: null as Organization | null }));
let records: Prompt[] = initial.records;
let organization: Organization = initial.organization ?? seedOrganization(records);
let prefs: Record<string, string> = readStore(PREFS_KEY, () => ({}));

function persist() {
  localStorage.setItem(DATA_KEY, JSON.stringify({ records, organization }));
}
function persistPrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

const byCreatedThenId = (a: Prompt, b: Prompt) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function membersOf(folder: string): Prompt[] {
  return records.filter((record) => record.folder === folder).sort(byCreatedThenId);
}

// 与后端一致的读取时对齐：丢弃陈旧 ID、补全漏列成员、新文件夹追加到末尾
function normalized(): Organization {
  const next: Organization = { folderOrder: [], promptOrderByFolder: {}, pinnedOrder: [] };
  const realFolders = new Set(records.map((record) => record.folder));
  const seen = new Set<string>();
  for (const folder of organization.folderOrder) {
    if (seen.has(folder)) continue;
    seen.add(folder);
    next.folderOrder.push(folder);
  }
  for (const folder of [...realFolders].sort()) {
    if (!seen.has(folder)) next.folderOrder.push(folder);
  }
  for (const folder of realFolders) {
    const members = membersOf(folder);
    const ids = new Set(members.map((member) => member.id));
    const ordered: string[] = [];
    for (const id of organization.promptOrderByFolder[folder] ?? []) {
      if (ids.has(id) && !ordered.includes(id)) ordered.push(id);
    }
    for (const member of members) {
      if (!ordered.includes(member.id)) ordered.push(member.id);
    }
    next.promptOrderByFolder[folder] = ordered;
  }
  const pinnedIds = records.filter((record) => record.pinned).map((record) => record.id);
  for (const id of organization.pinnedOrder) {
    if (pinnedIds.includes(id) && !next.pinnedOrder.includes(id)) next.pinnedOrder.push(id);
  }
  for (const id of pinnedIds) {
    if (!next.pinnedOrder.includes(id)) next.pinnedOrder.push(id);
  }
  return next;
}

function applySlotOrder(previous: string[], given: string[]): string[] {
  const known = new Set(previous);
  const requested = given.filter((key, index, all) => known.has(key) && all.indexOf(key) === index);
  const listed = new Set(requested);
  const fill = [...requested];
  const next: string[] = [];
  for (const key of previous) {
    next.push(listed.has(key) ? (fill.shift() ?? key) : key);
  }
  next.push(...fill);
  return next;
}

const state = {
  calls: [] as Array<{ command: string; args?: any }>,
  alerts: [] as string[],
  confirmed: [] as string[],
};
const listeners = new Map<string, () => void>();

window.alert = (message) => { state.alerts.push(String(message)); };
window.confirm = (message) => { state.confirmed.push(String(message)); return true; };

(window as any).__TAURI__ = {
  event: {
    listen: async (name: string, callback: () => void) => {
      listeners.set(name, callback);
      return () => listeners.delete(name);
    },
  },
  dialog: { open: async () => null, save: async () => null, ask: async () => false },
  core: {
    invoke: async (command: string, args?: any): Promise<unknown> => {
      state.calls.push({ command, args: args ? clone(args) : undefined });
      if (["set_folder_order", "set_prompt_order", "set_pinned_order", "move_prompt"].includes(command)) {
        const canonical = (value: Organization) => JSON.stringify({
          folderOrder: value.folderOrder, pinnedOrder: value.pinnedOrder,
          members: Object.entries(value.promptOrderByFolder).sort(([a], [b]) => a.localeCompare(b)),
        });
        if (!args.expected || canonical(args.expected) !== canonical(normalized())) throw "organization.stale";
      }
      switch (command) {
        case "load_library": {
          organization = normalized();
          return clone({ prompts: records, organization } satisfies Library);
        }
        case "get_ui_prefs": return prefs[args.key] ?? "";
        case "set_ui_prefs": prefs[args.key] = args.value; persistPrefs(); return;
        case "set_manager_guard_ready":
        case "resolve_close":
        case "resolve_quit": return;
        case "mark_used": {
          const record = records.find((item) => item.id === args.id);
          if (record) { record.useCount += 1; record.lastUsedAt = Date.now(); persist(); }
          return;
        }
        case "set_favorite": {
          const record = records.find((item) => item.id === args.id);
          if (!record) throw "prompt.not_found";
          record.favorite = args.favorite;
          persist();
          return clone(record);
        }
        case "set_pinned": {
          const record = records.find((item) => item.id === args.id);
          if (!record) throw "prompt.not_found";
          record.pinned = args.pinned;
          if (args.pinned) {
            if (!organization.pinnedOrder.includes(record.id)) organization.pinnedOrder.push(record.id);
          } else {
            organization.pinnedOrder = organization.pinnedOrder.filter((id) => id !== record.id);
          }
          persist();
          return clone({ prompt: record, organization: normalized() } satisfies PromptUpdate);
        }
        case "set_folder_order":
          organization.folderOrder = applySlotOrder(normalized().folderOrder, args.order);
          persist();
          return clone(normalized());
        case "set_prompt_order": {
          const current = normalized();
          current.promptOrderByFolder[args.folder] = applySlotOrder(
            current.promptOrderByFolder[args.folder] ?? [], args.order,
          );
          organization = current;
          persist();
          return clone(normalized());
        }
        case "set_pinned_order":
          organization.pinnedOrder = applySlotOrder(normalized().pinnedOrder, args.order);
          persist();
          return clone(normalized());
        case "move_prompt": {
          if (args.toFolder && !records.some((item) => item.folder === args.toFolder)) throw "organization.stale";
          const record = records.find((item) => item.id === args.id);
          if (!record) throw "prompt.not_found";
          const from = record.folder;
          record.folder = args.toFolder;
          record.updatedAt = Date.now();
          const current = normalized();
          current.promptOrderByFolder[from] = (current.promptOrderByFolder[from] ?? [])
            .filter((id) => id !== record.id);
          if (!current.folderOrder.includes(record.folder)) current.folderOrder.push(record.folder);
          const target = (current.promptOrderByFolder[record.folder] ?? []).filter((id) => id !== record.id);
          const index = args.index === null || args.index === undefined ? target.length : Math.min(args.index, target.length);
          target.splice(index, 0, record.id);
          current.promptOrderByFolder[record.folder] = target;
          organization = current;
          persist();
          return clone({ prompt: record, organization: normalized() } satisfies PromptUpdate);
        }
        case "save_prompt": {
          const incoming = clone(args.prompt) as Prompt;
          const now = Date.now();
          if (!incoming.id) {
            incoming.id = `created-${now}`;
            incoming.createdAt = now;
          } else {
            incoming.createdAt = records.find((item) => item.id === incoming.id)?.createdAt ?? now;
          }
          incoming.updatedAt = now;
          records = records.filter((item) => item.id !== incoming.id);
          records.push(incoming);
          const current = normalized();
          if (!current.folderOrder.includes(incoming.folder)) current.folderOrder.push(incoming.folder);
          const list = current.promptOrderByFolder[incoming.folder] ?? [];
          if (!list.includes(incoming.id)) list.push(incoming.id);
          current.promptOrderByFolder[incoming.folder] = list;
          if (incoming.pinned && !current.pinnedOrder.includes(incoming.id)) current.pinnedOrder.push(incoming.id);
          organization = current;
          persist();
          return clone(incoming);
        }
        case "delete_prompt": {
          const record = records.find((item) => item.id === args.id);
          records = records.filter((item) => item.id !== args.id);
          const current = normalized();
          if (record) {
            current.promptOrderByFolder[record.folder] =
              (current.promptOrderByFolder[record.folder] ?? []).filter((id) => id !== args.id);
          }
          current.pinnedOrder = current.pinnedOrder.filter((id) => id !== args.id);
          organization = current;
          persist();
          return;
        }
        case "copy_text": return;
        default: throw new Error(`Unexpected command: ${command}`);
      }
    },
  },
};

(window as any).managerFixture = {
  state,
  records: () => clone(records),
  organization: () => clone(normalized()),
  prefs: () => clone(prefs),
  callsFor: (command: string) => state.calls.filter((call) => call.command === command),
  reset: () => {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(PREFS_KEY);
    records = seedRecords();
    organization = seedOrganization(records);
    prefs = {};
    state.calls = [];
    state.alerts = [];
    location.reload();
  },
  emit: (event: string) => listeners.get(event)?.(),
};

createApp(ManagerApp).mount("#app");
