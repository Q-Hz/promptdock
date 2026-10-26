import { createApp } from "vue";
import LauncherApp from "../../src/components/LauncherApp.vue";
import "../../src/style.css";
import { snippetBodies } from "./optional-snippet-fixtures";
import { setLanguage } from "../../src/lib/i18n";
import { VARIABLE_EXAMPLE_KINDS, variableExample, type VariableExampleKind } from "../../src/lib/variable-examples";
import acceptanceDocument from "../../examples/optional-snippets-test.json";
import syntaxGuideZh from "../../examples/promptdock-syntax-guide.zh.md?raw";
import syntaxGuideEn from "../../examples/promptdock-syntax-guide.en.md?raw";

const params = new URLSearchParams(location.search);
setLanguage(params.get("lang") === "en" ? "en" : "zh");
document.documentElement.classList.toggle("dark", params.get("theme") === "dark");
const variableBodies: Record<string, string> = {
  ...snippetBodies,
  acceptance: acceptanceDocument.prompts[0].body,
  "syntax-guide-zh": syntaxGuideZh,
  "syntax-guide-en": syntaxGuideEn,
  one: "{{text}}",
  two: "{{source}}\n{{request=default request}}",
  three: "{{one}}\n{{two}}\n{{three}}",
  mixed: "{{source}}\n{{choice=[a|b]}}\n{{request=default request}}\n{{multi+=[x|y]}}",
  many: Array.from({ length: 12 }, (_, i) => `{{text${i}}}`).join("\n"),
  options: "{{choice=[a|b]}}\n{{multi+=[x|y]}}",
};
const exampleKind = params.get("example") as VariableExampleKind;
const example = VARIABLE_EXAMPLE_KINDS.includes(exampleKind) ? variableExample(exampleKind) : null;
const prompt = {
  id: "preview-fixture",
  title: example?.title ?? "Markdown 预览验收",
  body: example?.code ?? variableBodies[params.get("variables") ?? ""] ?? (params.has("back-guard") || params.has("search-state")
    ? "# {{text=initial}}\n{{choice=[a|b]}}\n{{multi+=[x|y]}}"
    : "# 验收结论\n\n- **通过**：已完成\n- `待检查`：继续复验\n\n> 以实际结果为准。"),
  tags: ["preview"],
  folder: "测试",
  favorite: false,
  pinned: false,
  useCount: 0,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const listeners = new Map<string, (event: unknown) => unknown>();
const fixturePrompts = params.has("search-state")
  ? Array.from({ length: 45 }, (_, i) => ({ ...prompt, id: `search-${i}`, title: `Search item ${i}`, tags: ["search-state"] }))
  : [prompt];
const fixture = {
  settingsDelay: 0,
  remount: () => { launcher.unmount(); launcher = createApp(LauncherApp); launcher.mount("#app"); },
  failRead: false,
  failWrite: false,
  writeDelay: 0,
  writes: [] as string[],
  quitReplies: [] as boolean[],
  emit: (name: string) => listeners.get(name)?.({ payload: null }),
};
(window as any).__launcherFixture = fixture;

(window as any).__TAURI__ = {
  core: {
    invoke: async (command: string, args: Record<string, any> = {}) => {
      if (command === "load_library") return {
        prompts: fixturePrompts,
        organization: { folderOrder: [], promptOrderByFolder: {}, pinnedOrder: [] },
      };
      if (command === "get_ui_prefs") {
        if (fixture.failRead) throw new Error("synthetic read failure");
        return localStorage.getItem(args.key) ?? "";
      }
      if (command === "set_ui_prefs") {
        fixture.writes.push(args.value);
        if (fixture.writeDelay) await new Promise(resolve => setTimeout(resolve, fixture.writeDelay));
        if (fixture.failWrite) throw new Error("synthetic save failure");
        localStorage.setItem(args.key, args.value);
        return;
      }
      if (command === "resolve_launcher_quit") {
        fixture.quitReplies.push(args.allow);
        return;
      }
      if (command === "get_settings") {
        if (fixture.settingsDelay) await new Promise(resolve => setTimeout(resolve, fixture.settingsDelay));
        return { advanceKey: "Enter", newlineKey: "Shift+Enter", backKey: "Escape" };
      }
      if (command === "set_launcher_preview") {
        document.documentElement.dataset.previewWidth = String(args.open);
        return;
      }
      if (command === "hide_main") {
        const count = Number(document.documentElement.dataset.hideCalls ?? "0");
        document.documentElement.dataset.hideCalls = String(count + 1);
        return;
      }
      return;
    },
  },
  event: { listen: async (name: string, handler: (event: unknown) => unknown) => {
    listeners.set(name, handler);
    return () => { if (listeners.get(name) === handler) listeners.delete(name); };
  } },
};

(window as any).__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" } },
  invoke: async (command: string) => {
    if (command === "plugin:window|is_focused") {
      return document.documentElement.dataset.nativeFocused === "true";
    }
    if (command === "plugin:window|start_dragging") {
      const count = Number(document.documentElement.dataset.dragCalls ?? "0");
      document.documentElement.dataset.dragCalls = String(count + 1);
      return;
    }
    throw new Error(`Unexpected Tauri command: ${command}`);
  },
};

let launcher = createApp(LauncherApp);
launcher.mount("#app");
