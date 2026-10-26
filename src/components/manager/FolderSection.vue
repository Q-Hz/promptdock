<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { fitPopover } from "../../lib/popover";
import type { Prompt } from "../../lib/api";
import { t } from "../../lib/i18n";
import { batchView, PINNED_SECTION_KEY } from "../../lib/organization";
import { folderViewportBounds } from "../../lib/split-pane";
import { holdDragReady } from "../../lib/hold-drag";
import {
  beginDrag, dragPayload, endDrag,
  type DropPosition, type DropTarget,
  type DragPayload,
} from "../../lib/drag-state";
import ActionMenu from "./ActionMenu.vue";
import FolderIcon from "./FolderIcon.vue";
import { defaultAppearance, type FolderAppearance } from "../../lib/folder-appearance";

// 左侧一个分区：置顶区或一个文件夹。承载折叠、分批显示、受限高度、拖动落点与行内菜单。
const props = defineProps<{
  sectionKey: string;
  variant: "folder" | "pinned";
  title: string;
  appearance?: FolderAppearance;
  items: Prompt[];
  total: number;
  selectedId: string | null;
  searching: boolean;
  collapsed: boolean;
  shown: number;
  navHeight: number;
  folderOptions: string[];
  folderOrderKeys: string[];
  renaming?: boolean;
  renameValue?: string;
  renameError?: string;
  folderBusy?: boolean;
}>();

const emit = defineEmits<{
  select: [prompt: Prompt];
  toggleCollapsed: [];
  showMore: [];
  collapseList: [];
  drop: [target: DropTarget];
  folderAction: [action: "up" | "down" | "rename" | "delete" | "icon" | "create-prompt"];
  updateRename: [value: string];
  commitRename: [];
  cancelRename: [];
  promptAction: [prompt: Prompt, action: "favorite" | "pin" | "up" | "down" | "end" | "delete", sectionKey: string];
  movePromptTo: [prompt: Prompt, folder: string];
}>();

const viewport = ref<HTMLElement | null>(null);
const section = ref<HTMLElement | null>(null);
const pickerElement = ref<HTMLElement | null>(null);
const folderMenu = ref<InstanceType<typeof ActionMenu> | null>(null);
const promptMenus = new Map<string, InstanceType<typeof ActionMenu>>();
const renameInput = ref<HTMLInputElement | null>(null);
const rowIndicator = ref<{ id: string; position: DropPosition } | null>(null);
const headerIndicator = ref<DropPosition | "end" | null>(null);
const tempExpanded = ref(false);
const picker = ref<{ prompt: Prompt; top: number; left: number } | null>(null);
const pickerFilter = ref("");
let hoverTimer: number | undefined;
let press: { pointerId: number; startedAt: number; x: number; y: number; payload: DragPayload; dragging: boolean } | null = null;
let suppressClick = false;

function onPress(event: PointerEvent, prompt?: Prompt) {
  if ((event.target as Element).closest('[role="menu"], [data-folder-picker], input')) return;
  suppressClick = false;
  if (event.button !== 0 || !sortable.value || (!prompt && (isPinnedSection.value || props.renaming))) return;
  cancelPress();
  press = {
    pointerId: event.pointerId, startedAt: performance.now(), x: event.clientX, y: event.clientY,
    payload: { kind: prompt ? "prompt" : "folder", id: prompt?.id ?? props.sectionKey, sectionKey: props.sectionKey },
    dragging: false,
  };
  document.addEventListener("pointermove", onPressMove, true);
  document.addEventListener("pointerup", onPressUp, true);
  document.addEventListener("pointercancel", cancelPress, true);
  document.addEventListener("keydown", onPressKeydown, true);
  window.addEventListener("blur", cancelPress);
}

function dragTargetAt(event: PointerEvent) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-prompt-id], section[data-section-key] > header") ?? null;
}

function onPressMove(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return;
  if (!(event.buttons & 1) || !sortable.value || props.renaming) { cancelPress(); return; }
  if (!press.dragging) {
    if (!holdDragReady(press.startedAt, performance.now(), event.clientX, event.clientY, press.x, press.y)) return;
    press.dragging = true;
    suppressClick = true;
    folderMenu.value?.close();
    promptMenus.forEach((menu) => menu.close());
    closePicker();
    beginDrag(press.payload);
  }
  event.preventDefault();
  // Reuse the existing validated drop zones and shared edge scrolling.
  document.querySelectorAll<HTMLElement>("[data-row-drag-over]").forEach((element) => {
    if (element !== dragTargetAt(event)) {
      element.dispatchEvent(new DragEvent("dragleave", { bubbles: true }));
      element.removeAttribute("data-row-drag-over");
    }
  });
  const target = dragTargetAt(event);
  if (target) {
    target.setAttribute("data-row-drag-over", "");
  }
  (target ?? document.elementFromPoint(event.clientX, event.clientY) ?? document)
    .dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
}

