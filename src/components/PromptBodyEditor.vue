<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { highlightTemplate, templateBlockRanges } from "../lib/template-highlight";

const props = defineProps<{ modelValue: string; placeholder: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const value = computed({ get: () => props.modelValue, set: value => emit("update:modelValue", value) });
const highlights = computed(() => highlightTemplate(props.modelValue));
const input = ref<HTMLTextAreaElement | null>(null);
const backdrop = ref<HTMLElement | null>(null);
const blockLayer = ref<HTMLElement | null>(null);
const blockRects = ref<Array<{ top: number; height: number }>>([]);
const composing = ref(false);
let observer: ResizeObserver | undefined;

function syncScroll() {
  if (!input.value || !backdrop.value) return;
  backdrop.value.style.width = `${input.value.clientWidth}px`;
  backdrop.value.style.transform = `translate(${-input.value.scrollLeft}px, ${-input.value.scrollTop}px)`;
  if (blockLayer.value) {
    blockLayer.value.style.width = backdrop.value.style.width;
    blockLayer.value.style.transform = backdrop.value.style.transform;
  }
}

function updateLayout() {
  syncScroll();
  const pre = backdrop.value;
  if (!pre) return;
  const ranges = templateBlockRanges(props.modelValue);
  if (!ranges.length) { blockRects.value = []; return; }
  // Measure the rendered text, so backgrounds include wrapped lines without
  // inserting block elements that could move the native textarea's caret.
  let offset = 0;
  const nodes = [...pre.querySelectorAll<HTMLElement>("[data-syntax]")].map(span => {
    const start = offset;
    offset += span.textContent?.length ?? 0;
    return { node: span.firstChild!, start, end: offset };
  });
  const style = getComputedStyle(pre);
  const lineHeight = parseFloat(style.lineHeight);
  const padding = parseFloat(style.paddingTop);
  const origin = pre.getBoundingClientRect().top + padding;
  const lineAt = (index: number) => {
    const part = nodes.find(part => index >= part.start && index < part.end)!;
    const range = document.createRange();
    range.setStart(part.node, index - part.start);
    range.setEnd(part.node, index - part.start + 1);
    return Math.max(0, Math.floor((range.getBoundingClientRect().top - origin) / lineHeight + 0.01));
  };
  blockRects.value = ranges.map(range => {
    const first = lineAt(range.start);
    const last = lineAt(range.end - 1);
    return { top: padding + first * lineHeight, height: (last - first + 1) * lineHeight };
  });
}
watch(value, () => void nextTick(updateLayout));
onMounted(() => {
  observer = new ResizeObserver(updateLayout);
  if (input.value) observer.observe(input.value);
  updateLayout();
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div data-template-editor class="template-editor min-h-0 flex-1 rounded-md border border-neutral-300 focus-within:border-blue-400 dark:border-neutral-600 dark:focus-within:border-blue-400" :class="{ composing }">
    <div aria-hidden="true" class="template-backdrop">
      <div ref="blockLayer" class="template-block-layer">
        <div v-for="(block, index) in blockRects" :key="index" data-template-module class="template-module-highlight" :style="{ top: `${block.top}px`, height: `${block.height}px` }" />
      </div>
      <pre ref="backdrop" data-template-highlights class="template-text"><span v-for="(part, index) in highlights" :key="index" :data-syntax="part.kind">{{ part.text }}</span>{{ '\n' }}</pre>
    </div>
    <textarea
      ref="input" v-model="value" data-manager-field :placeholder="placeholder" :aria-label="label"
      class="template-input template-text" spellcheck="false"
      @scroll="syncScroll" @compositionstart="composing = true" @compositionend="composing = false"
    />
  </div>
</template>

<style>
.template-editor { position: relative; overflow: hidden; background: white; }
.template-backdrop { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.template-block-layer { position: absolute; inset: 0; }
.template-module-highlight { position: absolute; left: 0; right: 0; background: #f5f9f7; }
.template-editor pre.template-text { position: relative; }
.template-editor .template-text {
  box-sizing: border-box; margin: 0; border: 0; padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 14px; font-weight: 400; line-height: 1.625; letter-spacing: normal;
  white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4;
}
.template-editor textarea.template-input {
  position: relative; display: block; width: 100%; height: 100%; resize: none;
  outline: none; background: transparent; color: transparent; caret-color: #171717; box-shadow: none;
}
.template-input::placeholder { color: #a3a3a3; }
.template-input::selection { background: rgb(147 197 253 / 45%); }
.template-editor [data-syntax="variable"] { color: #1d4f91; }
.template-editor [data-syntax="reference"],
.template-editor [data-syntax="definition"] { color: #34786e; }
.template-editor.composing .template-backdrop { visibility: hidden; }
.template-editor.composing .template-input { color: #171717; }
.dark .template-editor { background: #1d212a; }
.dark .template-editor .template-input { caret-color: #edf1f7; }
.dark .template-input::placeholder { color: #737d90; }
.dark .template-editor.composing .template-input { color: #edf1f7; }
.dark .template-editor .template-module-highlight { background: #202a2d; }
.dark .template-editor [data-syntax="variable"] { color: #afcdff; }
.dark .template-editor [data-syntax="reference"],
.dark .template-editor [data-syntax="definition"] { color: #a0d5c6; }
@media (forced-colors: active) {
  .template-backdrop { display: none; }
  .template-editor textarea.template-input { color: CanvasText; caret-color: CanvasText; }
}
</style>
