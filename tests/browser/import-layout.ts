// Browser-only fixture: synthetic records, no Tauri bridge or database access.
// Run with npm run dev, then open /tests/browser/import-layout.html?lang=zh&theme=dark.
import { createApp, h } from "vue";
import ImportComparePage from "../../src/components/import/ImportComparePage.vue";
import ConfirmLeaveDialog from "../../src/components/ConfirmLeaveDialog.vue";
import { api, type ImportPrecheck, type Prompt } from "../../src/lib/api";
import { setLanguage } from "../../src/lib/i18n";
import "../../src/style.css";

const query = new URLSearchParams(location.search);
const language = query.get("lang") === "en" ? "en" : "zh";
setLanguage(language);
document.documentElement.lang = language;
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
api.copyText = async (text) => { document.body.dataset.copied = text; };

const body = Array.from({ length: 60 }, (_, i) => `${i + 1}. 请根据输入整理重点，并说明理由。 / Summarize the input and explain your reasoning.`).join("\n");
function prompt(id: string, title: string, changes: Partial<Prompt> = {}): Prompt {
  return { id, title, body, tags: ["writing"], folder: "Examples", favorite: false,
    useCount: 5, lastUsedAt: null, createdAt: 1788307200000, updatedAt: 1788393600000, ...changes };
}
const precheck: ImportPrecheck = {
  newCount: 0, identicalCount: 23, conflictCount: 2,
  items: [
    { kind: "conflict", imported: prompt("incoming-one", "摘要写作 / Summary writing", {
      body: body.replace("整理重点", "提炼重点"), tags: ["writing", "review"], useCount: 12,
    }), candidates: [prompt("local-one", "摘要写作 / Summary writing")] },
    { kind: "conflict", imported: prompt("incoming-two", "提示词整理 / Organize prompts", {
      body: body.replace("说明理由", "列出依据"), folder: "Imported",
    }), candidates: [
      prompt("local-two", "提示词整理 / Organize prompts"),
      prompt("local-three", "提示词整理 / Organize prompts", { folder: "Archive", tags: ["archive"] }),
    ] },
  ],
};

createApp({
  render: () => h("div", { class: "h-full overflow-hidden" }, [
    h(ImportComparePage, {
      precheck,
      onConfirm: (decisions) => { document.body.dataset.decisions = JSON.stringify(decisions); },
      onCancel: () => { document.body.dataset.cancelled = "true"; },
    }),
    h(ConfirmLeaveDialog),
  ]),
}).mount("#app");
