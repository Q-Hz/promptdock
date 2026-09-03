<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  api, filterPrompts, parseVariables, sortPrompts,
  type ImportDecision, type ImportPrecheck, type ImportResult, type Prompt,
} from "../lib/api";
import { t, translateApiError } from "../lib/i18n";
import { isDirty as computeDirty, snapshotFromPrompt, type EditorSnapshot } from "../lib/unsaved";
import { openDiscardDialog, openUnsavedDialog } from "../lib/confirm-dialog";
import SettingsModal from "./SettingsModal.vue";
import ConfirmLeaveDialog from "./ConfirmLeaveDialog.vue";
import ImportComparePage from "./import/ImportComparePage.vue";
import { selectedIdAfterImport } from "../lib/import-selection";

const prompts = ref<Prompt[]>([]);
const query = ref("");
const selectedId = ref<string | null>(null);
const showSettings = ref(false);

const editing = ref<Prompt>(emptyPrompt());
const editorShowVarHint = computed(() => parseVariables(editing.value.body));

const importSession = ref<ImportPrecheck | null>(null);
const importing = ref(false);
const comparePage = ref<InstanceType<typeof ImportComparePage> | null>(null);

function emptyPrompt(): Prompt {
  const now = Date.now();
  return {
    id: "", title: "", body: "", tags: [], folder: "", favorite: false,
    useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now,
  };
}

// ---- 未保存保护（PRD 9）----

const baseline = ref<EditorSnapshot>(snapshotFromPrompt(emptyPrompt()));
const baselinePrompt = ref<Prompt>(emptyPrompt());
const titleError = ref(false);

const editorSnapshot = computed<EditorSnapshot>(() => ({
  title: editing.value.title,
  body: editing.value.body,
  tags: editing.value.tags,
  folder: editing.value.folder,
  favorite: editing.value.favorite,
}));

const isDirty = computed<boolean>(() => computeDirty(editorSnapshot.value, baseline.value));

let guarding = false;

async function performSave(): Promise<boolean> {
  if (!editing.value.title.trim()) {
    titleError.value = true;
    return false;
  }
  try {
    const saved = await api.savePrompt(editing.value);
    await reload();
    editing.value = JSON.parse(JSON.stringify(saved));
    selectedId.value = saved.id;
    baseline.value = snapshotFromPrompt(saved);
    baselinePrompt.value = JSON.parse(JSON.stringify(saved));
    titleError.value = false;
    return true;
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
    return false;
  }
}

// 拦截会替换或销毁编辑状态的操作：保存并继续 / 放弃修改 / 取消（PRD 9.5）
async function guardUnsaved(action: () => unknown | Promise<unknown>): Promise<boolean> {
  if (guarding || importing.value) return false;
  if (!isDirty.value) {
    await action();
    return true;
  }
  guarding = true;
  const lastFocused = document.activeElement as HTMLElement | null;
  try {
    const choice = await openUnsavedDialog();
    if (choice === "cancel") {
      lastFocused?.focus();
      return false;
    }
    if (choice === "save") {
      const ok = await performSave();
      if (!ok) {
        // 保存失败或标题为空：停留在当前编辑页（PRD 9.5A / 9.6）
        lastFocused?.focus();
        return false;
      }
    } else {
      discardEditorChanges();
    }
    await action();
    return true;
  } finally {
    guarding = false;
  }
}

function applyEditor(p: Prompt) {
  editing.value = JSON.parse(JSON.stringify(p));
  baseline.value = snapshotFromPrompt(p);
  baselinePrompt.value = JSON.parse(JSON.stringify(p));
  titleError.value = false;
}

