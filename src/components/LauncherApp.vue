<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  api, filterPrompts,
  type Organization, type Prompt, type ParsedVar, type Settings,
} from "../lib/api";
import { emptyOrganization, sortLauncher } from "../lib/organization";
import { t, translateApiError } from "../lib/i18n";
import {
  DEFAULT_KEY_BINDINGS, formatKeybinding, matchesKeybinding, type KeyBindings,
} from "../lib/keybindings";
import { launcherBackAction, type LauncherStage } from "../lib/launcher-navigation";
import { SnippetSession } from "../lib/optional-snippets";
import VariableField from "./VariableField.vue";
import TemplateDiagnostics from "./TemplateDiagnostics.vue";
import { confirmDialog, openLauncherBackDialog } from "../lib/confirm-dialog";
import ConfirmLeaveDialog from "./ConfirmLeaveDialog.vue";
import { renderPreviewMarkdown } from "../lib/markdown-preview";
import { MutationQueue } from "../lib/mutation-queue";
import { LAUNCHER_PREVIEW_PREF_KEY, LauncherPreviewPreference } from "../lib/launcher-preview-preference";

const stage = ref<LauncherStage>("search");
const query = ref("");
const prompts = ref<Prompt[]>([]);
const organization = ref<Organization>(emptyOrganization());
const selectedId = ref<string | null>(null);
const selIndex = ref(0);
const searchList = ref<HTMLElement | null>(null);
let searchScrollTop = 0;
const snippetSession = ref<SnippetSession | null>(null);
const varValues = computed(() => snippetSession.value?.values ?? {});
const expandedSnippets = ref<Record<string, boolean>>({});
const resultText = ref("");
let generatedText = "";
let returning = false;
const previewOpen = ref(false);
const previewHtml = computed(() => renderPreviewMarkdown(resultText.value));
const previewPreference = new LauncherPreviewPreference({
  read: () => api.getUiPrefs(LAUNCHER_PREVIEW_PREF_KEY),
  write: value => api.setUiPrefs(LAUNCHER_PREVIEW_PREF_KEY, value),
});
const resizeWrites = new MutationQueue();
const quitting = ref(false);
const variablesViewport = ref<HTMLElement | null>(null);
const textVariableHeight = ref(80);
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
let unlistenQuit: (() => void) | undefined;
let blurHideTimer: number | undefined;
let blurGeneration = 0;
let disposed = false;

async function listenLauncherEvent(name: string, handler: (event: any) => void) {
  const unlisten = await (window as any).__TAURI__.event.listen(name, handler);
  if (disposed) { unlisten(); return undefined; }
  return unlisten as () => void;
}

// 置顶优先、非置顶按最近使用；搜索只过滤结果，不改变排序规则（PRD 4.5）
const filtered = computed(() =>
  filterPrompts(sortLauncher(prompts.value, organization.value.pinnedOrder), query.value)
);
const selected = computed(() => prompts.value.find((p) => p.id === selectedId.value) ?? null);
const vars = computed(() => snippetSession.value?.variables ?? []);
const variableEntries = computed(() => snippetSession.value?.entries ?? []);
const templateErrors = computed(() => snippetSession.value?.diagnostics ?? []);
const canGenerate = computed(() => templateErrors.value.length === 0);
// Use the same rendering path as Generate so the preview never changes filling,
// snippet ordering, cached values, or the return-confirmation baseline.
const livePreviewText = computed(() => canGenerate.value ? snippetSession.value?.render() ?? "" : "");
const livePreviewHtml = computed(() => renderPreviewMarkdown(livePreviewText.value));

