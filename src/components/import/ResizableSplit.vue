<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { clampSplit, splitBounds } from "../../lib/split-pane";

const props = withDefaults(defineProps<{
  axis: "columns" | "rows";
  label: string;
  initialSize: number;
  fromEnd?: boolean;
  minFirst?: number;
  minSecond?: number;
}>(), { fromEnd: false, minFirst: 120, minSecond: 120 });

const container = ref<HTMLElement | null>(null);
const available = ref(0);
const preferred = ref(props.initialSize);
const dragging = ref(false);
let observer: ResizeObserver | undefined;
let startCoordinate = 0;
let startSize = 0;
const first = computed(() => clampSplit(
  props.fromEnd ? available.value - preferred.value : preferred.value,
  available.value, props.minFirst, props.minSecond,
));
const percent = (value: number) => available.value ? Math.round(value / available.value * 100) : 0;
const bounds = computed(() => splitBounds(available.value, props.minFirst, props.minSecond));
const tracks = computed(() => ({
  [props.axis === "columns" ? "gridTemplateColumns" : "gridTemplateRows"]:
    `${first.value}px 8px minmax(0, 1fr)`,
}));

function setFirst(value: number) {
  const clamped = clampSplit(value, available.value, props.minFirst, props.minSecond);
  preferred.value = props.fromEnd ? available.value - clamped : clamped;
}
function start(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.focus();
  handle.setPointerCapture(event.pointerId);
  startCoordinate = props.axis === "columns" ? event.clientX : event.clientY;
  startSize = first.value;
  dragging.value = true;
}
function move(event: PointerEvent) {
  if (!dragging.value) return;
  const coordinate = props.axis === "columns" ? event.clientX : event.clientY;
  setFirst(startSize + coordinate - startCoordinate);
}
function end(event: PointerEvent) {
  dragging.value = false;
  const handle = event.currentTarget as HTMLElement;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
}
function onKey(event: KeyboardEvent) {
  const decrease = props.axis === "columns" ? "ArrowLeft" : "ArrowUp";
  const increase = props.axis === "columns" ? "ArrowRight" : "ArrowDown";
  if (![decrease, increase, "Home", "End", "Enter"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Enter") preferred.value = props.initialSize;
  else if (event.key === "Home") setFirst(bounds.value[0]);
  else if (event.key === "End") setFirst(bounds.value[1]);
  else setFirst(first.value + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 40 : 16));
}
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    available.value = Math.max(0, (props.axis === "columns" ? entry.contentRect.width : entry.contentRect.height) - 8);
  });
  if (container.value) observer.observe(container.value);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="container" class="split-pane" :class="{ 'is-dragging': dragging }" :style="tracks">
    <div class="split-content"><slot name="first" /></div>
    <div
      class="split-handle" :class="axis" role="separator" tabindex="0"
      :aria-label="label" :title="label"
      :aria-orientation="axis === 'columns' ? 'vertical' : 'horizontal'"
      :aria-valuenow="percent(first)" :aria-valuemin="percent(bounds[0])" :aria-valuemax="percent(bounds[1])"
      @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end"
      @lostpointercapture="dragging = false" @keydown="onKey" @dblclick="preferred = initialSize"
    ><span /></div>
    <div class="split-content"><slot name="second" /></div>
  </div>
</template>

<style scoped>
.split-pane { display: grid; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
:global(.dark) .split-pane { color-scheme: dark; }
.split-content { min-width: 0; min-height: 0; overflow: hidden; }
.is-dragging { user-select: none; }
.split-handle { display: flex; align-items: center; justify-content: center; touch-action: none; border-radius: 4px; outline: none; }
.split-handle.columns { cursor: col-resize; }
.split-handle.rows { cursor: row-resize; }
.split-handle span { background: #a3a3a3; border-radius: 2px; opacity: .55; }
.columns span { width: 2px; height: 32px; }
.rows span { height: 2px; width: 32px; }
.split-handle:hover, .split-handle:focus-visible, .is-dragging > .split-handle { background: #3b82f61a; }
.split-handle:hover span, .split-handle:focus-visible span { background: #2563eb; opacity: 1; }
.split-handle:focus-visible { box-shadow: inset 0 0 0 1px #3b82f6; }
</style>
