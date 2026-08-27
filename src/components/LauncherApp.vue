<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  api, filterPrompts, parseVariables, renderBody, sortPrompts,
  type Prompt, type ParsedVar, type Settings,
} from "../lib/api";
import { t, translateApiError } from "../lib/i18n";
import {
  DEFAULT_KEY_BINDINGS, formatKeybinding, matchesKeybinding, type KeyBindings,
} from "../lib/keybindings";

type Stage = "search" | "variables" | "result";

const stage = ref<Stage>("search");
const query = ref("");
const prompts = ref<Prompt[]>([]);
const selectedId = ref<string | null>(null);
const selIndex = ref(0);
const varValues = ref<Record<string, string | string[]>>({});
const resultText = ref("");
const copied = ref(false);
const copying = ref(false);
const errorMessage = ref("");
const loading = ref(true);
const loadError = ref("");
const bindings = ref<KeyBindings>({ ...DEFAULT_KEY_BINDINGS });
const activeOption = ref<Record<string, number>>({});
const focusedVar = ref<string | null>(null);
const keyboardNav = ref(false);
let unlistenMainShown: (() => void) | undefined;
let unlistenSettings: (() => void) | undefined;

const filtered = computed(() => filterPrompts(sortPrompts(prompts.value), query.value));
const selected = computed(() => prompts.value.find((p) => p.id === selectedId.value) ?? null);
const vars = computed(() => (selected.value ? parseVariables(selected.value.body) : []));

const searchKeyHint = computed(() =>
  t("launcherKeyHint", {
    advance: formatKeybinding(bindings.value.advance),
    back: formatKeybinding(bindings.value.back),
  })
);
const variablesKeyHint = computed(() =>
  t("variablesKeyHint", {
    advance: formatKeybinding(bindings.value.advance),
    newline: formatKeybinding(bindings.value.newline),
    back: formatKeybinding(bindings.value.back),
  })
);
const resultKeyHint = computed(() =>
  t("resultKeyHint", {
    advance: formatKeybinding(bindings.value.advance),
    newline: formatKeybinding(bindings.value.newline),
    back: formatKeybinding(bindings.value.back),
  })
);

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
  try {
    applyBindings(await api.getSettings());
    unlistenSettings = await (window as any).__TAURI__.event.listen(
      "settings-changed",
      (event: { payload: Settings }) => applyBindings(event.payload)
    );
  } catch {
    // 键位读取失败时保留默认键位，不影响启动器使用
  }
  window.addEventListener("blur", handleWindowBlur);
});

onUnmounted(() => {
  unlistenMainShown?.();
  unlistenSettings?.();
  window.removeEventListener("blur", handleWindowBlur);
});

function applyBindings(settings: Settings) {
  bindings.value = {
    advance: settings.advanceKey,
    newline: settings.newlineKey,
    back: settings.backKey,
  };
}

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
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLInputElement>("#launcher-input")?.focus();
  });
}

function choose(p: Prompt) {
  selectedId.value = p.id;
  const values: Record<string, string | string[]> = {};
  const active: Record<string, number> = {};
  for (const v of parseVariables(p.body)) {
    values[v.name] = v.type === "multi" ? [] : v.default;
    if (v.type === "multi") active[v.name] = 0;
  }
  varValues.value = values;
  activeOption.value = active;
  stage.value = "variables";
  errorMessage.value = "";
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLElement>(".variable-input")?.focus();
  });
}

function multiHas(name: string, option: string): boolean {
  const value = varValues.value[name];
  return Array.isArray(value) && value.includes(option);
}

function toggleMultiOption(name: string, option: string) {
  const current = Array.isArray(varValues.value[name]) ? (varValues.value[name] as string[]) : [];
  varValues.value[name] = current.includes(option)
    ? current.filter((o) => o !== option)
    : [...current, option];
}

function onOptionKeydown(v: ParsedVar, e: KeyboardEvent) {
  if (e.isComposing || v.options.length === 0) return;
  const clamp = (index: number) => Math.min(Math.max(index, 0), v.options.length - 1);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    keyboardNav.value = true;
    const delta = e.key === "ArrowDown" ? 1 : -1;
    if (v.type === "select") {
      const current = Math.max(0, v.options.indexOf(varValues.value[v.name] as string));
      varValues.value[v.name] = v.options[clamp(current + delta)];
    } else {
      activeOption.value[v.name] = clamp((activeOption.value[v.name] ?? 0) + delta);
    }
  } else if (e.key === " ") {
    e.preventDefault();
    keyboardNav.value = true;
    if (v.type === "select") {
      const current = Math.max(0, v.options.indexOf(varValues.value[v.name] as string));
      varValues.value[v.name] = v.options[current];
    } else {
      toggleMultiOption(v.name, v.options[activeOption.value[v.name] ?? 0]);
    }
  }
}