watch([variablesViewport, vars, expandedSnippets], ([viewport], _previous, onCleanup) => {
  if (!viewport) return;
  const fields = viewport.querySelector<HTMLElement>("[data-launcher-fields]");
  if (!fields) return;
  const fixed = [...fields.querySelectorAll<HTMLElement>("[data-variable-label], [data-variable-options], [data-snippet-heading], [data-snippet-preview]")];
  const updateHeight = () => {
    const count = vars.value.filter(v => v.type === "text").length;
    if (!count) return;
    const textHeight = [...fields.querySelectorAll<HTMLTextAreaElement>("textarea")]
      .reduce((total, element) => total + element.getBoundingClientRect().height, 0);
    const fixedHeight = fields.getBoundingClientRect().height - textHeight;
    textVariableHeight.value = Math.max(80, (viewport.clientHeight - fixedHeight) / count);
  };
  const observer = new ResizeObserver(updateHeight);
  observer.observe(viewport);
  fixed.forEach(element => observer.observe(element));
  updateHeight();
  onCleanup(() => observer.disconnect());
}, { flush: "post", deep: true });

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
    const library = await api.loadLibrary();
    prompts.value = library.prompts;
    organization.value = library.organization;
  } catch (error) {
    prompts.value = [];
    organization.value = emptyOrganization();
    loadError.value = t("promptLoadFailed", { error: translateApiError(error) });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  // Register synchronously so unmount can always remove these listeners, even
  // when HMR interrupts one of the asynchronous startup requests below.
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", cancelPendingHide);
  window.addEventListener("resize", cancelPendingHide);
  reset();
  try {
    unlistenMainShown = await listenLauncherEvent("main-shown", refreshLauncher);
    if (disposed) return;
    unlistenQuit = await listenLauncherEvent("launcher-quit-requested", handleLauncherQuit);
    if (disposed) return;
    await api.setLauncherGuardReady(true);
  } catch (error) {
    if (!loadError.value) {
      loadError.value = t("promptLoadFailed", { error: translateApiError(error) });
    }
  }
  if (disposed) return;
  await refreshLauncher();
  if (disposed) return;
  try {
    const settings = await api.getSettings();
    if (disposed) return;
    applyBindings(settings);
    unlistenSettings = await listenLauncherEvent(
      "settings-changed",
      (event: { payload: Settings }) => applyBindings(event.payload)
    );
  } catch {
    // 键位读取失败时保留默认键位，不影响启动器使用
  }
});

onUnmounted(() => {
  disposed = true;
  unlistenMainShown?.();
  unlistenSettings?.();
  unlistenQuit?.();
  void api.setLauncherGuardReady(false).catch(() => undefined);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("focus", cancelPendingHide);
  window.removeEventListener("resize", cancelPendingHide);
  cancelPendingHide();
  window.removeEventListener("keydown", onKeydown);
});

async function refreshLauncher() {
  reset();
  loading.value = true;
  try {
    previewOpen.value = await previewPreference.restore();
  } catch {
    // Retry on every invocation rather than keeping a failed startup default forever.
    errorMessage.value = t("previewRestoreFailed");
  }
  await reload();
}

async function handleLauncherQuit() {
  if (quitting.value) return;
  quitting.value = true;
  try {
    await previewPreference.flush();
    await api.resolveLauncherQuit(true);
  } catch {
    errorMessage.value = t("previewSaveFailed");
    quitting.value = false;
    await api.resolveLauncherQuit(false).catch(() => undefined);
  }
}

function applyBindings(settings: Settings) {
  bindings.value = {
    advance: settings.advanceKey,
    newline: settings.newlineKey,
    back: settings.backKey,
  };
}

function handleWindowBlur() {
  if (stage.value !== "search") return;
  cancelPendingHide();
  const generation = blurGeneration;
  // Native move/resize briefly blurs the WebView on Windows. Hide only if focus stays away.
  blurHideTimer = window.setTimeout(async () => {
    blurHideTimer = undefined;
    if (stage.value !== "search" || document.hasFocus()) return;
    try {
      if (await getCurrentWindow().isFocused()) return;
    } catch {
      return;
    }
    if (generation === blurGeneration && stage.value === "search" && !document.hasFocus()) {
      void api.hideMain();
    }
  }, 150);
}