function onPressUp(event: PointerEvent) {
  if (!press || event.pointerId !== press.pointerId) return;
  if (press.dragging) {
    event.preventDefault();
    // Refresh the position at release so a stale indicator cannot commit a move.
    onPressMove(new PointerEvent("pointermove", { pointerId: event.pointerId, buttons: 1, clientX: event.clientX, clientY: event.clientY }));
    dragTargetAt(event)?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
  }
  cancelPress();
}

function onPressKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") cancelPress();
}

function cancelPress() {
  const dragging = press?.dragging;
  press = null;
  document.removeEventListener("pointermove", onPressMove, true);
  document.removeEventListener("pointerup", onPressUp, true);
  document.removeEventListener("pointercancel", cancelPress, true);
  document.removeEventListener("keydown", onPressKeydown, true);
  window.removeEventListener("blur", cancelPress);
  document.querySelectorAll("[data-row-drag-over]").forEach((element) => element.removeAttribute("data-row-drag-over"));
  if (dragging) endDrag();
}

function onClickCapture(event: MouseEvent) {
  if (suppressClick && event.detail !== 0) {
    event.preventDefault();
    event.stopPropagation();
  }
}

const isPinnedSection = computed(() => props.variant === "pinned");
const isSystemSection = computed(() => isPinnedSection.value || props.sectionKey === "");

// 拖动排序在非空搜索时禁用，避免在不完整列表上误排（PRD 4.3）
const sortable = computed(() => !props.searching);
function isDragSource(kind: "prompt" | "folder", id: string) {
  const drag = dragPayload.value;
  return drag?.kind === kind && drag.id === id && drag.sectionKey === props.sectionKey;
}

const promptDropAllowed = computed(() => {
  const drag = dragPayload.value;
  if (!drag || drag.kind !== "prompt" || !sortable.value) return false;
  // 置顶区与普通文件夹之间不接受隐式置顶、取消置顶或移动
  return (drag.sectionKey === PINNED_SECTION_KEY) === isPinnedSection.value;
});

const folderDropAllowed = computed(() => {
  const drag = dragPayload.value;
  return !!drag && drag.kind === "folder" && sortable.value
    && !isPinnedSection.value && drag.id !== props.sectionKey;
});

const expanded = computed(() => !props.collapsed || tempExpanded.value);
const viewportPx = computed(() => folderViewportBounds(props.navHeight).initial);
const batch = computed(() => batchView(props.items.length, props.shown));
const visibleItems = computed(() => props.items.slice(0, batch.value.visible));
const countLabel = computed(() =>
  props.searching
    ? t("searchMatchCount", { matched: props.items.length, total: props.total })
    : t("folderCount", { count: props.total })
);

const folderMenuItems = computed(() => [
  {
    id: "up",
    label: t("moveUp"),
    disabled: !sortable.value || props.folderOrderKeys.indexOf(props.sectionKey) <= 0,
  },
  {
    id: "down",
    label: t("moveDown"),
    disabled: !sortable.value || props.folderOrderKeys.indexOf(props.sectionKey) >= props.folderOrderKeys.length - 1,
  },
  { id: "rename", label: t("renameFolder") },
  { id: "delete", label: t("deleteFolder"), danger: true },
]);
const sectionMenuItems = computed(() => [
  ...(isSystemSection.value ? [] : [{ id: "create-prompt", label: t("newPromptInFolder") }]),
  ...(isPinnedSection.value ? [] : isSystemSection.value ? folderMenuItems.value.slice(0, 2) : folderMenuItems.value),
  { id: "icon", label: t("changeFolderIcon"), separatorBefore: !isPinnedSection.value },
]);

watch(() => props.renaming, async (renaming) => {
  if (!renaming) return;
  await nextTick();
  renameInput.value?.focus({ preventScroll: true });
  renameInput.value?.select();
});

watch(() => props.renameError, async (error) => {
  if (!props.renaming || !error) return;
  await nextTick();
  renameInput.value?.focus({ preventScroll: true });
});

function onFolderMenu(action: string) {
  emit("folderAction", action as "up" | "down" | "rename" | "delete" | "icon" | "create-prompt");
}

