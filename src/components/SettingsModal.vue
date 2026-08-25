<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { api, type Settings } from "../lib/api";
import { t, translateApiError } from "../lib/i18n";
import { applyClientSettings } from "../lib/preferences";

const emit = defineEmits<{ (e: "close"): void }>();

const settings = ref<Settings>({
  hotkey: "ctrl+shift+space",
  autostart: false,
  theme: "auto",
  language: "auto",
});
const originalSettings = ref<Settings>({ ...settings.value });
const hotkeyDraft = ref("");
const recording = ref(false);
const savedTip = ref(false);
const loaded = ref(false);

onMounted(async () => {
  settings.value = await api.getSettings();
  originalSettings.value = { ...settings.value };
  hotkeyDraft.value = settings.value.hotkey;
  loaded.value = true;
});

watch(
  () => [settings.value.theme, settings.value.language] as const,
  () => {
    if (loaded.value) applyClientSettings(settings.value);
  }
);

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
    await api.setSettings({ ...settings.value });
    originalSettings.value = { ...settings.value };
    savedTip.value = true;
    setTimeout(() => emit("close"), 600);
  } catch (err) {
    alert(
      t("saveFailed", { error: translateApiError(err) }) +
        "\n" +
        t("hotkeyUnavailable")
    );
  }
}

function cancel() {
  applyClientSettings(originalSettings.value);
  emit("close");
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="cancel">
    <div class="w-[420px] rounded-xl bg-white p-5 shadow-2xl dark:bg-neutral-800">
      <h2 class="mb-4 text-base font-semibold">{{ t("settingsTitle") }}</h2>

      <div class="mb-4">
        <div class="mb-1 text-xs font-medium text-neutral-500">{{ t("hotkey") }}</div>
        <div class="flex gap-2">
          <code class="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @keydown="onHotkeyKeydown" tabindex="0">
            {{ recording ? t("pressHotkey") : hotkeyDraft }}
          </code>
          <button class="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @click="startRecord">{{ t("change") }}</button>
        </div>
      </div>

      <label class="mb-4 flex items-center gap-2 text-sm">
        <input v-model="settings.autostart" type="checkbox" class="h-4 w-4" />
        {{ t("autostart") }}
      </label>

      <div class="mb-4">
        <div class="mb-1 text-xs font-medium text-neutral-500">{{ t("theme") }}</div>
        <div class="flex gap-2">
          <button
            v-for="value in (['auto', 'light', 'dark'] as const)"
            :key="value"
            class="flex-1 rounded-md border px-3 py-1.5 text-sm"
            :class="settings.theme === value ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'border-neutral-300 dark:border-neutral-600'"
            @click="settings.theme = value"
          >{{ value === "auto" ? t("automatic") : value === "light" ? t("light") : t("dark") }}</button>
        </div>
      </div>

      <div class="mb-5">
        <div class="mb-1 text-xs font-medium text-neutral-500">{{ t("language") }}</div>
        <div class="flex gap-2">
          <button
            v-for="value in (['auto', 'zh', 'en'] as const)"
            :key="value"
            class="flex-1 rounded-md border px-3 py-1.5 text-sm"
            :class="settings.language === value ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'border-neutral-300 dark:border-neutral-600'"
            @click="settings.language = value"
          >{{ value === "auto" ? t("automatic") : value === "zh" ? t("chinese") : t("english") }}</button>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="cancel">{{ t("cancel") }}</button>
        <button class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="save">
          {{ savedTip ? `✓ ${t("saved")}` : t("save") }}
        </button>
      </div>
    </div>
  </div>
</template>