function cancelPendingHide() {
  window.clearTimeout(blurHideTimer);
  blurHideTimer = undefined;
  blurGeneration += 1;
}

function startLauncherDrag(event: MouseEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  void getCurrentWindow().startDragging().catch(() => undefined);
}

function showSearch() {
  stage.value = "search";
  selectedId.value = null;
  snippetSession.value = null;
  expandedSnippets.value = {};
  copied.value = false;
  copying.value = false;
  errorMessage.value = "";
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLInputElement>("#launcher-input")?.focus({ preventScroll: true });
    if (searchList.value) searchList.value.scrollTop = searchScrollTop;
  });
}

function reset() {
  query.value = "";
  selIndex.value = 0;
  searchScrollTop = 0;
  resultText.value = "";
  generatedText = "";
  showSearch();
}

function choose(p: Prompt) {
  searchScrollTop = searchList.value?.scrollTop ?? 0;
  selectedId.value = p.id;
  snippetSession.value = new SnippetSession(p.body);
  expandedSnippets.value = {};
  const active: Record<string, number> = Object.create(null);
  for (const v of vars.value) {
    if (v.type === "multi") active[v.name] = 0;
  }
  activeOption.value = active;
  stage.value = "variables";
  errorMessage.value = "";
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLElement>(".variable-input")?.focus();
  });
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
  if (!canGenerate.value || !snippetSession.value) {
    errorMessage.value = t("templateFixBeforeGenerate");
    return;
  }
  resultText.value = snippetSession.value.render();
  generatedText = resultText.value;
  stage.value = "result";
  errorMessage.value = "";
  focusedVar.value = null;
  keyboardNav.value = false;
  void nextTick(() => {
    document.querySelector<HTMLTextAreaElement>("#result-input")?.focus();
  });
}

function snippetKey(group: string, option: string) {
  return JSON.stringify([group, option]);
}

function snippetFields(group: string, option: string) {
  return vars.value.filter(v => v.owner?.group === group && v.owner.option === option);
}

function snippetOrder(group: string): string {
  const session = snippetSession.value;
  const options = session?.template.groups.find(g => g.name === group)?.options ?? [];
  return (session?.selections[group] ?? []).map(id => options.find(o => o.id === id)?.title ?? "").join(" → ");
}

