<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  api, filterPrompts, parseVariables, sortPrompts,
  type Prompt,
} from "../lib/api";
import { t, translateApiError } from "../lib/i18n";
import SettingsModal from "./SettingsModal.vue";

const prompts = ref<Prompt[]>([]);
const query = ref("");
const selectedId = ref<string | null>(null);
const showSettings = ref(false);

const editing = ref<Prompt>(emptyPrompt());
const editorShowVarHint = computed(() => parseVariables(editing.value.body));

function emptyPrompt(): Prompt {
  const now = Date.now();
  return {
    id: "", title: "", body: "", tags: [], folder: "", favorite: false,
    useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now,
  };
}

const folders = computed(() => {
  const map = new Map<string, Prompt[]>();
  for (const p of filtered.value) {
    const key = p.folder || t("uncategorized");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

const filtered = computed(() => filterPrompts(sortPrompts(prompts.value), query.value));
const isSelectedDirty = computed(() => !!selectedId.value);

onMounted(async () => {
  await reload();
  if (prompts.value.length > 0) select(sortPrompts(prompts.value)[0]);
});

async function reload() {
  prompts.value = await api.listPrompts();
}

function select(p: Prompt) {
  selectedId.value = p.id;
  editing.value = JSON.parse(JSON.stringify(p));
}

function newPrompt() {
  selectedId.value = null;
  editing.value = emptyPrompt();
}

async function save() {
  if (!editing.value.title.trim()) return;
  try {
    const saved = await api.savePrompt(editing.value);
    await reload();
    select(saved);
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
  }
}

async function remove() {
  if (!selectedId.value) return;
  if (!confirm(t("deleteConfirm", { title: editing.value.title }))) return;
  try {
    await api.deletePrompt(selectedId.value);
    await reload();
    newPrompt();
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
  }
}

async function toggleFavorite() {
  editing.value.favorite = !editing.value.favorite;
  if (editing.value.id) {
    await api.savePrompt(editing.value);
    await reload();
  }
}

const tagsInput = computed({
  get: () => editing.value.tags.join(", "),
  set: (v: string) => {
    editing.value.tags = v.split(",").map((t) => t.trim()).filter(Boolean);
  },
});

async function doExport() {
  const { save } = (window as any).__TAURI__.dialog;
  const path = await save({
    defaultPath: `promptdock-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    await api.exportPrompts(path);
    alert(t("exportSuccess"));
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
  }
}

async function doImport() {
  const { open, ask } = (window as any).__TAURI__.dialog;
  const path = await open({
    filters: [{ name: "JSON", extensions: ["json"] }],
    multiple: false,
  });
  if (!path) return;
  const replace = await ask(t("importConfirmMessage"), {
    title: t("importConfirmTitle"),
    kind: "info",
    okLabel: t("replace"),
    cancelLabel: t("merge"),
  });
  try {
    const count = await api.importPrompts(path as string, replace);
    await reload();
    alert(t("importSuccess", { count }));
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶栏 -->
    <header class="flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
      <div class="mr-auto">
        <h1 class="text-base font-bold">PromptDock</h1>
        <p class="text-[11px] text-neutral-400">{{ t("managerTagline") }}</p>
      </div>
      <button class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="newPrompt">{{ t("newPrompt") }}</button>
      <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="doImport">{{ t("import") }}</button>
      <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="doExport">{{ t("export") }}</button>
      <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="showSettings = true">⚙ {{ t("settings") }}</button>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- 左侧列表 -->
      <aside class="flex w-72 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
        <div class="p-2">
          <input
            v-model="query"
            :placeholder="t('searchPlaceholder')"
            class="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-2 pb-2">
          <div v-if="folders.length === 0" class="p-4 text-center text-sm text-neutral-400">
            {{ t("noSearchResults") }}
          </div>
          <div v-for="f in folders" :key="f.name" class="mb-2">
            <div class="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {{ f.name }}
            </div>
            <button
              v-for="p in f.items"
              :key="p.id"
              class="mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm"
              :class="p.id === selectedId ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
              @click="select(p)"
            >
              <span v-if="p.favorite" class="shrink-0">⭐</span>
              <span class="truncate">{{ p.title }}</span>
              <span class="ml-auto shrink-0 max-w-[90px] truncate text-[11px] opacity-60">
                {{ p.tags.join("·") }}
              </span>
            </button>
          </div>
        </div>
      </aside>

      <!-- 右侧编辑区 -->
      <main class="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div class="flex items-center gap-2">
          <input
            v-model="editing.title"
            :placeholder="t('promptTitlePlaceholder')"
            class="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm font-medium outline-none focus:border-blue-400 dark:border-neutral-600"
          />
          <button
            class="rounded-md border px-3 py-2 text-sm"
            :class="editing.favorite ? 'border-yellow-400 bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30' : 'border-neutral-300 dark:border-neutral-600'"
            @click="toggleFavorite"
          >⭐ {{ editing.favorite ? t("favorited") : t("favorite") }}</button>
        </div>
        <div class="flex gap-2">
          <input
            v-model="tagsInput"
            :placeholder="t('tagsPlaceholder')"
            class="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
          />
          <input
            v-model="editing.folder"
            :placeholder="t('folderPlaceholder')"
            list="folder-list"
            class="w-56 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
          />
          <datalist id="folder-list">
            <option v-for="name in new Set(prompts.map((p) => p.folder).filter(Boolean))" :key="name" :value="name" />
          </datalist>
        </div>
        <textarea
          v-model="editing.body"
          :placeholder="t('bodyPlaceholder')"
          class="min-h-[280px] flex-1 resize-none rounded-md border border-neutral-300 bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus:border-blue-400 dark:border-neutral-600"
        />
        <div v-if="editorShowVarHint.length" class="text-xs text-neutral-400">
          {{ t("variablesDetected") }}
          <span
            v-for="v in editorShowVarHint"
            :key="v.name"
            class="mr-1.5 inline-block rounded bg-neutral-200 px-1.5 py-0.5 font-mono dark:bg-neutral-700"
          >{{ v.name }}<template v-if="v.type === 'select'"> ({{ t("selectValueHint") }})</template><template v-else-if="v.default"> ({{ t("defaultValueHint", { value: v.default }) }})</template></span>
        </div>
        <div class="flex items-center justify-between">
          <button
            v-if="isSelectedDirty"
            class="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30"
            @click="remove"
          >{{ t("delete") }}</button>
          <span v-else />
          <button class="rounded-md bg-blue-500 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="save">{{ t("save") }}</button>
        </div>
      </main>
    </div>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>
