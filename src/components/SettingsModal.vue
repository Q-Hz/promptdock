<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { api, type Settings } from "../lib/api";
import { t, translateApiError, type MessageKey } from "../lib/i18n";
import { applyClientSettings } from "../lib/preferences";
import { DEFAULT_KEY_BINDINGS } from "../lib/keybindings";

const emit = defineEmits<{ (e: "close"): void }>();

type RecordTarget = "hotkey" | "advanceKey" | "newlineKey" | "backKey";

const settings = ref<Settings>({
  hotkey: "ctrl+shift+space",
  autostart: false,
  theme: "auto",
  language: "auto",
  advanceKey: DEFAULT_KEY_BINDINGS.advance,
  newlineKey: DEFAULT_KEY_BINDINGS.newline,
  backKey: DEFAULT_KEY_BINDINGS.back,
});
const originalSettings = ref<Settings>({ ...settings.value });
const hotkeyDraft = ref("");
const recordTarget = ref<RecordTarget | null>(null);
const savedTip = ref(false);
const loaded = ref(false);

const bindingRows: { field: RecordTarget; label: MessageKey }[] = [
  { field: "advanceKey", label: "keyAdvance" },
  { field: "newlineKey", label: "keyNewline" },
  { field: "backKey", label: "keyBack" },
];

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

function startRecord(target: RecordTarget) {
  recordTarget.value = target;
  if (target === "hotkey") hotkeyDraft.value = "";
  void nextTick(() => {
    document.getElementById(`binding-input-${target}`)?.focus();
  });
}

function onHotkeyKeydown(e: KeyboardEvent) {
  if (!recordTarget.value) return;
  e.preventDefault();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.toLowerCase();
  if (["control", "alt", "shift"].includes(key)) return;
  parts.push(key === " " ? "space" : key);
  const value = parts.join("+");
  const target = recordTarget.value;
  if (target === "hotkey") hotkeyDraft.value = value;
  else settings.value[target] = value;
  recordTarget.value = null;
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
          <code
            id="binding-input-hotkey"
            class="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
            tabindex="0"
            @keydown="onHotkeyKeydown"
            @click="startRecord('hotkey')"
          >
            {{ recordTarget === "hotkey" ? t("pressHotkey") : hotkeyDraft }}
          </code>
          <button class="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @click="startRecord('hotkey')">{{ t("change") }}</button>
        </div>
      </div>

      <div class="mb-4">
        <div class="mb-1 text-xs font-medium text-neutral-500">{{ t("launcherKeysSection") }}</div>
        <div v-for="row in bindingRows" :key="row.field" class="mb-2 flex items-center gap-2">
          <span class="w-24 shrink-0 text-xs text-neutral-500">{{ t(row.label) }}</span>
          <code
            :id="`binding-input-${row.field}`"
            class="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
            tabindex="0"
            @keydown="onHotkeyKeydown"
            @click="startRecord(row.field)"
          >
            {{ recordTarget === row.field ? t("pressHotkey") : settings[row.field] }}
          </code>
          <button class="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600" @click="startRecord(row.field)">{{ t("change") }}</button>
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
