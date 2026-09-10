<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { api, type Settings } from "./lib/api";
import { refreshAutomaticLanguage, resolvedLanguage } from "./lib/i18n";
import { applyClientSettings, theme } from "./lib/preferences";
import { isDeveloperToolsShortcut } from "./lib/webview-guards";
import ManagerApp from "./components/ManagerApp.vue";
import LauncherApp from "./components/LauncherApp.vue";

const isManager = computed(() =>
  new URLSearchParams(window.location.search).get("window") === "manager"
);

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
let unlistenSettings: (() => void) | undefined;

function applyTheme() {
  const dark = theme.value === "dark" || (theme.value === "auto" && colorScheme.matches);
  document.documentElement.classList.toggle("dark", dark);
}

function preventNativeContextMenu(event: MouseEvent) {
  event.preventDefault();
}

function preventDeveloperToolsShortcut(event: KeyboardEvent) {
  if (!isDeveloperToolsShortcut(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

onMounted(async () => {
  document.addEventListener("contextmenu", preventNativeContextMenu);
  window.addEventListener("keydown", preventDeveloperToolsShortcut, true);
  try {
    applyClientSettings(await api.getSettings());
  } catch {}
  unlistenSettings = await (window as any).__TAURI__.event.listen(
    "settings-changed",
    (event: { payload: Settings }) => applyClientSettings(event.payload)
  );
  colorScheme.addEventListener("change", applyTheme);
  window.addEventListener("languagechange", refreshAutomaticLanguage);
});

onUnmounted(() => {
  unlistenSettings?.();
  colorScheme.removeEventListener("change", applyTheme);
  window.removeEventListener("languagechange", refreshAutomaticLanguage);
  document.removeEventListener("contextmenu", preventNativeContextMenu);
  window.removeEventListener("keydown", preventDeveloperToolsShortcut, true);
});

watch(theme, applyTheme, { immediate: true });
watch(resolvedLanguage, (value) => {
  document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
}, { immediate: true });
</script>

<template>
  <ManagerApp v-if="isManager" />
  <LauncherApp v-else />
</template>