function onHeaderContextMenu(event: MouseEvent) {
  if (props.renaming) return;
  cancelPress();
  event.preventDefault();
  folderMenu.value?.openAt(event.clientX, event.clientY, (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-folder-title]") ?? undefined);
}

function onFolderTitleKeydown(event: KeyboardEvent) {
  if (event.key !== "F2" || isSystemSection.value) return;
  event.preventDefault();
  event.stopPropagation();
  emit("folderAction", "rename");
}

function setPromptMenuRef(id: string, value: unknown) {
  if (value) promptMenus.set(id, value as InstanceType<typeof ActionMenu>);
  else promptMenus.delete(id);
}

function onPromptContextMenu(event: MouseEvent, prompt: Prompt) {
  cancelPress();
  event.preventDefault();
  promptMenus.get(prompt.id)?.openAt(event.clientX, event.clientY, (event.currentTarget as HTMLElement).querySelector<HTMLElement>("button") ?? undefined);
}

type MenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

function promptMenuItems(prompt: Prompt): MenuItem[] {
  const items: MenuItem[] = [
    { id: "favorite", label: prompt.favorite ? t("unfavorite") : t("favorite") },
    { id: "pin", label: prompt.pinned ? t("unpin") : t("pin") },
    { id: "up", label: t("moveUp"), disabled: !sortable.value },
    { id: "down", label: t("moveDown"), disabled: !sortable.value },
  ];
  if (!isPinnedSection.value) items.push({ id: "end", label: t("moveToFolderEnd"), disabled: false });
  items.push({ id: "move", label: t("moveToFolder"), disabled: false });
  items.push({ id: "delete", label: t("deletePromptAction"), danger: true, separatorBefore: true });
  return items;
}

const pickerFolders = computed(() => {
  const query = pickerFilter.value.trim().toLowerCase();
  const options = [
    { key: "", label: t("uncategorizedSystem") },
    ...props.folderOptions.map((folder) => ({ key: folder, label: folder })),
  ];
  return query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options;
});

function onPromptMenu(prompt: Prompt, action: string) {
  if (action === "move") {
    openPicker(prompt);
    return;
  }
  emit("promptAction", prompt, action as "favorite" | "pin" | "up" | "down" | "end" | "delete", props.sectionKey);
}

async function openPicker(prompt: Prompt) {
  const row = section.value?.querySelector(`[data-prompt-id="${CSS.escape(prompt.id)}"]`);
  const rect = row?.getBoundingClientRect();
  picker.value = {
    prompt,
    top: rect ? Math.min(rect.bottom + 4, window.innerHeight - 180) : 120,
    left: rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 224)) : 40,
  };
  pickerFilter.value = "";
  await nextTick();
  if (picker.value && rect && pickerElement.value) {
    Object.assign(picker.value, fitPopover(rect, pickerElement.value.offsetWidth, pickerElement.value.scrollHeight + 2, window.innerWidth, window.innerHeight));
    await nextTick();
    pickerElement.value.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }
}

function closePicker() {
  picker.value = null;
}

function chooseFolder(key: string) {
  const prompt = picker.value?.prompt;
  closePicker();
  if (prompt) emit("movePromptTo", prompt, key);
}

function onOutsidePointerDown(event: PointerEvent) {
  if (picker.value && !(event.target as Element | null)?.closest?.("[data-folder-picker]")) {
    closePicker();
  }
}
function closeAll(event: Event) {
  if (event.target instanceof Node && pickerElement.value?.contains(event.target)) return;
  closePicker();
}

watch(picker, (value) => {
  if (value) {
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("scroll", closeAll, true);
    window.addEventListener("resize", closePicker);
  } else {
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    window.removeEventListener("scroll", closeAll, true);
    window.removeEventListener("resize", closePicker);
  }
});

function clearTempExpand() {
  window.clearTimeout(hoverTimer);
  hoverTimer = undefined;
  tempExpanded.value = false;
}

// 拖动结束后清理本分区的全部落点反馈
watch(dragPayload, (value) => {
  if (value) return;
  if (press?.dragging) cancelPress();
  rowIndicator.value = null;
  headerIndicator.value = null;
  clearTempExpand();
}, { flush: "sync" });

watch(() => [props.searching, props.renaming], () => cancelPress());

onUnmounted(() => {
  cancelPress();
  clearTempExpand();
  closePicker();
  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  window.removeEventListener("scroll", closeAll, true);
  window.removeEventListener("resize", closePicker);
});

function onRowDragOver(event: DragEvent, prompt: Prompt) {
  if (dragPayload.value?.id === prompt.id) {
    rowIndicator.value = null;
    return;
  }
  if (!promptDropAllowed.value) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  rowIndicator.value = {
    id: prompt.id,
    position: event.clientY > rect.top + rect.height / 2 ? "after" : "before",
  };
}