function generate() {
  if (!selected.value) return;
  resultText.value = renderBody(selected.value.body, varValues.value);
  stage.value = "result";
  errorMessage.value = "";
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLTextAreaElement>("#result-input")?.focus();
  });
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
  if (e.isComposing) return;
  if (e.key === "Tab") keyboardNav.value = true;
  const target = e.target as HTMLElement | null;
  const inTextField =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "checkbox");
  // 焦点在文本输入框内且按下的是可输入字符时，让输入正常进行，不触发阶段级快捷键
  if (inTextField && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;

  if (matchesKeybinding(e, bindings.value.back)) {
    if (stage.value === "search") api.hideMain();
    else if (stage.value === "variables") reset();
    else stage.value = "variables";
    return;
  }
  if (matchesKeybinding(e, bindings.value.advance)) {
    e.preventDefault();
    if (stage.value === "search") {
      const p = filtered.value[selIndex.value];
      if (p) choose(p);
    } else if (stage.value === "variables") {
      generate();
    } else {
      copyAndClose();
    }
    return;
  }
  if (stage.value === "search") {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selIndex.value = Math.min(selIndex.value + 1, filtered.value.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selIndex.value = Math.max(selIndex.value - 1, 0);
    }
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
            tabindex="-1"
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
        {{ searchKeyHint }}
      </div>
    </div>

    <!-- 变量填写阶段 -->
    <div v-else-if="stage === 'variables'" class="flex min-h-0 flex-1 flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">{{ selected?.title }}</h2>
          <span class="text-xs text-neutral-400">{{ t("variableCount", { count: vars.length }) }}</span>
        </div>
        <div v-if="vars.length === 0" class="text-sm text-neutral-400">{{ t("noVariables") }}</div>
        <div v-for="v in vars" :key="v.name" class="mb-3">
          <label class="mb-1 block text-xs font-medium text-neutral-500">{{ v.name }}</label>
          <div
            v-if="v.type === 'select'"
            class="variable-input flex flex-wrap gap-1.5 rounded-md outline-none"
            tabindex="0"
            role="listbox"
            @keydown="onOptionKeydown(v, $event)"
            @focus="focusedVar = v.name"
            @blur="focusedVar = null"
          >
            <button
              v-for="o in v.options"
              :key="o"
              type="button"
              role="option"
              tabindex="-1"
              :aria-selected="varValues[v.name] === o"
              class="rounded-md border px-2 py-1 text-sm transition-colors"
              :class="[
                varValues[v.name] === o
                  ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500',
                focusedVar === v.name && keyboardNav && varValues[v.name] === o ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
              ]"
              @click="varValues[v.name] = o"
            >{{ o }}</button>
          </div>
          <div
            v-else-if="v.type === 'multi'"
            class="variable-input flex flex-wrap gap-1.5 rounded-md p-0.5 outline-none"
            tabindex="0"
            role="group"
            @keydown="onOptionKeydown(v, $event)"
            @focus="focusedVar = v.name"
            @blur="focusedVar = null"
          >
            <label
              v-for="(o, i) in v.options"
              :key="o"
              class="flex cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors"
              :class="[
                multiHas(v.name, o)
                  ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500',
                focusedVar === v.name && keyboardNav && activeOption[v.name] === i ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
              ]"
            >
              <input
                type="checkbox"
                class="accent-blue-500"
                tabindex="-1"
                :checked="multiHas(v.name, o)"
                @change="toggleMultiOption(v.name, o)"
              />
              <span>{{ o }}</span>
            </label>
          </div>
          <textarea
            v-else
            v-model="varValues[v.name]"
            rows="2"
            class="variable-input w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button tabindex="-1" class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="reset">{{ t("back") }}</button>
          <button tabindex="-1" class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="generate">{{ t("generatePrompt") }}</button>
        </div>
      </div>
      <div class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ variablesKeyHint }}
      </div>
    </div>

    <!-- 结果编辑阶段 -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 flex-col p-4">
        <textarea
          id="result-input"
          v-model="resultText"
          class="flex-1 resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
        />
        <div class="mt-3 flex justify-end gap-2">
          <p v-if="errorMessage" class="mr-auto self-center text-xs text-red-500">{{ errorMessage }}</p>
          <button tabindex="-1" class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="stage = 'variables'">{{ t("back") }}</button>
          <button
            tabindex="-1"
            :disabled="copying"
            class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
            @click="copyAndClose"
          >
            {{ copying ? t("copying") : copied ? t("copied") : t("copyAndClose") }}
          </button>
        </div>
      </div>
      <div class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ resultKeyHint }}
      </div>
    </div>
  </div>
</template>