function onSnippetKeydown(event: KeyboardEvent) {
  if (event.isComposing || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const target = event.target as HTMLElement;
  if (!target.matches("[data-snippet-toggle]")) return;
  const options = [...target.closest("[data-snippet-group]")!.querySelectorAll<HTMLInputElement>("[data-snippet-toggle]")];
  const index = options.indexOf(target as HTMLInputElement);
  const next = Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
  event.preventDefault();
  options[next]?.focus();
}

function togglePreview() {
  if (quitting.value) return;
  previewOpen.value = !previewOpen.value;
  void previewPreference.save(previewOpen.value).catch(() => {
    errorMessage.value = t("previewSaveFailed");
  });
}

function onPreviewClick(event: MouseEvent) {
  if ((event.target as Element).closest("a")) event.preventDefault();
}

watch([stage, previewOpen], ([currentStage, open]) => {
  const expanded = currentStage !== "search" && open;
  void resizeWrites.run(() => api.setLauncherPreview(expanded)).catch(() => {
    if (stage.value !== "search") errorMessage.value = t("previewResizeFailed");
  });
});

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

async function requestBack() {
  if (returning || confirmDialog.open || copying.value) return;
  returning = true;
  try {
    const from = stage.value;
    const changed = from === "variables"
      ? snippetSession.value?.dirty ?? false
      : from === "result" && resultText.value !== generatedText;
    if (changed && await openLauncherBackDialog() !== "discard") return;
    if (stage.value !== from) return;
    const action = launcherBackAction(from);
    if (action === "hide") await api.hideMain();
    else if (action === "show-search") {
      resultText.value = "";
      generatedText = "";
      showSearch();
    } else {
      resultText.value = generatedText;
      stage.value = "variables";
      void nextTick(() => document.querySelector<HTMLElement>(".variable-input")?.focus());
    }
  } finally {
    returning = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  if (confirmDialog.open || returning || quitting.value) return;
  if (e.isComposing) return;
  if (e.key === "Tab") keyboardNav.value = true;
  const target = e.target as HTMLElement | null;
  const inTextField =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "checkbox");
  // 焦点在文本输入框内且按下的是可输入字符时，让输入正常进行，不触发阶段级快捷键
  if (inTextField && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;

  if (matchesKeybinding(e, bindings.value.back)) {
    e.preventDefault();
    void requestBack();
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
  <div data-launcher-shell class="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800">
    <div
      data-launcher-drag
      class="flex h-5 shrink-0 cursor-move items-center justify-center border-b border-neutral-100 dark:border-neutral-700/70"
      :title="t('dragWindow')"
      @mousedown="startLauncherDrag"
    >
      <span class="h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
    </div>
    <p v-if="errorMessage" role="alert" class="shrink-0 px-4 pt-2 text-xs text-red-500">{{ errorMessage }}</p>
    <!-- 搜索阶段 -->
    <div v-if="stage === 'search'" class="flex min-h-0 flex-1 flex-col">
      <div data-launcher-searchbar class="border-b border-neutral-200 p-3 dark:border-neutral-700">
        <input
          id="launcher-input"
          v-model="query"
          autocomplete="off"
          :placeholder="t('launcherSearchPlaceholder')"
          class="w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
          autofocus
        />
      </div>
      <div ref="searchList" data-launcher-list class="flex-1 overflow-y-auto p-1">
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
            data-launcher-item
            :data-active="i === selIndex ? 'true' : 'false'"
            tabindex="-1"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
            :class="i === selIndex ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
            @mouseenter="selIndex = i"
            @click="choose(p)"
          >
            <span class="flex items-center gap-2 truncate">
              <span v-if="p.pinned" :aria-label="t('pinned')" :title="t('pinned')">📌</span>
              <span v-if="p.favorite" :aria-label="t('favorited')" :title="t('favorited')">⭐</span>
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
      <div data-launcher-hint class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ searchKeyHint }}
      </div>
    </div>

    <!-- 变量填写阶段 -->
    <div v-else-if="stage === 'variables'" class="flex min-h-0 flex-1 flex-col">
      <div data-launcher-content class="flex min-h-0 flex-1 flex-col p-4">
        <div class="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="break-words text-sm font-semibold">{{ selected?.title }}</h2>
            <span class="text-xs text-neutral-400">{{ t("variableCount", { count: vars.length }) }}</span>
          </div>
          <button
            type="button" data-preview-toggle :disabled="quitting" :aria-pressed="previewOpen"
            :aria-label="previewOpen ? t('closePreview') : t('openPreview')"
            class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/30"
            @click="togglePreview" @keydown.enter.stop @keydown.space.stop
          >{{ previewOpen ? t('closePreview') : t('openPreview') }}</button>
        </div>
        <TemplateDiagnostics :diagnostics="templateErrors" class="mb-3 max-h-32 shrink-0 overflow-y-auto" />
        <div data-variable-workspace class="variable-workspace flex min-h-0 flex-1 gap-3" :class="{ 'has-preview': previewOpen }">
        <div ref="variablesViewport" data-launcher-variables class="min-h-0 min-w-0 flex-1 overflow-y-auto" :style="{ '--launcher-text-height': `${textVariableHeight}px` }">
          <div v-if="variableEntries.length === 0 && canGenerate" class="text-sm text-neutral-400">{{ t("noVariables") }}</div>
          <div data-launcher-fields class="flex flex-col gap-3">
            <template v-for="entry in variableEntries" :key="entry.kind === 'variable' ? `v:${entry.variable.name}` : `g:${entry.group.name}`">
              <VariableField
                v-if="entry.kind === 'variable'"
                v-model="varValues[entry.variable.name]" :variable="entry.variable"
                :active-option="activeOption[entry.variable.name] ?? 0"
                :focused="focusedVar === entry.variable.name" :keyboard-nav="keyboardNav"
                @navigate="onOptionKeydown(entry.variable, $event)"
                @focus="focusedVar = entry.variable.name" @blur="focusedVar = null"
              />
              <section
                v-else data-snippet-group :aria-label="entry.group.name"
                class="shrink-0 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/20" @keydown="onSnippetKeydown"
              >
                <div data-snippet-heading class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h3 data-variable-label class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{{ entry.group.name }}</h3>
                  <span class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ t('snippetSelectedCount', { selected: snippetSession?.selections[entry.group.name]?.length ?? 0, total: entry.group.options.length }) }}</span>
                </div>
                <div
                  v-for="option in entry.group.options" :key="option.id" :data-snippet-option="option.id"
                  class="rounded-md border p-2.5 transition-colors"
                  :class="snippetSession?.isSelected(entry.group.name, option.id)
                    ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20'
                    : 'border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-800'"
                >
                  <div data-snippet-heading class="flex items-start justify-between gap-2">
                    <label class="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                      <input
                        data-snippet-toggle type="checkbox" class="variable-input mt-1 accent-blue-500"
                        :checked="snippetSession?.isSelected(entry.group.name, option.id)"
                        @change="snippetSession?.toggle(entry.group.name, option.id)"
                      />
                      <span class="break-words">{{ option.title }}</span>
                    </label>
                    <button
                      type="button" data-snippet-expand
                      :aria-expanded="!!expandedSnippets[snippetKey(entry.group.name, option.id)]"
                      :aria-controls="`snippet-preview-${entry.group.line}-${option.id}`"
                      class="shrink-0 rounded px-1 text-xs text-neutral-500 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-400 dark:hover:text-blue-300"
                      @keydown.enter.stop @keydown.space.stop
                      @click="expandedSnippets[snippetKey(entry.group.name, option.id)] = !expandedSnippets[snippetKey(entry.group.name, option.id)]"
                    >{{ t(expandedSnippets[snippetKey(entry.group.name, option.id)] ? 'snippetCollapse' : 'snippetExpand') }}</button>
                  </div>
                  <pre
                    v-if="expandedSnippets[snippetKey(entry.group.name, option.id)]"
                    :id="`snippet-preview-${entry.group.line}-${option.id}`" data-snippet-preview
                    class="mt-2 whitespace-pre-wrap rounded bg-neutral-100 p-2 font-mono text-xs leading-relaxed text-neutral-600 [overflow-wrap:anywhere] dark:bg-neutral-800 dark:text-neutral-300"
                  >{{ option.body }}</pre>
                  <div v-if="snippetSession?.isSelected(entry.group.name, option.id) && snippetFields(entry.group.name, option.id).length" data-snippet-fields class="ml-1 mt-3 flex flex-col gap-3 border-l-2 border-blue-200 pl-3 dark:border-blue-900">
                    <VariableField
                      v-for="v in snippetFields(entry.group.name, option.id)" :key="v.name"
                      v-model="varValues[v.name]" :variable="v"
                      :active-option="activeOption[v.name] ?? 0" :focused="focusedVar === v.name" :keyboard-nav="keyboardNav"
                      @navigate="onOptionKeydown(v, $event)" @focus="focusedVar = v.name" @blur="focusedVar = null"
                    />
                  </div>
                </div>
                <p v-if="snippetSession?.selections[entry.group.name]?.length" data-snippet-heading class="text-xs text-neutral-500 [overflow-wrap:anywhere]">{{ t('snippetSelectionOrder', { titles: snippetOrder(entry.group.name) }) }}</p>
              </section>
            </template>
          </div>
        </div>
        <aside v-if="previewOpen" data-variable-preview class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/60 dark:border-neutral-600 dark:bg-neutral-800" :aria-label="t('livePreview')">
          <div class="shrink-0 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
            <h3 class="text-xs font-medium text-neutral-600 dark:text-neutral-300">{{ t('livePreview') }}</h3>
            <p class="mt-0.5 text-[11px] text-neutral-400">{{ t('previewUpdatesLive') }}</p>
          </div>
          <p v-if="!canGenerate" class="overflow-auto px-4 py-3 text-xs text-neutral-500">{{ t('templateFixBeforeGenerate') }}</p>
          <p v-else-if="!livePreviewText" class="px-4 py-3 text-xs text-neutral-400">{{ t('previewEmpty') }}</p>
          <div v-else data-markdown-preview class="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm" v-html="livePreviewHtml" @click="onPreviewClick" />
        </aside>
        </div>
        <div data-launcher-variable-actions class="flex shrink-0 justify-end gap-2 pt-3">
          <button tabindex="-1" :title="formatKeybinding(bindings.back)" class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="requestBack">{{ t("back") }}</button>
          <button tabindex="-1" :disabled="!canGenerate" class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50" @click="generate">{{ t("generatePrompt") }}</button>
        </div>
      </div>
      <div data-launcher-hint class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ variablesKeyHint }}
      </div>
    </div>

    <!-- 结果编辑阶段 -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div data-launcher-content class="flex min-h-0 flex-1 flex-col p-4">
        <div class="mb-2 flex shrink-0 items-center justify-between gap-3">
          <span class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t("resultSource") }}</span>
          <button
            type="button"
            data-preview-toggle
            :disabled="quitting"
            :aria-pressed="previewOpen"
            :aria-label="previewOpen ? t('closePreview') : t('openPreview')"
            class="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/30"
            @click="togglePreview"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <span aria-hidden="true" class="mr-1">{{ previewOpen ? "≪" : "≫" }}</span>
            {{ previewOpen ? t("closePreview") : t("openPreview") }}
          </button>
        </div>
        <div class="flex min-h-0 flex-1 gap-3">
          <textarea
            id="result-input"
            v-model="resultText"
            :aria-label="t('resultSource')"
            class="min-h-0 min-w-0 flex-1 resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
          />
          <aside
            v-if="previewOpen"
            class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-300 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800"
            :aria-label="t('resultPreview')"
          >
            <div class="shrink-0 border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              {{ t("resultPreview") }}
            </div>
            <div data-markdown-preview class="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm" v-html="previewHtml" @click="onPreviewClick" />
          </aside>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button tabindex="-1" :title="formatKeybinding(bindings.back)" class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="requestBack">{{ t("back") }}</button>
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
      <div data-launcher-hint class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        {{ resultKeyHint }}
      </div>
    </div>
    <ConfirmLeaveDialog />
  </div>
</template>

<style scoped>
[data-launcher-shell] { container-type: inline-size; }
@container (max-width: 859px) {
  .variable-workspace.has-preview { flex-direction: column; }
  .variable-workspace > [data-variable-preview] { flex: 0 0 40%; min-height: 96px; }
}
@media (max-height: 399px) {
  @container (max-width: 859px) {
    /* At the minimum native window height, let the two sections scroll together
       instead of shrinking the form to less than a single usable input. */
    .variable-workspace.has-preview { display: block; overflow-y: auto; }
    .variable-workspace.has-preview > [data-launcher-variables] {
      overflow: visible;
      --launcher-text-height: 80px !important;
    }
    .variable-workspace > [data-variable-preview] { height: 200px; margin-top: 12px; }
  }
}
</style>
