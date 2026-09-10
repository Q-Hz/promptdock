<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { fitPopover } from "../../lib/popover";
import type { Prompt } from "../../lib/api";
import { t } from "../../lib/i18n";
import { batchView, PINNED_SECTION_KEY } from "../../lib/organization";
import { folderViewportBounds } from "../../lib/split-pane";
import {
  beginDrag, dragPayload, DRAG_MIME, endDrag,
  type DropPosition, type DropTarget,
} from "../../lib/drag-state";
import ActionMenu from "./ActionMenu.vue";

// 左侧一个分区：置顶区或一个文件夹。承载折叠、分批显示、受限高度、拖动落点与行内菜单。
const props = defineProps<{
  sectionKey: string;
  variant: "folder" | "pinned";
  title: string;
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
  folderAction: [action: "up" | "down" | "rename" | "delete"];
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

const isPinnedSection = computed(() => props.variant === "pinned");
const isSystemSection = computed(() => isPinnedSection.value || props.sectionKey === "");

// 拖动排序在非空搜索时禁用，避免在不完整列表上误排（PRD 4.3）
const sortable = computed(() => !props.searching);

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
  emit("folderAction", action as "up" | "down" | "rename" | "delete");
}

function onHeaderContextMenu(event: MouseEvent) {
  if (isSystemSection.value || props.renaming) return;
  event.preventDefault();
  folderMenu.value?.openAt(event.clientX, event.clientY);
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
  event.preventDefault();
  promptMenus.get(prompt.id)?.openAt(event.clientX, event.clientY);
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
  rowIndicator.value = null;
  headerIndicator.value = null;
  clearTempExpand();
});

onUnmounted(() => {
  clearTempExpand();
  closePicker();
  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  window.removeEventListener("scroll", closeAll, true);
  window.removeEventListener("resize", closePicker);
});

function onRowDragStart(event: DragEvent, prompt: Prompt) {
  if (!sortable.value) {
    event.preventDefault();
    return;
  }
  beginDrag({ kind: "prompt", id: prompt.id, sectionKey: props.sectionKey });
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, prompt.id);
    event.dataTransfer.setData("text/plain", prompt.title);
  }
}

function onRowDragEnd() {
  rowIndicator.value = null;
  endDrag();
}

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

function onFolderDragStart(event: DragEvent) {
  if (!sortable.value || isPinnedSection.value) {
    event.preventDefault();
    return;
  }
  beginDrag({ kind: "folder", id: props.sectionKey, sectionKey: props.sectionKey });
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, props.sectionKey);
  }
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
      class="group flex items-center gap-1 rounded-md px-1 py-1"
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
        <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-base leading-none text-neutral-400" aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span>
        <span class="truncate text-[12px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400" :title="title">
          {{ title }}
        </span>
        <span class="ml-auto shrink-0 text-[10px] tabular-nums text-neutral-400">{{ countLabel }}</span>
      </button>
      <div v-else class="flex min-w-0 flex-1 items-center gap-1">
        <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-base leading-none text-neutral-400" aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span>
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

      <span class="flex w-14 shrink-0 items-center justify-end gap-1">
        <template v-if="!isPinnedSection && !renaming">
          <span
            data-folder-drag-handle
            class="inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-[11px] text-neutral-300 opacity-0 transition-colors transition-opacity hover:bg-neutral-200 hover:text-neutral-600 group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
            :draggable="sortable"
            :title="t('dragFolderHandle')"
            :aria-label="t('dragFolderHandle')"
            role="button"
            tabindex="-1"
            @dragstart="onFolderDragStart"
            @dragend="clearTempExpand(); headerIndicator = null; endDrag()"
          >⠿</span>
          <ActionMenu
            v-if="!isSystemSection"
            ref="folderMenu"
            :label="t('folderActions')"
            :items="folderMenuItems"
            @select="onFolderMenu"
          />
          <ActionMenu
            v-else
            :label="t('folderActions')"
            :items="folderMenuItems.slice(0, 2)"
            @select="onFolderMenu"
          />
        </template>
      </span>
    </header>


    <template v-if="expanded">
      <div
        ref="viewport"
        class="min-h-0 overflow-y-auto px-0.5"
        :style="{ maxHeight: `${viewportPx}px` }"
      >
        <template v-for="prompt in visibleItems" :key="prompt.id">
          <div
            class="group flex items-center gap-1 rounded-md pl-5 pr-1"
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
            <span
              data-prompt-drag-handle
              class="inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-[11px] opacity-0 transition-colors transition-opacity hover:bg-neutral-200 hover:text-neutral-600 group-hover:opacity-70 group-focus-within:opacity-70 dark:hover:bg-neutral-600 dark:hover:text-neutral-200"
              :draggable="sortable"
              :title="sortable ? t('dragPromptHandle') : t('searchSortDisabled')"
              :aria-label="sortable ? t('dragPromptHandle') : t('searchSortDisabled')"
              role="button"
              tabindex="-1"
              @dragstart.stop="onRowDragStart($event, prompt)"
              @dragend.stop="onRowDragEnd"
            >⠿</span>
            <ActionMenu
              :ref="(value) => setPromptMenuRef(prompt.id, value)"
              :label="t('promptActions')"
              :items="promptMenuItems(prompt)"
              @select="(action) => onPromptMenu(prompt, action)"
            />
          </div>
        </template>
      </div>

      <div v-if="batch.remaining > 0 || batch.canCollapse" class="flex flex-col items-center gap-0.5 px-1 py-1">
        <button
          v-if="batch.remaining > 0"
          type="button"
          class="rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
          @click="emit('showMore')"
        >{{ t("showMore") }}</button>
        <button
          v-if="batch.canCollapse"
          type="button"
          class="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
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
