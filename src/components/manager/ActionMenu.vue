<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { fitPopover } from "../../lib/popover";

// 行内操作菜单：不使用拖动也能完成排序与移动（PRD 4.6 / AC-21）。
// 弹层使用固定定位，避免被条目视口的滚动容器裁掉。
const props = withDefaults(defineProps<{
  label: string;
  items: Array<{
    id: string;
    label: string;
    disabled?: boolean;
    danger?: boolean;
    separatorBefore?: boolean;
  }>;
  filterable?: boolean;
  filterPlaceholder?: string;
}>(), { filterable: false, filterPlaceholder: "" });

const emit = defineEmits<{ select: [id: string] }>();

const open = ref(false);
const filter = ref("");
const position = ref({ top: 0, left: 0, maxHeight: 0 });
const contextPoint = ref<{ x: number; y: number } | null>(null);
let contextOrigin: HTMLElement | null = null;

function restoreFocus() {
  contextOrigin?.focus({ preventScroll: true });
}

const visible = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return props.items;
  return props.items.filter((item) => item.label.toLowerCase().includes(query));
});

function place() {
  const rect = contextPoint.value
    ? new DOMRect(contextPoint.value.x, contextPoint.value.y, 0, 0)
    : null;
  if (!rect) return;
  const element = popup.value;
  if (!element) return;
  position.value = fitPopover(rect, element.offsetWidth, element.scrollHeight + 2, window.innerWidth, window.innerHeight);
}

async function openAt(x: number, y: number, origin?: HTMLElement) {
  contextOrigin = origin ?? null;
  contextPoint.value = { x, y };
  open.value = true;
  filter.value = "";
  await nextTick();
  place();
  await nextTick();
  popup.value?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus({ preventScroll: true });
}

function choose(id: string) {
  open.value = false;
  contextPoint.value = null;
  restoreFocus();
  emit("select", id);
}

function onKeydown(event: KeyboardEvent) {
  if (open.value && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    event.stopPropagation();
    const items = [...(popup.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    return;
  }
  if (event.key !== "Escape" || !open.value) return;
  event.stopPropagation();
  event.preventDefault();
  open.value = false;
  restoreFocus();
}

function onOutsidePointerDown(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (popup.value?.contains(target ?? null)) return;
  open.value = false;
}

const popup = ref<HTMLElement | null>(null);
const close = () => { open.value = false; contextPoint.value = null; };
defineExpose({ openAt, close });
function onScroll(event: Event) {
  if (event.target instanceof Node && popup.value?.contains(event.target)) return;
  close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onOutsidePointerDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", close);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", close);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="popup"
      role="menu"
      :aria-label="label"
      class="fixed z-40 w-52 rounded-md border border-neutral-300 bg-white p-1 text-neutral-900 shadow-lg dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
      :style="{ top: `${position.top}px`, left: `${position.left}px`, maxHeight: position.maxHeight ? `${position.maxHeight}px` : undefined, overflowY: 'auto' }"
      @click.stop
      @pointerdown.stop
      @keydown="onKeydown"
    >
      <input
        v-if="filterable"
        v-model="filter"
        :placeholder="filterPlaceholder"
        class="mb-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-neutral-600"
        @keydown.esc="onKeydown"
        @pointerdown.stop
      />
      <div class="max-h-64 overflow-y-auto">
        <button
          v-for="item in visible"
          :key="item.id"
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          class="block w-full rounded px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
          :class="[
            item.disabled ? '' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
            item.danger ? 'text-red-600 dark:text-red-400' : '',
            item.separatorBefore ? 'mt-1 border-t border-neutral-200 pt-2 dark:border-neutral-600' : '',
          ]"
          @click="choose(item.id)"
        >{{ item.label }}</button>
        <p v-if="filterable && visible.length === 0" class="px-2 py-1.5 text-xs text-neutral-400">—</p>
      </div>
    </div>
  </Teleport>
</template>