function discardEditorChanges() {
  editing.value = JSON.parse(JSON.stringify(baselinePrompt.value));
  baseline.value = snapshotFromPrompt(baselinePrompt.value);
  titleError.value = false;
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

const unlistenFns: Array<() => void> = [];
let allowNextUnload = false;

onMounted(async () => {
  const events = (window as any).__TAURI__.event;
  if (events) {
    unlistenFns.push(
      await events.listen("manager-close-requested", () => {
        void handleCloseRequest();
      })
    );
    unlistenFns.push(
      await events.listen("tray-quit-requested", () => {
        void handleQuitRequest();
      })
    );
  }
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("keydown", handleWindowKeydown);
  await api.setManagerGuardReady(true);
  await reload();
  if (prompts.value.length > 0) {
    const first = sortPrompts(prompts.value)[0];
    selectedId.value = first.id;
    applyEditor(first);
  }
});

onUnmounted(() => {
  for (const unlisten of unlistenFns) unlisten();
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("keydown", handleWindowKeydown);
  void api.setManagerGuardReady(false);
});

async function reload() {
  prompts.value = await api.listPrompts();
}

function select(p: Prompt) {
  // 点击当前已选中的同一条 Prompt 不触发保护（PRD 9.4）
  if (p.id === selectedId.value) return;
  void guardUnsaved(() => {
    selectedId.value = p.id;
    applyEditor(p);
  });
}

function newPrompt() {
  void guardUnsaved(() => {
    selectedId.value = null;
    applyEditor(emptyPrompt());
  });
}

function save() {
  void performSave();
}

function remove() {
  if (!selectedId.value) return;
  void guardUnsaved(async () => {
    if (!confirm(t("deleteConfirm", { title: editing.value.title }))) return;
    try {
      await api.deletePrompt(selectedId.value!);
      await reload();
      applyEditor(emptyPrompt());
      selectedId.value = null;
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
  });
}

async function toggleFavorite() {
  editing.value.favorite = !editing.value.favorite;
  if (editing.value.id) {
    try {
      const saved = await api.savePrompt(editing.value);
      await reload();
      editing.value = JSON.parse(JSON.stringify(saved));
      baseline.value = snapshotFromPrompt(saved);
      baselinePrompt.value = JSON.parse(JSON.stringify(saved));
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
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

// ---- 导入流程（PRD 6–8）----

// 导入前先处理未保存状态（PRD 9.8）
async function doImport() {
  const ok = await guardUnsaved(async () => {});
  if (!ok) return;
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
  if (replace) {
    const confirmed = await ask(t("importReplaceConfirmMessage"), {
      title: t("importConfirmTitle"),
      kind: "warning",
      okLabel: t("replace"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      const count = await api.importPrompts(path as string, true);
      await reload();
      await resyncEditor();
      alert(t("importSuccess", { count }));
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
    return;
  }
  await startAppendImport(path as string);
}

// 导入后按最新数据库版本刷新编辑区（PRD 8.3.6）
async function resyncEditor() {
  const current = prompts.value.find((p) => p.id === selectedId.value);
  if (current) {
    selectedId.value = current.id;
    applyEditor(current);
  } else {
    selectedId.value = null;
    applyEditor(emptyPrompt());
  }
}

async function startAppendImport(path: string) {
  let precheck: ImportPrecheck;
  try {
    precheck = await api.precheckImport(path);
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
    return;
  }
  if (precheck.conflictCount === 0) {
    // 无需比较：点击“追加”即构成提交确认（PRD 6.6）
    await commitAppend(precheck, []);
    return;
  }
  importSession.value = precheck;
}

async function commitAppend(precheck: ImportPrecheck, decisions: ImportDecision[]) {
  if (importing.value) return;
  importing.value = true;
  try {
    // A stale plan may become conflict-free. Ask explicitly before retrying;
    // never restore the removed summary step or submit a refreshed plan silently.
    let result: ImportResult;
    while (true) {
      try {
        result = await api.commitImport(precheck, decisions);
        break;
      } catch (error) {
        if (String(error) !== "import.stale_plan") throw error;
        importSession.value = null;
        alert(t("importStalePlan"));
        const fresh = await api.precheckImportSnapshot(precheck.items.map((item) => item.imported));
        if (fresh.conflictCount > 0) {
          importSession.value = fresh;
          return;
        }
        const confirmed = await (window as any).__TAURI__.dialog.ask(t("importRecheckConfirm"), {
          title: t("importConfirmTitle"),
          kind: "info",
          okLabel: t("confirmImport"),
          cancelLabel: t("cancel"),
        });
        if (!confirmed) return;
        precheck = fresh;
        decisions = [];
      }
    }
    selectedId.value = selectedIdAfterImport(selectedId.value, decisions);
    importSession.value = null;
    await reload();
    await resyncEditor();
    alert(t("importDone", {
      inserted: result.inserted,
      updated: result.updated,
      asNew: result.insertedAsNew,
      skipped: result.skipped,
    }));
  } catch (error) {
    alert(t("operationFailed", { error: translateApiError(error) }));
  } finally {
    importing.value = false;
  }
}

function onImportConfirm(decisions: ImportDecision[]) {
  const session = importSession.value;
  if (session) void commitAppend(session, decisions);
}

// ---- 窗口关闭 / 托盘退出握手（PRD 9.7）----

async function resolveLeave(): Promise<boolean> {
  // A commit cannot be cancelled once dispatched; wait until it settles.
  if (importing.value) return false;
  const lastFocused = document.activeElement as HTMLElement | null;
  // 比较页激活时，关闭窗口执行取消导入语义（PRD 9.7 末段）
  if (importSession.value) {
    if (comparePage.value?.hasAnyProgress()) {
      const choice = await openDiscardDialog();
      if (choice !== "discard") {
        lastFocused?.focus();
        return false;
      }
    }
    importSession.value = null;
    return true;
  }
  if (isDirty.value) {
    const choice = await openUnsavedDialog();
    if (choice === "cancel") {
      lastFocused?.focus();
      return false;
    }
    if (choice === "save") {
      const saved = await performSave();
      if (!saved) lastFocused?.focus();
      return saved;
    }
    discardEditorChanges();
    return true;
  }
  return true;
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!allowNextUnload && (isDirty.value || importSession.value || importing.value)) {
    event.preventDefault();
    event.returnValue = "";
  }
}

async function handleWindowKeydown(event: KeyboardEvent) {
  const reloadShortcut = event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
  if (!reloadShortcut) return;
  event.preventDefault();
  if (await resolveLeave()) {
    await api.setManagerGuardReady(false);
    allowNextUnload = true;
    window.location.reload();
  }
}

async function handleCloseRequest() {
  const allow = await resolveLeave();
  try {
    await api.resolveClose(allow);
  } catch {
    // 窗口生命周期变化后握手可能已结束，无需额外处理
  }
}

async function handleQuitRequest() {
  const allow = await resolveLeave();
  try {
    await api.resolveQuit(allow);
  } catch {
    // 应用生命周期变化后握手可能已结束，无需额外处理
  }
}
</script>

<template>
  <div class="flex h-full flex-col" :aria-busy="importing" :inert="importing && !importSession ? true : undefined">
    <!-- 导入冲突在本页处理并直接确认，不再经过摘要页。 -->
    <template v-if="importSession">
      <ImportComparePage
        ref="comparePage"
        :precheck="importSession"
        :busy="importing"
        @confirm="onImportConfirm"
        @cancel="importSession = null"
      />
    </template>

    <template v-else>
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
              class="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm font-medium outline-none focus:border-blue-400"
              :class="titleError ? 'border-red-400' : 'border-neutral-300 dark:border-neutral-600'"
              @input="titleError = false"
            >
            <span
              v-if="isDirty"
              class="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              role="status"
            >{{ t("unsavedIndicator") }}</span>
            <button
              class="rounded-md border px-3 py-2 text-sm"
              :class="editing.favorite ? 'border-yellow-400 bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30' : 'border-neutral-300 dark:border-neutral-600'"
              @click="toggleFavorite"
            >⭐ {{ editing.favorite ? t("favorited") : t("favorite") }}</button>
          </div>
          <p v-if="titleError" class="text-xs text-red-500">{{ t("titleRequired") }}</p>
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
            >{{ v.name }}<template v-if="v.type === 'multi'"> ({{ t("multiValueHint") }})</template><template v-else-if="v.type === 'select'"> ({{ t("selectValueHint") }})</template><template v-else-if="v.default"> ({{ t("defaultValueHint", { value: v.default }) }})</template></span>
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
    </template>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <ConfirmLeaveDialog />
  </div>
</template>
