<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  api, filterPrompts, parseVariables,
  type ImportDecision, type ImportPrecheck, type ImportResult, type Organization, type Prompt,
} from "../lib/api";
import {
  arrangeFolders, arrangePinned, BATCH_SIZE, emptyOrganization, nextBatch, orderMembers,
  PINNED_SECTION_KEY, reorder, reorderIndex, shift,
} from "../lib/organization";
import { LAYOUT_PREFS_KEY, defaultLayout, parseLayout, serializeLayout, type ManagerLayout } from "../lib/layout-prefs";
import { dragPayload, endDrag, type DropPosition, type DropTarget } from "../lib/drag-state";
import { t, translateApiError } from "../lib/i18n";
import { isDirty as computeDirty, snapshotFromPrompt, type EditorSnapshot } from "../lib/unsaved";
import { openDiscardDialog, openUnsavedDialog } from "../lib/confirm-dialog";
import SettingsModal from "./SettingsModal.vue";
import ConfirmLeaveDialog from "./ConfirmLeaveDialog.vue";
import ImportComparePage from "./import/ImportComparePage.vue";
import ResizableSplit from "./import/ResizableSplit.vue";
import FolderSection from "./manager/FolderSection.vue";
import { selectedIdAfterImport } from "../lib/import-selection";
import { MutationQueue } from "../lib/mutation-queue";

const prompts = ref<Prompt[]>([]);
const organization = ref<Organization>(emptyOrganization());
const query = ref("");
const selectedId = ref<string | null>(null);
const showSettings = ref(false);

const editing = ref<Prompt>(emptyPrompt());
const editorShowVarHint = computed(() => parseVariables(editing.value.body));

const importSession = ref<ImportPrecheck | null>(null);
const importing = ref(false);
const saving = ref(false);
const mutations = new MutationQueue();
const comparePage = ref<InstanceType<typeof ImportComparePage> | null>(null);

// 界面偏好跨重启保存；“本次已展示多少条”只在会话内保留（PRD 4.3/9）
const layout = ref<ManagerLayout>(defaultLayout());
const shownNormal = ref<Record<string, number>>({});
const shownSearch = ref<Record<string, number>>({});
const collapsedSearch = ref<Record<string, boolean>>({});
const navHeight = ref(0);
const navElement = ref<HTMLElement | null>(null);
let navObserver: ResizeObserver | undefined;
let layoutSaveTimer: number | undefined;
let layoutLoaded = false;
let savedLayout = "";
const layoutWrites = new MutationQueue();

function emptyPrompt(): Prompt {
  const now = Date.now();
  return {
    id: "", title: "", body: "", tags: [], folder: "", favorite: false, pinned: false,
    useCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now,
  };
}

// ---- 未保存保护（PRD 9 / 6.1）----

const baseline = ref<EditorSnapshot>(snapshotFromPrompt(emptyPrompt()));
const baselinePrompt = ref<Prompt>(emptyPrompt());
const titleError = ref(false);

const editorSnapshot = computed<EditorSnapshot>(() => ({
  title: editing.value.title,
  body: editing.value.body,
  tags: editing.value.tags,
  folder: editing.value.folder,
  favorite: editing.value.favorite,
  pinned: editing.value.pinned,
}));

const isDirty = computed<boolean>(() => computeDirty(editorSnapshot.value, baseline.value));

let guarding = false;
let pendingSave: Promise<boolean> | undefined;

function performSave(): Promise<boolean> {
  if (pendingSave) return pendingSave;
  pendingSave = mutations.run(async () => {
    if (!editing.value.title.trim()) {
      titleError.value = true;
      return false;
    }
    saving.value = true;
    try {
      const saved = await api.savePrompt(editing.value);
      await reload();
      editing.value = JSON.parse(JSON.stringify(saved));
      selectedId.value = saved.id;
      baseline.value = snapshotFromPrompt(saved);
      baselinePrompt.value = JSON.parse(JSON.stringify(saved));
      titleError.value = false;
      await revealPrompt(saved.id, saved.folder);
      return true;
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
      return false;
    } finally {
      saving.value = false;
    }
  }).finally(() => { pendingSave = undefined; });
  return pendingSave;
}

