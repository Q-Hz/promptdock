// Real ManagerApp + synthetic Tauri boundary. Never opens files or a database.
// Open /tests/browser/import-flow.html?recheck=clear (or conflict)&initial=clear&targets=duplicate.
// window.importFixture lets browser tests settle requests explicitly, including failures.
import { createApp } from "vue";
import ManagerApp from "../../src/components/ManagerApp.vue";
import type { ImportDecision, ImportPrecheck, Prompt } from "../../src/lib/api";
import { setLanguage } from "../../src/lib/i18n";
import "../../src/style.css";

const query = new URLSearchParams(location.search);
setLanguage(query.get("lang") === "en" ? "en" : "zh");
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const prompt = (id: string, title: string, body: string): Prompt => ({
  id, title, body, tags: ["test"], folder: "Fixture", favorite: false,
  useCount: 0, lastUsedAt: null, createdAt: 1, updatedAt: 2,
});
let records = [prompt("local-a", "条目 A", "本地正文 A"), prompt("local-b", "条目 B", "本地正文 B")];
const incoming = [prompt("import-a", "条目 A", "导入正文 A"), prompt("import-b", "条目 B", "导入正文 B")];
const makePrecheck = (clear: boolean): ImportPrecheck => ({
  newCount: clear ? 2 : 0, identicalCount: 0, conflictCount: clear ? 0 : 2,
  items: incoming.map((imported, i) => ({
    imported: clone(imported), kind: clear ? "new" : "conflict",
    candidates: clear ? [] : [clone(records[query.get("targets") === "duplicate" ? 0 : i])],
  })),
});
const state = {
  calls: [] as Array<{ command: string; args?: any }>,
  alerts: [] as string[],
  questions: [] as string[],
  pending: false,
  awaitingAnswer: false,
};
const listeners = new Map<string, () => void>();
let settleCommit: ((outcome: "success" | "error" | "stale") => void) | undefined;
let settleAnswer: ((answer: boolean) => void) | undefined;
window.alert = (message) => { state.alerts.push(String(message)); };
(window as any).__TAURI__ = {
  event: { listen: async (name: string, callback: () => void) => {
    listeners.set(name, callback);
    return () => listeners.delete(name);
  } },
  dialog: {
    open: async () => "synthetic-import.json",
    ask: async (message: string) => {
      state.questions.push(message);
      if (state.questions.length === 1) return false; // Merge, not replace.
      state.awaitingAnswer = true;
      return new Promise<boolean>((resolve) => {
        settleAnswer = (answer) => { state.awaitingAnswer = false; resolve(answer); };
      });
    },
  },
  core: { invoke: async (command: string, args?: any) => {
    state.calls.push({ command, args: args ? clone(args) : undefined });
    switch (command) {
      case "list_prompts": return clone(records);
      case "set_manager_guard_ready":
      case "resolve_close":
      case "resolve_quit": return;
      case "precheck_import": return makePrecheck(query.get("initial") === "clear");
      case "precheck_import_snapshot": {
        const fresh = makePrecheck(query.get("recheck") !== "conflict");
        fresh.items.forEach((item) => item.candidates.forEach((p) => { p.body += " (changed)"; }));
        return fresh;
      }
      case "commit_import":
        if (state.pending) throw new Error("Duplicate concurrent commit");
        state.pending = true;
        return new Promise((resolve, reject) => {
          settleCommit = (outcome) => {
            state.pending = false;
            if (outcome !== "success") {
              reject(outcome === "stale" ? "import.stale_plan" : "fixture write failure");
              return;
            }
            const decisions = args.decisions as ImportDecision[];
            const result = { inserted: 0, updated: 0, insertedAsNew: 0, skipped: 0 };
            for (const item of (args.precheck as ImportPrecheck).items) {
              const choice = decisions.find((d) => d.importedId === item.imported.id);
              if (choice?.action === "keep_local" || item.kind === "identical") { result.skipped++; continue; }
              const created = clone(item.imported);
              if (choice?.action === "use_imported") {
                records = records.filter((p) => p.id !== choice.targetLocalId);
                result.updated++;
              } else if (choice?.action === "import_as_new") {
                created.id += "-new";
                result.insertedAsNew++;
              } else result.inserted++;
              records.push(created);
            }
            resolve(result);
          };
        });
      default: throw new Error(`Unexpected command: ${command}`);
    }
  } },
};
(window as any).importFixture = {
  state,
  release: (outcome: "success" | "error" | "stale") => {
    const settle = settleCommit;
    settleCommit = undefined;
    if (!settle) throw new Error("No pending commit");
    settle(outcome);
  },
  answer: (answer: boolean) => {
    const settle = settleAnswer;
    settleAnswer = undefined;
    if (!settle) throw new Error("No pending question");
    settle(answer);
  },
  emit: (event: string) => listeners.get(event)?.(),
};
createApp(ManagerApp).mount("#app");
