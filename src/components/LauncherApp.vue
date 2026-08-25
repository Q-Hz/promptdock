<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  api, filterPrompts, parseVariables, renderBody, sortPrompts,
  type Prompt, type ParsedVar,
} from "../lib/api";
import { t, translateApiError } from "../lib/i18n";

type Stage = "search" | "variables" | "result";

const stage = ref<Stage>("search");
const query = ref("");
const prompts = ref<Prompt[]>([]);
const selectedId = ref<string | null>(null);
const selIndex = ref(0);
const varValues = ref<Record<string, string>>({});
const resultText = ref("");
const copied = ref(false);
const copying = ref(false);
const errorMessage = ref("");
const loading = ref(true);
const loadError = ref("");
let unlistenMainShown: (() => void) | undefined;

const filtered = computed(() => filterPrompts(sortPrompts(prompts.value), query.value));
const selected = computed(() => prompts.value.find((p) => p.id === selectedId.value) ?? null);
const vars = computed(() => (selected.value ? parseVariables(selected.value.body) : []));

async function reload() {
  loading.value = true;
  loadError.value = "";
  try {
    prompts.value = await api.listPrompts();
  } catch (error) {
    prompts.value = [];
    loadError.value = t("promptLoadFailed", { error: translateApiError(error) });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  reset();
  await reload();
  try {
    unlistenMainShown = await (window as any).__TAURI__.event.listen("main-shown", async () => {
      reset();
      await reload();
    });
  } catch (error) {
    if (!loadError.value) {
      loadError.value = t("promptLoadFailed", { error: translateApiError(error) });
    }
  }
  window.addEventListener("blur", handleWindowBlur);
});

onUnmounted(() => {
  unlistenMainShown?.();
  window.removeEventListener("blur", handleWindowBlur);
});

function handleWindowBlur() {
  if (stage.value === "search") void api.hideMain();
}

function reset() {
  stage.value = "search";
  query.value = "";
  selectedId.value = null;
  selIndex.value = 0;
  copied.value = false;
  copying.value = false;
  errorMessage.value = "";
  void nextTick(() => {
    document.querySelector<HTMLInputElement>("#launcher-input")?.focus();
  });
}

function choose(p: Prompt) {
  selectedId.value = p.id;
  const values: Record<string, string> = {};
  for (const v of parseVariables(p.body)) values[v.name] = v.default;
  varValues.value = values;
  stage.value = "variables";
  errorMessage.value = "";
  void nextTick(() => {
    document.querySelector<HTMLElement>(".variable-input")?.focus();
  });
}

function generate() {
  if (!selected.value) return;
  resultText.value = renderBody(selected.value.body, varValues.value);
  stage.value = "result";
  errorMessage.value = "";
}

async function copyAndClose() {
  if (copying.value) return;
  copying.value = true;
  errorMessage.value = "";
  try {
    await api.copyText(resultText.value);
    copied.value = true;
    if (selected.value) {
      try {
        await api.markUsed(selected.value.id);
      } catch {
        // 使用记录失败不应影响已经完成的复制操作。
      }
    }
    await api.hideMain();
  } catch (error) {
    errorMessage.value = t("copyFailed", { error: translateApiError(error) });
  } finally {
    copying.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (stage.value === "search") api.hideMain();
    else if (stage.value === "variables") reset();
    else stage.value = "variables";
  } else if (stage.value === "search") {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selIndex.value = Math.min(selIndex.value + 1, filtered.value.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selIndex.value = Math.max(selIndex.value - 1, 0);
    } else if (e.key === "Enter") {
      const p = filtered.value[selIndex.value];
      if (p) choose(p);
    }
  } else if (stage.value === "variables" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    generate();
  } else if (stage.value === "result" && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
    copyAndClose();
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800" @keydown="onKeydown">
    <div
      data-tauri-drag-region
      class="flex h-5 shrink-0 cursor-move items-center justify-center border-b border-neutral-100 dark:border-neutral-700/70"
      :title="t('dragWindow')"
    >
      <span data-tauri-drag-region class="h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
    </div>
    <!-- 搜索阶段 -->
    <div v-if="stage === 'search'" class="flex min-h-0 flex-1 flex-col">
      <div class="border-b border-neutral-200 p-3 dark:border-neutral-700">
        <input
          id="launcher-input"
          v-model="query"
          :placeholder="t('launcherSearchPlaceholder')"
          class="w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
          autofocus
        />
      </div>
      <div class="flex-1 overflow-y-auto p-1">
        <div v-if="loading" class="p-4 text-center text-sm text-neutral-400">
          {{ t("promptLoading") }}
        </div>
        <div v-else-if="loadError" class="p-4 text-center text-sm text-red-500">
          <p>{{ loadError }}</p>
          <button class="mt-3 rounded-md border border-red-300 px-3 py-1 text-xs hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30" @click="reload">
            {{ t("retry") }}
          </button>
        </div>
        <template v-else>
          <button
            v-for="(p, i) in filtered"
            :key="p.id"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
            :class="i === selIndex ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
            @mouseenter="selIndex = i"
            @click="choose(p)"
          >
            <span class="flex items-center gap-2 truncate">
              <span v-if="p.favorite">⭐</span>
              <span class="truncate text-sm font-medium">{{ p.title }}</span>
            </span>
            <span class="ml-2 shrink-0 text-xs opacity-70">
              {{ p.tags.join(" · ") }}<template v-if="p.folder"> · 📁{{ p.folder }}</template>
            </span>
          </button>
        </template>
        <div v-if="!loading && !loadError && filtered.length === 0" class="p-4 text-center text-sm text-neutral-400">
          {{ t("noSearchResults") }}
        </div>
      </div>
      <div class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ t("launcherKeyHint") }}
      </div>
    </div>

    <!-- 变量填写阶段 -->
    <div v-else-if="stage === 'variables'" class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">{{ selected?.title }}</h2>
        <span class="text-xs text-neutral-400">{{ t("variableCount", { count: vars.length }) }}</span>
      </div>
      <div v-if="vars.length === 0" class="text-sm text-neutral-400">{{ t("noVariables") }}</div>
      <div v-for="v in vars" :key="v.name" class="mb-3">
        <label class="mb-1 block text-xs font-medium text-neutral-500">{{ v.name }}</label>
        <select
          v-if="v.type === 'select'"
          v-model="varValues[v.name]"
          class="variable-input w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
        >
          <option v-for="o in v.options" :key="o" :value="o">{{ o }}</option>
        </select>
        <textarea
          v-else
          v-model="varValues[v.name]"
          rows="2"
          class="variable-input w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
        />
      </div>
      <div class="mt-auto flex justify-end gap-2 pt-2">
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="reset">{{ t("back") }}</button>
        <button class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="generate">{{ t("generatePrompt") }}</button>
      </div>
    </div>

    <!-- 结果编辑阶段 -->
    <div v-else class="flex min-h-0 flex-1 flex-col p-4">
      <textarea
        v-model="resultText"
        class="flex-1 resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
      />
      <div class="mt-3 flex justify-end gap-2">
        <p v-if="errorMessage" class="mr-auto self-center text-xs text-red-500">{{ errorMessage }}</p>
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="stage = 'variables'">{{ t("back") }}</button>
        <button
          :disabled="copying"
          class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          @click="copyAndClose"
        >
          {{ copying ? t("copying") : copied ? t("copied") : t("copyAndClose") }}
        </button>
      </div>
    </div>
  </div>
</template>