function onRowDrop(event: DragEvent, prompt: Prompt) {
  event.preventDefault();
  const indicator = rowIndicator.value;
  rowIndicator.value = null;
  if (!promptDropAllowed.value || !indicator || indicator.id !== prompt.id) return;
  emit("drop", {
    kind: "prompt-row",
    sectionKey: props.sectionKey,
    promptId: prompt.id,
    position: indicator.position,
  });
}

function scheduleTempExpand() {
  if (!props.collapsed || tempExpanded.value || hoverTimer !== undefined) return;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = undefined;
    tempExpanded.value = true;
  }, 600);
}

function onHeaderDragOver(event: DragEvent) {
  const drag = dragPayload.value;
  if (!drag) return;
  const asFolder = folderDropAllowed.value;
  const asPrompt = drag.kind === "prompt" && promptDropAllowed.value && !isPinnedSection.value;
  if (!asFolder && !asPrompt) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (asFolder) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    headerIndicator.value = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  } else {
    headerIndicator.value = "end";
    scheduleTempExpand();
  }
}

function onHeaderDragLeave() {
  headerIndicator.value = null;
  window.clearTimeout(hoverTimer);
  hoverTimer = undefined;
}

function onHeaderDrop(event: DragEvent) {
  event.preventDefault();
  const indicator = headerIndicator.value;
  headerIndicator.value = null;
  clearTempExpand();
  if (!indicator) return;
  if (indicator === "end") {
    if (!promptDropAllowed.value) return;
    emit("drop", { kind: "folder-end", sectionKey: props.sectionKey });
    return;
  }
  if (!folderDropAllowed.value) return;
  emit("drop", {
    kind: "folder-header",
    sectionKey: props.sectionKey,
    position: indicator,
  });
}

function onCollapseList() {
  viewport.value?.scrollTo({ top: 0 });
  emit("collapseList");
}

function onRowKeydown(event: KeyboardEvent, prompt: Prompt) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("select", prompt);
}
</script>

