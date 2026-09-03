<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { fitPopover } from "../../lib/popover";

// 行内操作菜单：不使用拖动也能完成排序与移动（PRD 4.6 / AC-21）。
// 弹层使用固定定位，避免被条目视口的滚动容器裁掉。
const props = withDefaults(defineProps<{
  label: string;
  items: Array<{ id: string; label: string; disabled?: boolean }>;
  filterable?: boolean;
  filterPlaceholder?: string;
}>(), { filterable: false, filterPlaceholder: "" });

const emit = defineEmits<{ select: [id: string] }>();

const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const filter = ref("");
const position = ref({ top: 0, left: 0, maxHeight: 0 });

const visible = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) return props.items;
  return props.items.filter((item) => item.label.toLowerCase().includes(query));
});

function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const element = popup.value;
  if (!element) return;
  position.value = fitPopover(rect, element.offsetWidth, element.scrollHeight + 2, window.innerWidth, window.innerHeight);
}

async function toggle() {
  open.value = !open.value;
  filter.value = "";
  if (open.value) {
    await nextTick();
    place();
    await nextTick();
    popup.value?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus({ preventScroll: true });
  }
}

function choose(id: string) {
  open.value = false;
  trigger.value?.focus({ preventScroll: true });
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
  trigger.value?.focus();
}

function onOutsidePointerDown(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (trigger.value?.contains(target ?? null)) return;
  if (popup.value?.contains(target ?? null)) return;
  open.value = false;
}

const popup = ref<HTMLElement | null>(null);
const close = () => { open.value = false; };
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
  <span class="relative inline-flex shrink-0" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="rounded px-1 py-0.5 text-xs leading-none text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-600 dark:hover:text-neutral-200"
      :class="{ 'opacity-100': open }"
      :aria-label="label"
      :title="label"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click.stop="toggle"
    >⋮</button>
    <div
      v-if="open"
      ref="popup"
      role="menu"
      class="fixed z-40 w-52 rounded-md border border-neutral-300 bg-white p-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
      :style="{ top: `${position.top}px`, left: `${position.left}px`, maxHeight: position.maxHeight ? `${position.maxHeight}px` : undefined, overflowY: 'auto' }"
      @click.stop
      @pointerdown.stop
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
          :class="item.disabled ? '' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
          @click="choose(item.id)"
        >{{ item.label }}</button>
        <p v-if="filterable && visible.length === 0" class="px-2 py-1.5 text-xs text-neutral-400">—</p>
      </div>
    </div>
  </span>
</template>
