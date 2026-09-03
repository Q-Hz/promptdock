<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { clampSplit, clampTo, splitBounds } from "../../lib/split-pane";

const props = withDefaults(defineProps<{
  axis: "columns" | "rows";
  label: string;
  initialSize: number;
  fromEnd?: boolean;
  minFirst?: number;
  minSecond?: number;
  // 第一栏占可用空间的比例上限，用于“左侧不超过可用宽度 45%”这类约束
  maxFirstRatio?: number;
  // 受控模式：传入 null 表示使用默认尺寸，数值按 unit 解释
  modelValue?: number | null;
  unit?: "px" | "ratio";
  // ratio 模式下把默认比例夹到可用的像素区间（如默认 28% 限制在 240–420px）
  defaultMin?: number;
  defaultMax?: number;
  secondCollapsed?: boolean;
}>(), {
  fromEnd: false,
  minFirst: 120,
  minSecond: 120,
  maxFirstRatio: 1,
  modelValue: undefined,
  unit: "px",
  defaultMin: 0,
  defaultMax: Number.POSITIVE_INFINITY,
  secondCollapsed: false,
});

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const container = ref<HTMLElement | null>(null);
const available = ref(0);
const uncontrolled = ref(props.initialSize);
const dragging = ref(false);
let observer: ResizeObserver | undefined;
let startCoordinate = 0;
let startSize = 0;

const isControlled = computed(() => props.modelValue !== undefined);

// 默认尺寸：ratio 模式按比例换算后再夹到像素区间，窗口缩放时重新计算
const defaultSize = computed(() => {
  const base = props.unit === "ratio" ? props.initialSize * available.value : props.initialSize;
  return clampTo(base, props.defaultMin, props.defaultMax);
});

const preferredSize = computed<number>(() => {
  const value = props.modelValue;
  if (value === undefined) return uncontrolled.value;
  if (value === null) return defaultSize.value;
  return props.unit === "ratio" ? value * available.value : value;
});

const first = computed(() => clampSplit(
  props.fromEnd ? available.value - preferredSize.value : preferredSize.value,
  available.value, props.minFirst, props.minSecond, props.maxFirstRatio,
));
const percent = (value: number) => available.value ? Math.round(value / available.value * 100) : 0;
const bounds = computed(() => splitBounds(
  available.value, props.minFirst, props.minSecond, props.maxFirstRatio,
));
const tracks = computed(() => ({
  [props.axis === "columns" ? "gridTemplateColumns" : "gridTemplateRows"]:
    props.secondCollapsed ? "minmax(0, 1fr) 0px 0px" : `${first.value}px 8px minmax(0, 1fr)`,
}));

function publish(firstPane: number) {
  const own = props.fromEnd ? available.value - firstPane : firstPane;
  if (!isControlled.value) {
    uncontrolled.value = own;
    return;
  }
  const value = props.unit === "ratio"
    ? (available.value > 0 ? own / available.value : 0)
    : own;
  emit("update:modelValue", value);
}

function setFirst(value: number) {
  publish(clampSplit(value, available.value, props.minFirst, props.minSecond, props.maxFirstRatio));
}

function reset() {
  publish(clampSplit(
    props.fromEnd ? available.value - defaultSize.value : defaultSize.value,
    available.value, props.minFirst, props.minSecond, props.maxFirstRatio,
  ));
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
  if (event.key === "Enter") reset();
  else if (event.key === "Home") setFirst(bounds.value[0]);
  else if (event.key === "End") setFirst(bounds.value[1]);
  else setFirst(first.value + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 40 : 16));
}
onMounted(() => {
  // 首帧同步测量，避免观察器回调前把第一栏渲染成 0
  const element = container.value;
  if (element) {
    const style = getComputedStyle(element);
    const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    available.value = Math.max(0, (props.axis === "columns" ? width : height) - 8);
  }
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
      v-if="!secondCollapsed"
      class="split-handle" :class="axis" role="separator" tabindex="0"
      :aria-label="label" :title="label"
      :aria-orientation="axis === 'columns' ? 'vertical' : 'horizontal'"
      :aria-valuenow="percent(first)" :aria-valuemin="percent(bounds[0])" :aria-valuemax="percent(bounds[1])"
      @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end"
      @lostpointercapture="dragging = false" @keydown="onKey" @dblclick="reset"
    ><span /></div>
    <div v-show="!secondCollapsed" class="split-content"><slot name="second" /></div>
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