<template>
  <section ref="section" class="group/section mb-1" :data-section-key="sectionKey" :data-section-variant="variant">

    <header
      class="group flex select-none items-center gap-1 rounded-md px-1 py-1"
      :draggable="false"
      :data-hold-draggable="sortable && !isPinnedSection && !renaming"
      :data-row-drag-source="isDragSource('folder', sectionKey)"
      @pointerdown="onPress($event)"
      @click.capture="onClickCapture"
      @dragstart.prevent
      :style="{ boxShadow: headerIndicator === 'before' ? 'inset 0 2px #3b82f6' : headerIndicator === 'after' ? 'inset 0 -2px #3b82f6' : undefined }"
      :class="headerIndicator === 'end'
        ? 'bg-blue-100 dark:bg-blue-900/40'
        : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/60'"
      :title="headerIndicator === 'end' ? t('dropToFolderEnd') : undefined"
      @dragover="onHeaderDragOver"
      @dragenter="onHeaderDragOver"
      @dragleave="onHeaderDragLeave"
      @drop="onHeaderDrop"
      @contextmenu="onHeaderContextMenu"
    >
      <button
        v-if="!renaming"
        data-folder-title
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 text-left"
        :aria-expanded="expanded"
        :aria-label="`${t('toggleFolder')}: ${title}`"
        @click="emit('toggleCollapsed')"
        @keydown="onFolderTitleKeydown"
      >
        <FolderIcon :appearance="appearance ?? defaultAppearance(sectionKey)" :expanded="expanded" />
        <span class="truncate text-[13px] font-normal text-neutral-700 dark:text-neutral-200" :title="title">
          {{ title }}
        </span>
        <span class="ml-auto shrink-0 text-[10px] tabular-nums text-neutral-400">{{ countLabel }}</span>
      </button>
      <div v-else class="flex min-w-0 flex-1 items-center gap-1">
        <FolderIcon :appearance="appearance ?? defaultAppearance(sectionKey)" :expanded="expanded" />
        <div class="min-w-0 flex-1">
          <input
            ref="renameInput"
            :value="renameValue"
            :aria-label="t('renameFolderInput')"
            :aria-invalid="renameError ? 'true' : undefined"
            :aria-describedby="renameError ? `folder-rename-error-${sectionKey}` : undefined"
            :disabled="folderBusy"
            class="w-full rounded border bg-white px-1.5 py-1 text-xs font-medium outline-none focus:border-blue-500 dark:bg-neutral-800"
            :class="renameError ? 'border-red-500' : 'border-blue-400 dark:border-blue-500'"
            @input="emit('updateRename', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('commitRename')"
            @keydown.esc.stop.prevent="emit('cancelRename')"
            @blur="emit('commitRename')"
          />
          <p v-if="renameError" :id="`folder-rename-error-${sectionKey}`" class="mt-0.5 text-[13px] leading-tight text-red-500">{{ renameError }}</p>
        </div>
      </div>

      <ActionMenu
        v-if="!renaming"
        ref="folderMenu"
        :label="t('folderActions')"
        :items="sectionMenuItems"
        @select="onFolderMenu"
      />
    </header>


    <template v-if="expanded">
      <div
        ref="viewport"
        class="min-h-0 overflow-y-auto px-0.5"
        :style="{ maxHeight: `${viewportPx}px` }"
      >
        <template v-for="prompt in visibleItems" :key="prompt.id">
          <div
            class="group flex select-none items-center gap-1 rounded-md pl-5 pr-1"
            :draggable="false"
            :data-hold-draggable="sortable"
            :data-row-drag-source="isDragSource('prompt', prompt.id)"
            @pointerdown="onPress($event, prompt)"
            @click.capture="onClickCapture"
            @dragstart.prevent
            @dragleave="rowIndicator = null"
            :style="{ boxShadow: rowIndicator?.id === prompt.id ? (rowIndicator.position === 'before' ? 'inset 0 2px #3b82f6' : 'inset 0 -2px #3b82f6') : undefined }"
            :class="prompt.id === selectedId ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
            :data-prompt-id="prompt.id"
            @dragover="onRowDragOver($event, prompt)"
            @dragenter="onRowDragOver($event, prompt)"
            @drop="onRowDrop($event, prompt)"
            @contextmenu="onPromptContextMenu($event, prompt)"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
              :title="prompt.title"
              @click="emit('select', prompt)"
              @keydown="onRowKeydown($event, prompt)"
            >
              <span v-if="prompt.favorite" class="shrink-0" :aria-label="t('favorited')">⭐</span>
              <span v-if="prompt.pinned && !isPinnedSection" class="shrink-0" :aria-label="t('pinned')">📌</span>
              <span class="truncate">{{ prompt.title }}</span>
              <span class="ml-auto shrink-0 max-w-[90px] truncate text-[11px] opacity-60">
                {{ isPinnedSection ? (prompt.folder || t("uncategorizedSystem")) : prompt.tags.join("·") }}
              </span>
            </button>
            <ActionMenu
              :ref="(value) => setPromptMenuRef(prompt.id, value)"
              :label="t('promptActions')"
              :items="promptMenuItems(prompt)"
              @select="(action) => onPromptMenu(prompt, action)"
            />
          </div>
        </template>
      </div>

      <div v-if="batch.remaining > 0 || batch.canCollapse" class="flex items-center gap-3 pl-[22px] pr-1 py-1">
        <button
          v-if="batch.remaining > 0"
          type="button"
          class="rounded py-0.5 text-[13px] text-neutral-400 hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-500 dark:hover:text-neutral-200"
          @click="emit('showMore')"
        >{{ t("showMore") }}</button>
        <button
          v-if="batch.canCollapse"
          type="button"
          class="rounded py-0.5 text-[13px] text-neutral-400 hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-500 dark:hover:text-neutral-200"
          @click="onCollapseList"
        >{{ t("collapseList") }}</button>
      </div>
    </template>

    <p
      v-if="searching"
      class="px-1 pb-1 text-[10px] text-neutral-400"
    >{{ t("searchSortDisabled") }}</p>

    <div
      v-if="picker"
      ref="pickerElement"
      data-folder-picker
      role="dialog"
      :aria-label="t('moveToFolderTitle')"
      class="fixed z-40 w-52 rounded-md border border-neutral-300 bg-white p-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
      :style="{ top: `${picker.top}px`, left: `${picker.left}px`, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }"
      @pointerdown.stop
      @keydown.esc.stop.prevent="closePicker"
    >
      <p class="px-2 py-1 text-[11px] font-medium text-neutral-500">{{ t("moveToFolderTitle") }}</p>
      <input
        v-model="pickerFilter"
        :placeholder="t('folderSearchPlaceholder')"
        class="mb-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-neutral-600"
        @keydown.esc="closePicker"
      />
      <div class="max-h-56 overflow-y-auto">
        <button
          v-for="option in pickerFolders"
          :key="option.key || '__uncategorized__'"
          type="button"
          class="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
          :title="option.label"
          @click="chooseFolder(option.key)"
        >{{ option.label }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
[data-row-drag-source="true"] {
  opacity: 0.6;
}
:global(body:has([data-row-drag-source="true"]) *) {
  cursor: grabbing !important;
}
</style>
