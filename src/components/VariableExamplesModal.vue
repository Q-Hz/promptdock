<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { t } from "../lib/i18n";

const emit = defineEmits<{ (event: "close"): void }>();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (controls.length === 0) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => void nextTick(() => closeButton.value?.focus()));
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <section ref="dialog" data-variable-examples class="flex max-h-full w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-800" role="dialog" aria-modal="true" aria-labelledby="variable-examples-title" @keydown="onKeydown">
      <header class="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
        <div>
          <h2 id="variable-examples-title" class="text-lg font-bold">{{ t("variableExamplesTitle") }}</h2>
          <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{{ t("variableExamplesIntro") }}</p>
        </div>
        <button ref="closeButton" type="button" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="emit('close')">{{ t("close") }}</button>
      </header>
      <div class="min-h-0 overflow-y-auto p-5">
        <div class="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
          <div class="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <span>{{ t("variableExampleSyntax") }}</span><span>{{ t("variableExampleResult") }}</span>
          </div>
          <div v-for="kind in ['Plain', 'Default', 'Select', 'Multi']" :key="kind" class="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 border-t border-neutral-200 px-4 py-3 text-sm dark:border-neutral-700">
            <code class="whitespace-pre-wrap font-mono text-[13px] leading-5 text-blue-700 dark:text-blue-300">{{ t((`variableExample${kind}Code`) as any) }}</code>
            <span v-if="kind === 'Default'" class="leading-5 text-neutral-600 dark:text-neutral-300">
              {{ t("variableExampleDefaultResultBefore") }}<code class="rounded bg-neutral-100 px-1 font-mono text-[13px] text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">{{ t("variableExampleDefaultValue") }}</code>{{ t("variableExampleDefaultResultAfter") }}
            </span>
            <span v-else class="leading-5 text-neutral-600 dark:text-neutral-300">{{ t((`variableExample${kind}Result`) as any) }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