// 拦截会替换或销毁编辑状态的操作：保存并继续 / 放弃修改 / 取消（PRD 9.5）
async function guardUnsaved(action: () => unknown | Promise<unknown>): Promise<boolean> {
  if (guarding || importing.value) return false;
  await mutations.idle();
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

// 组织操作只同步相关字段与对应基线，保留其他尚未保存的草稿字段（PRD 6.1）
const SNAPSHOT_FIELDS = ["title", "body", "tags", "folder", "favorite", "pinned"] as const;

function syncEditorField(id: string, patch: Partial<Prompt>) {
  if (!id || editing.value.id !== id) return;
  Object.assign(editing.value, patch);
  Object.assign(baselinePrompt.value, patch);
  for (const field of SNAPSHOT_FIELDS) {
    if (field in patch) {
      (baseline.value as Record<string, unknown>)[field] = patch[field];
    }
  }
}

function patchPrompt(updated: Prompt) {
  const index = prompts.value.findIndex((prompt) => prompt.id === updated.id);
  if (index === -1) prompts.value = [...prompts.value, updated];
  else prompts.value = prompts.value.map((prompt, i) => (i === index ? updated : prompt));
}

// ---- 左侧结构 ----

const searching = computed(() => query.value.trim().length > 0);
const matched = computed(() => filterPrompts(prompts.value, query.value));
// 搜索范围包含被折叠和未显示的全部提示词，只隐藏未命中的结果
const visibleGroups = computed(() => arrangeFolders(matched.value, organization.value));
const allGroups = computed(() => arrangeFolders(prompts.value, organization.value));
const realCounts = computed(() => new Map(allGroups.value.map((group) => [group.key, group.items.length])));
const folderOptions = computed(() => allGroups.value.map((group) => group.key).filter((key) => key !== ""));
const folderKeys = computed(() => allGroups.value.map((group) => group.key));
const pinnedAll = computed(() => arrangePinned(prompts.value, organization.value));
const pinnedVisible = computed(() => arrangePinned(matched.value, organization.value));
const pinnedIds = computed(() => pinnedAll.value.map((prompt) => prompt.id));

interface Section {
  key: string;
  variant: "folder" | "pinned";
  title: string;
  items: Prompt[];
  total: number;
}

// 没有置顶条目时隐藏置顶区，不把它当作普通文件夹
const sections = computed<Section[]>(() => {
  const list: Section[] = [];
  if (pinnedVisible.value.length > 0) {
    list.push({
      key: PINNED_SECTION_KEY,
      variant: "pinned",
      title: t("pinnedSection"),
      items: pinnedVisible.value,
      total: pinnedAll.value.length,
    });
  }
  for (const group of visibleGroups.value) {
    list.push({
      key: group.key,
      variant: "folder",
      title: group.key || t("uncategorized"),
      items: group.items,
      total: realCounts.value.get(group.key) ?? group.items.length,
    });
  }
  return list;
});

function memberIdsOf(folder: string): string[] {
  const members = prompts.value.filter((prompt) => prompt.folder === folder);
  return orderMembers(members, organization.value.promptOrderByFolder[folder]).map((p) => p.id);
}

function shownFor(key: string): number {
  return (searching.value ? shownSearch.value : shownNormal.value)[key] ?? BATCH_SIZE;
}

function writeShown(key: string, value: number) {
  const map = searching.value ? shownSearch : shownNormal;
  map.value = { ...map.value, [key]: value };
}

function isCollapsed(key: string): boolean {
  // 搜索期间临时展开命中文件夹；清空搜索后恢复之前的展开状态
  if (searching.value) return collapsedSearch.value[key] === true;
  return layout.value.collapsed[key] === true;
}

function toggleCollapsed(key: string) {
  if (searching.value) {
    collapsedSearch.value = { ...collapsedSearch.value, [key]: !isCollapsed(key) };
    return;
  }
  layout.value = {
    ...layout.value,
    collapsed: { ...layout.value.collapsed, [key]: !(layout.value.collapsed[key] === true) },
  };
}

function setAllCollapsed(collapsed: boolean) {
  const current = searching.value ? collapsedSearch.value : layout.value.collapsed;
  const next = { ...current };
  for (const section of sections.value) next[section.key] = collapsed;
  if (searching.value) collapsedSearch.value = next;
  else layout.value = { ...layout.value, collapsed: next };
}

const allExpanded = computed(() => sections.value.every((section) => !isCollapsed(section.key)));
const allCollapsed = computed(() => sections.value.every((section) => isCollapsed(section.key)));

watch(query, () => { collapsedSearch.value = {}; });

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// 主动选择、创建或移动成功后，把第 5 条之外的目标展开到可见范围并滚动定位
async function revealPrompt(id: string, folder: string) {
  if (searching.value && !matched.value.some((prompt) => prompt.id === id)) return;
  if (isCollapsed(folder)) toggleCollapsed(folder);
  const group = visibleGroups.value.find((group) => group.key === folder);
  const index = group?.items.findIndex((prompt) => prompt.id === id) ?? -1;
  if (index >= BATCH_SIZE) {
    const needed = Math.ceil((index + 1) / BATCH_SIZE) * BATCH_SIZE;
    if (shownFor(folder) < needed) writeShown(folder, needed);
  }
  await nextTick();
  document
    .querySelector(`[data-section-variant="folder"][data-section-key="${CSS.escape(folder)}"] [data-prompt-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

// ---- 顺序与归属操作 ----

async function reportOrderFailure(error: unknown) {
  alert(t("operationFailed", { error: translateApiError(error) }));
  // 失败时恢复原位置、原计数与原选中状态：重新读取最终成功提交的顺序
  await reload();
}

async function applyFolderOrder(order: string[]) {
  const expected = structuredClonePlain(organization.value);
  return mutations.run(async () => {
    try {
      organization.value = await api.setFolderOrder(order, expected);
    } catch (error) {
      await reportOrderFailure(error);
    }
  });
}

async function applyPromptOrder(folder: string, order: string[]) {
  const expected = structuredClonePlain(organization.value);
  return mutations.run(async () => {
    try {
      organization.value = await api.setPromptOrder(folder, order, expected);
    } catch (error) {
      await reportOrderFailure(error);
    }
  });
}

async function applyPinnedOrder(order: string[]) {
  const expected = structuredClonePlain(organization.value);
  return mutations.run(async () => {
    try {
      organization.value = await api.setPinnedOrder(order, expected);
    } catch (error) {
      await reportOrderFailure(error);
    }
  });
}

function structuredClonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function onFolderAction(action: "up" | "down", sectionKey: string) {
  const next = shift(folderKeys.value, sectionKey, action === "up" ? -1 : 1);
  if (!sameOrder(next, folderKeys.value)) await applyFolderOrder(next);
}

async function shiftPrompt(prompt: Prompt, offset: number, sectionKey: string) {
  if (sectionKey === PINNED_SECTION_KEY) {
    const next = shift(pinnedIds.value, prompt.id, offset);
    if (!sameOrder(next, pinnedIds.value)) await applyPinnedOrder(next);
    return;
  }
  const current = memberIdsOf(prompt.folder);
  const next = shift(current, prompt.id, offset);
  if (!sameOrder(next, current)) await applyPromptOrder(prompt.folder, next);
}

// 移动当前有未保存修改的提示词时复用未保存保护；保存后重新核对最新归属与落点
function requestMove(id: string, toFolder: string, anchorId: string | null, position: DropPosition) {
  const run = () => performMove(id, toFolder, anchorId, position);
  if (editing.value.id === id && isDirty.value) void guardUnsaved(run);
  else void run();
}

async function performMove(id: string, toFolder: string, anchorId: string | null, position: DropPosition) {
  const source = prompts.value.find((prompt) => prompt.id === id);
  if (!source) return;
  if (source.folder === toFolder) {
    // 同文件夹内只提交顺序，不改动归属、内容与使用记录
    const current = memberIdsOf(toFolder);
    const next = reorder(current, id, anchorId, position);
    if (sameOrder(next, current)) return;
    await applyPromptOrder(toFolder, next);
    return;
  }
  // 落点按目标文件夹的完整成员顺序换算，未显示条目的相对顺序保持不变
  const index = anchorId
    ? reorderIndex(memberIdsOf(toFolder), id, anchorId, position)
    : null;
  if (index !== null && index < 0) {
    await reportOrderFailure("organization.stale");
    return;
  }
  const expected = structuredClonePlain(organization.value);
  return mutations.run(async () => {
    try {
      const update = await api.movePrompt(id, toFolder, index, expected);
      patchPrompt(update.prompt);
      organization.value = update.organization;
      syncEditorField(update.prompt.id, {
        folder: update.prompt.folder,
        updatedAt: update.prompt.updatedAt,
      });
      await revealPrompt(update.prompt.id, update.prompt.folder);
    } catch (error) {
      await reportOrderFailure(error);
    }
  });
}

function onMovePromptTo(prompt: Prompt, folder: string) {
  if (prompt.folder === folder) return;
  requestMove(prompt.id, folder, null, "after");
}

async function onPromptAction(
  prompt: Prompt,
  action: "favorite" | "pin" | "up" | "down" | "end",
  sectionKey: string
) {
  if (action === "favorite") {
    await toggleFavorite(prompt);
    return;
  }
  if (action === "pin") {
    await togglePin(prompt);
    return;
  }
  if (action === "up" || action === "down") {
    await shiftPrompt(prompt, action === "up" ? -1 : 1, sectionKey);
    return;
  }
  const current = memberIdsOf(prompt.folder);
  const next = reorder(current, prompt.id, null, "after");
  if (!sameOrder(next, current)) await applyPromptOrder(prompt.folder, next);
}

async function onDrop(target: DropTarget) {
  const drag = dragPayload.value;
  endDrag();
  if (!drag) return;

  if (drag.kind === "folder") {
    // 只支持同级排序：拖到另一文件夹上不解释为嵌套或合并
    if (target.kind !== "folder-header") return;
    const next = reorder(folderKeys.value, drag.id, target.sectionKey, target.position);
    if (!sameOrder(next, folderKeys.value)) await applyFolderOrder(next);
    return;
  }

  if (drag.sectionKey === PINNED_SECTION_KEY) {
    // 置顶区内拖动只调整置顶顺序，不改变归属
    if (target.kind !== "prompt-row") return;
    const next = reorder(pinnedIds.value, drag.id, target.promptId, target.position);
    if (!sameOrder(next, pinnedIds.value)) await applyPinnedOrder(next);
    return;
  }

  if (target.kind === "folder-end" || target.kind === "folder-header") {
    // 投放到文件夹标题：追加到真实成员末尾，包括未显示条目之后
    requestMove(drag.id, target.sectionKey, null, "after");
    return;
  }
  if (target.sectionKey === PINNED_SECTION_KEY) return;
  const source = prompts.value.find((prompt) => prompt.id === drag.id);
  if (!source) return;
  if (source.folder === target.sectionKey) {
    const current = memberIdsOf(target.sectionKey);
    const next = reorder(current, drag.id, target.promptId, target.position);
    if (!sameOrder(next, current)) await applyPromptOrder(target.sectionKey, next);
    return;
  }
  requestMove(drag.id, target.sectionKey, target.promptId, target.position);
}

// ---- 收藏与置顶：两个独立操作 ----

async function toggleFavorite(prompt: Prompt) {
  const id = prompt.id;
  if (!prompt.id) {
    // 尚未首次保存的草稿：作为草稿状态，按保存按钮统一提交
    editing.value.favorite = !editing.value.favorite;
    return;
  }
  return mutations.run(async () => {
    try {
      const current = prompts.value.find((p) => p.id === id);
      if (!current) throw "prompt.not_found";
      const saved = await api.setFavorite(id, !current.favorite);
      patchPrompt(saved);
      syncEditorField(saved.id, { favorite: saved.favorite });
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
  });
}

async function togglePin(prompt: Prompt) {
  const id = prompt.id;
  if (!prompt.id) {
    editing.value.pinned = !editing.value.pinned;
    return;
  }
  return mutations.run(async () => {
    try {
      const current = prompts.value.find((p) => p.id === id);
      if (!current) throw "prompt.not_found";
      const update = await api.setPinned(id, !current.pinned);
      patchPrompt(update.prompt);
      organization.value = update.organization;
      syncEditorField(update.prompt.id, { pinned: update.prompt.pinned });
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
  });
}

// ---- 生命周期 ----

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
  try {
    layout.value = parseLayout(await api.getUiPrefs(LAYOUT_PREFS_KEY));
  } catch {
    layout.value = defaultLayout();
  }
  savedLayout = serializeLayout(layout.value);
  layoutLoaded = true;
  await reload();
  const first = visibleGroups.value[0]?.items[0] ?? pinnedVisible.value[0];
  if (first) {
    selectedId.value = first.id;
    applyEditor(first);
  }
});

onUnmounted(() => {
  for (const unlisten of unlistenFns) unlisten();
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("keydown", handleWindowKeydown);
  navObserver?.disconnect();
  void flushLayout().catch(() => undefined);
  void api.setManagerGuardReady(false);
});

// 导航容器可能在导入比较页与主界面之间重建，需要跟随元素重新观察
watch(navElement, (element) => {
  navObserver?.disconnect();
  navObserver = undefined;
  if (!element) return;
  navObserver = new ResizeObserver(([entry]) => {
    navHeight.value = entry.contentRect.height;
  });
  navObserver.observe(element);
});

watch(layout, () => {
  // 读取偏好本身也会触发深层 watch：只在加载完成后的真实调节时落盘
  if (layoutLoaded) scheduleLayoutSave();
}, { deep: true, flush: "sync" });

function scheduleLayoutSave() {
  window.clearTimeout(layoutSaveTimer);
  layoutSaveTimer = window.setTimeout(() => {
    void flushLayout().catch(() => alert(t("layoutSaveFailed")));
  }, 300);
}

async function flushLayout(): Promise<void> {
  window.clearTimeout(layoutSaveTimer);
  layoutSaveTimer = undefined;
  if (!layoutLoaded) return;
  await layoutWrites.run(async () => {
    // 写入期间的进一步调整也必须落盘；失败不能更新 savedLayout。
    while (savedLayout !== serializeLayout(layout.value)) {
      const value = serializeLayout(layout.value);
      await api.setUiPrefs(LAYOUT_PREFS_KEY, value);
      savedLayout = value;
    }
  });
}

async function reload() {
  const library = await api.loadLibrary();
  prompts.value = library.prompts;
  organization.value = library.organization;
}

function select(p: Prompt) {
  // 点击当前已选中的同一条 Prompt 不触发保护（PRD 9.4）
  if (p.id === selectedId.value) {
    void revealPrompt(p.id, p.folder);
    return;
  }
  void guardUnsaved(async () => {
    const current = prompts.value.find((item) => item.id === p.id);
    if (!current) return;
    selectedId.value = p.id;
    applyEditor(current);
    await revealPrompt(current.id, current.folder);
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
      await mutations.run(async () => {
        await api.deletePrompt(selectedId.value!);
        await reload();
        applyEditor(emptyPrompt());
        selectedId.value = null;
      });
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    }
  });
}

const tagsInput = computed({
  get: () => editing.value.tags.join(", "),
  set: (v: string) => {
    editing.value.tags = v.split(",").map((tag) => tag.trim()).filter(Boolean);
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
      importing.value = true;
      const result = await api.importPrompts(path as string, true);
      await reload();
      await resyncEditor();
      alert(t("importSuccess", { count: result.count }) + (result.organizationAdjusted ? `\n${t("importOrganizationAdjusted")}` : ""));
    } catch (error) {
      alert(t("operationFailed", { error: translateApiError(error) }));
    } finally {
      importing.value = false;
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
        const fresh = await api.precheckImportSnapshot(
          precheck.items.map((item) => item.imported),
          precheck.organization
        );
        fresh.organizationAdjusted ||= precheck.organizationAdjusted;
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
    }) + (precheck.organizationAdjusted ? `\n${t("importOrganizationAdjusted")}` : ""));
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
  await mutations.idle();
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

async function resolveLeaveWithLayout(): Promise<boolean> {
  if (!(await resolveLeave())) return false;
  try {
    await flushLayout();
    return true;
  } catch {
    alert(t("layoutSaveFailed"));
    return false;
  }
}

async function handleWindowKeydown(event: KeyboardEvent) {
  const reloadShortcut = event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
  if (!reloadShortcut) return;
  event.preventDefault();
  if (await resolveLeaveWithLayout()) {
    await api.setManagerGuardReady(false);
    allowNextUnload = true;
    window.location.reload();
  }
}

async function handleCloseRequest() {
  const allow = await resolveLeaveWithLayout();
  try {
    await api.resolveClose(allow);
  } catch {
    // 窗口生命周期变化后握手可能已结束，无需额外处理
  }
}

async function handleQuitRequest() {
  const allow = await resolveLeaveWithLayout();
  try {
    await api.resolveQuit(allow);
  } catch {
    // 应用生命周期变化后握手可能已结束，无需额外处理
  }
}
</script>

<template>
  <div class="flex h-full flex-col" :aria-busy="importing || saving" :inert="saving || (importing && !importSession) ? true : undefined">
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
      <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        <div class="mr-auto">
          <h1 class="text-base font-bold">PromptDock</h1>
          <p class="text-[11px] text-neutral-400">{{ t("managerTagline") }}</p>
        </div>
        <button class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="newPrompt">{{ t("newPrompt") }}</button>
        <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="doImport">{{ t("import") }}</button>
        <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="doExport">{{ t("export") }}</button>
        <button class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="showSettings = true">⚙ {{ t("settings") }}</button>
      </header>

      <!-- 左右两栏各自管理溢出，不用一条整页滚动条拖走导航与操作按钮 -->
      <div class="min-h-0 flex-1">
        <ResizableSplit
          axis="columns"
          unit="ratio"
          :label="t('resizeSidebar')"
          :initial-size="0.28"
          :default-min="240"
          :default-max="420"
          :min-first="220"
          :min-second="480"
          :max-first-ratio="0.45"
          :model-value="layout.sidebarRatio"
          @update:model-value="layout.sidebarRatio = $event"
        >
          <template #first>
            <aside class="flex h-full min-h-0 flex-col">
              <div class="shrink-0 p-2">
                <input
                  v-model="query"
                  :placeholder="t('searchPlaceholder')"
                  class="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
                />
                <div class="mt-2 flex items-center justify-end gap-2" data-folder-bulk-actions>
                  <button type="button" class="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-700" :disabled="allExpanded" @click="setAllCollapsed(false)">{{ t("expandAll") }}</button>
                  <button type="button" class="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-700" :disabled="allCollapsed" @click="setAllCollapsed(true)">{{ t("collapseAll") }}</button>
                </div>
              </div>
              <div ref="navElement" data-manager-navigation class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
                <div v-if="sections.length === 0" class="p-4 text-center text-sm text-neutral-400">
                  {{ t("noSearchResults") }}
                </div>
                <FolderSection
                  v-for="section in sections"
                  :key="section.variant + section.key"
                  :section-key="section.key"
                  :variant="section.variant"
                  :title="section.title"
                  :items="section.items"
                  :total="section.total"
                  :selected-id="selectedId"
                  :searching="searching"
                  :collapsed="isCollapsed(section.key)"
                  :shown="shownFor(section.key)"
                  :nav-height="navHeight"
                  :folder-options="folderOptions"
                  @select="select"
                  @toggle-collapsed="toggleCollapsed(section.key)"
                  @show-more="writeShown(section.key, nextBatch(shownFor(section.key)))"
                  @collapse-list="writeShown(section.key, BATCH_SIZE)"
                  @drop="onDrop"
                  @folder-action="onFolderAction($event, section.key)"
                  @prompt-action="onPromptAction"
                  @move-prompt-to="onMovePromptTo"
                />
              </div>
            </aside>
          </template>

          <template #second>
            <!-- 右侧编辑区：正文占据剩余高度，底部操作始终可见 -->
            <main class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-4">
              <div class="flex shrink-0 flex-wrap items-center gap-2">
                <input
                  v-model="editing.title"
                  :placeholder="t('promptTitlePlaceholder')"
                  class="min-w-[180px] flex-1 rounded-md border bg-transparent px-3 py-2 text-sm font-medium outline-none focus:border-blue-400"
                  :class="titleError ? 'border-red-400' : 'border-neutral-300 dark:border-neutral-600'"
                  @input="titleError = false"
                >
                <span
                  v-if="isDirty"
                  class="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  role="status"
                >{{ t("unsavedIndicator") }}</span>
                <button
                  type="button"
                  class="shrink-0 rounded-md border px-3 py-2 text-sm"
                  :class="editing.favorite ? 'border-yellow-400 bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30' : 'border-neutral-300 dark:border-neutral-600'"
                  :aria-pressed="editing.favorite"
                  :aria-label="editing.favorite ? t('unfavorite') : t('favorite')"
                  @click="toggleFavorite(editing)"
                >⭐ {{ editing.favorite ? t("favorited") : t("favorite") }}</button>
                <button
                  type="button"
                  class="shrink-0 rounded-md border px-3 py-2 text-sm"
                  :class="editing.pinned ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'border-neutral-300 dark:border-neutral-600'"
                  :aria-pressed="editing.pinned"
                  :aria-label="editing.pinned ? t('unpin') : t('pin')"
                  @click="togglePin(editing)"
                >📌 {{ editing.pinned ? t("pinned") : t("pin") }}</button>
              </div>
              <p v-if="titleError" class="shrink-0 text-xs text-red-500">{{ t("titleRequired") }}</p>
              <div class="flex shrink-0 flex-wrap gap-2">
                <input
                  v-model="tagsInput"
                  :placeholder="t('tagsPlaceholder')"
                  class="min-w-[160px] flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
                />
                <input
                  v-model="editing.folder"
                  :placeholder="t('folderPlaceholder')"
                  list="folder-list"
                  class="w-56 min-w-[160px] rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600"
                />
                <datalist id="folder-list">
                  <option v-for="name in folderOptions" :key="name" :value="name" />
                </datalist>
              </div>

              <div class="min-h-0 flex-1">
                <ResizableSplit
                  :second-collapsed="editorShowVarHint.length === 0"
                  axis="rows"
                  unit="ratio"
                  :label="t('resizeEditorBody')"
                  :initial-size="0.72"
                  :min-first="120"
                  :min-second="56"
                  :model-value="layout.editorRatio"
                  @update:model-value="layout.editorRatio = $event"
                >
                  <template #first>
                    <textarea
                      v-model="editing.body"
                      :placeholder="t('bodyPlaceholder')"
                      class="h-full w-full resize-none rounded-md border border-neutral-300 bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus:border-blue-400 dark:border-neutral-600"
                    />
                  </template>
                  <template #second>
                    <div class="h-full overflow-y-auto pt-2 text-xs text-neutral-400">
                      {{ t("variablesDetected") }}
                      <span
                        v-for="v in editorShowVarHint"
                        :key="v.name"
                        class="mr-1.5 inline-block rounded bg-neutral-200 px-1.5 py-0.5 font-mono dark:bg-neutral-700"
                      >{{ v.name }}<template v-if="v.type === 'multi'"> ({{ t("multiValueHint") }})</template><template v-else-if="v.type === 'select'"> ({{ t("selectValueHint") }})</template><template v-else-if="v.default"> ({{ t("defaultValueHint", { value: v.default }) }})</template></span>
                    </div>
                  </template>
                </ResizableSplit>
              </div>

              <div class="flex shrink-0 items-center justify-between gap-2">
                <button
                  v-if="selectedId"
                  class="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30"
                  @click="remove"
                >{{ t("delete") }}</button>
                <span v-else />
                <button class="rounded-md bg-blue-500 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="save">{{ t("save") }}</button>
              </div>
            </main>
          </template>
        </ResizableSplit>
      </div>
    </template>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <ConfirmLeaveDialog />
  </div>
</template>
