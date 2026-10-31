<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { buildManagerPreview } from "../lib/manager-preview";
import { t } from "../lib/i18n";

const props = defineProps<{ source: string }>();
const preview = computed(() => buildManagerPreview(props.source));
const tooltip = ref<{ text: string; left: number; top: number } | null>(null);
const tooltipElement = ref<HTMLElement | null>(null);
let hideTimer: number | undefined;
let anchor: HTMLElement | null = null;

function hide() { tooltip.value = null; anchor = null; }
function deferHide() { hideTimer = window.setTimeout(hide, 120); }
function keep() { window.clearTimeout(hideTimer); }
async function show(event: MouseEvent | FocusEvent) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-preview-token]") : null;
  if (!target) return;
  keep();
  const rect = target.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  anchor = target;
  tooltip.value = {
    text: preview.value.hints[Number(target.dataset.previewToken)],
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    top: rect.bottom + 6,
  };
  await nextTick();
  if (anchor !== target || !tooltip.value || !tooltipElement.value) return;
  const height = tooltipElement.value.getBoundingClientRect().height;
  tooltip.value.top = Math.max(12, Math.min(
    rect.bottom + height + 18 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6,
    window.innerHeight - height - 12,
  ));
}
function onOut(event: MouseEvent | FocusEvent) {
  const related = event.relatedTarget;
  if (related instanceof Element && (related.closest("[data-preview-token]") || tooltipElement.value?.contains(related))) return;
  deferHide();
}
function onClick(event: MouseEvent) {
  if ((event.target as Element).closest("a")) event.preventDefault();
}
function onKey(event: KeyboardEvent) {
  if (event.key === "Escape" && tooltip.value) {
    hide();
    event.stopPropagation();
  }
}
watch(preview, hide);
onMounted(() => window.addEventListener("resize", hide));
onUnmounted(() => { keep(); window.removeEventListener("resize", hide); });
</script>

<template>
  <div id="manager-body-preview" data-manager-preview data-markdown-preview tabindex="0" role="region" :aria-label="t('managerPreviewBody')"
    class="manager-body-preview min-h-0 flex-1 overflow-auto rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-600 dark:bg-[#1d212a]"
    @mouseover="show" @mouseout="onOut" @focusin="show" @focusout="onOut" @scroll="hide" @click="onClick" @auxclick="onClick" @keydown="onKey">
    <div v-if="preview.html" v-html="preview.html" />
    <p v-else-if="!preview.groups.length" class="text-neutral-400">{{ t('managerPreviewEmpty') }}</p>
    <section v-if="preview.groups.length" data-preview-definitions class="manager-preview-definitions">
      <section v-for="(group, index) in preview.groups" :key="index" data-preview-group class="manager-preview-group">
        <h3>{{ group.name }}</h3>
        <article v-for="(option, optionIndex) in group.options" :key="optionIndex" data-preview-option class="manager-preview-option">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="font-medium">{{ option.title }}</span>
            <span :data-default-enabled="option.checked" class="text-xs text-neutral-500 dark:text-neutral-400">{{ t(option.checked ? 'managerPreviewEnabled' : 'managerPreviewDisabled') }}</span>
          </div>
          <div v-html="option.html" />
        </article>
      </section>
    </section>
  </div>
  <Teleport to="body">
    <div v-if="tooltip" ref="tooltipElement" data-manager-preview-tooltip role="tooltip" class="manager-preview-tooltip"
      :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }" @mouseenter="keep" @mouseleave="deferHide">{{ tooltip.text }}</div>
  </Teleport>
</template>

<style>
.manager-body-preview:focus-visible { outline: 2px solid #60a5fa; outline-offset: -2px; }
.manager-preview-token { color: #1d4f91; background: #eef4fc; border-radius: 3px; padding: 0.08em 0; cursor: help; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.manager-preview-token[data-preview-kind="reference"] { color: #34786e; background: #edf6f2; }
.manager-preview-token[data-preview-kind="missing"] { color: #a33b26; background: #fff1ec; }
.manager-preview-token:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
[data-markdown-preview] .manager-preview-definitions { margin-top: 1.8em; padding-top: 0.4em; border-top: 1px solid #d7dce5; }
.manager-preview-group { margin-top: 1.2em; padding-left: 12px; border-left: 2px solid #b7d8cd; }
[data-markdown-preview] .manager-preview-group > h3 { color: #34786e; font-size: 1em; }
.manager-preview-option { margin-top: 0.9em; }
.manager-preview-tooltip { position: fixed; z-index: 100; width: min(420px, calc(100vw - 24px)); max-height: min(280px, calc(100vh - 24px)); overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; background: #fff; color: #334155; box-shadow: 0 5px 18px rgb(15 23 42 / 14%); font-size: 12px; line-height: 1.65; }
.dark .manager-preview-token { color: #afcdff; background: #253449; }
.dark .manager-preview-token[data-preview-kind="reference"] { color: #a0d5c6; background: #233833; }
.dark .manager-preview-token[data-preview-kind="missing"] { color: #ffb5a4; background: #442b27; }
.dark [data-markdown-preview] .manager-preview-definitions { border-color: #3a4251; }
.dark .manager-preview-group { border-color: #3b665b; }
.dark [data-markdown-preview] .manager-preview-group > h3 { color: #a0d5c6; }
.dark .manager-preview-tooltip { background: #272e3b; color: #e1e6ef; border-color: #536075; }
</style>
