import { createApp } from "vue";
import LauncherApp from "../../src/components/LauncherApp.vue";
import "../../src/style.css";

const prompt = {
  id: "preview-fixture",
  title: "Markdown 预览验收",
  body: "# 验收结论\n\n- **通过**：已完成\n- `待检查`：继续复验\n\n> 以实际结果为准。",
  tags: ["preview"],
  folder: "测试",
  favorite: false,
  pinned: false,
  useCount: 0,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1,
};

(window as any).__TAURI__ = {
  core: {
    invoke: async (command: string, args: Record<string, string> = {}) => {
      if (command === "load_library") return {
        prompts: [prompt],
        organization: { folderOrder: [], promptOrderByFolder: {}, pinnedOrder: [] },
      };
      if (command === "get_ui_prefs") return localStorage.getItem(args.key) ?? "";
      if (command === "set_ui_prefs") {
        localStorage.setItem(args.key, args.value);
        return;
      }
      if (command === "get_settings") return {
        advanceKey: "Enter", newlineKey: "Shift+Enter", backKey: "Escape",
      };
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
  event: { listen: async () => () => {} },
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

createApp(LauncherApp).mount("#app");
