<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type Settings } from "../lib/api";

const emit = defineEmits<{ (e: "close"): void }>();

const settings = ref<Settings>({ hotkey: "ctrl+shift+space", autostart: false, theme: "auto" });
const hotkeyDraft = ref("");
const recording = ref(false);
const savedTip = ref(false);

onMounted(async () => {
  settings.value = await api.getSettings();
  hotkeyDraft.value = settings.value.hotkey;
});

function startRecord() {
  recording.value = true;
  hotkeyDraft.value = "";
}

function onHotkeyKeydown(e: KeyboardEvent) {
  if (!recording.value) return;
  e.preventDefault();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.toLowerCase();
  if (["control", "alt", "shift"].includes(key)) return;
  parts.push(key === " " ? "space" : key);
  hotkeyDraft.value = parts.join("+");
  recording.value = false;
}

async function save() {
  settings.value.hotkey = hotkeyDraft.value || "ctrl+shift+space";
  try {
    await api.setSettings(settings.value);
    savedTip.value = true;
    setTimeout(() => emit("close"), 600);
  } catch (err) {
    alert("保存失败：" + err + "\n快捷键可能无效或被占用");
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="emit('close')">
    <div class="w-[420px] rounded-xl bg-white p-5 shadow-2xl dark:bg-neutral-800">
      <h2 class="mb-4 text-base font-semibold">设置</h2>

      <div class="mb-4">
        <div class="mb-1 text-xs font-medium text-neutral-500">调用快捷键</div>
        <div class="flex gap-2">
          <code class="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @keydown="onHotkeyKeydown" tabindex="0">
            {{ recording ? "请按下新的快捷键组合..." : hotkeyDraft }}
          </code>
          <button class="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @click="startRecord">修改</button>
        </div>
      </div>

      <label class="mb-4 flex items-center gap-2 text-sm">
        <input v-model="settings.autostart" type="checkbox" class="h-4 w-4" />
        Windows 启动时运行 PromptDock
      </label>

      <div class="mb-5">
        <div class="mb-1 text-xs font-medium text-neutral-500">主题</div>
        <div class="flex gap-2">
          <button
            v-for="t in (['auto', 'light', 'dark'] as const)"
            :key="t"
            class="flex-1 rounded-md border px-3 py-1.5 text-sm"
            :class="settings.theme === t ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'border-neutral-300 dark:border-neutral-600'"
            @click="settings.theme = t"
          >{{ t === 'auto' ? '自动' : t === 'light' ? '浅色' : '深色' }}</button>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="emit('close')">取消</button>
        <button class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="save">
          {{ savedTip ? "✓ 已保存" : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>
