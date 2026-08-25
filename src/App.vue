<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api, type Settings } from "./lib/api";
import ManagerApp from "./components/ManagerApp.vue";
import LauncherApp from "./components/LauncherApp.vue";

const isManager = computed(() =>
  new URLSearchParams(window.location.search).get("window") === "manager"
);

const theme = ref<"auto" | "light" | "dark">("auto");

function applyTheme() {
  const prefersDark =
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme.value === "dark" || (theme.value === "auto" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

onMounted(async () => {
  try {
    const s: Settings = await api.getSettings();
    theme.value = s.theme;
  } catch {}
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
});

watch(theme, applyTheme);
</script>

<template>
  <ManagerApp v-if="isManager" />
  <LauncherApp v-else />
</template>
