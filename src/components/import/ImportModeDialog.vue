<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { t } from "../../lib/i18n";

const emit = defineEmits<{
  choose: [mode: "replace" | "merge"];
  cancel: [];
}>();

const dialog = ref<HTMLElement | null>(null);

onMounted(async () => {
  await nextTick();
  dialog.value?.focus();
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    emit("cancel");
    return;
  }
  if (event.key !== "Tab") return;
  const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  if (buttons.length === 0) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-import-mode-dialog>
    <div
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-mode-title"
      tabindex="-1"
      class="w-full max-w-md rounded-lg border border-neutral-300 bg-white p-5 shadow-xl outline-none dark:border-neutral-600 dark:bg-neutral-800"
      @keydown="onKeydown"
    >
      <div class="mb-3 flex items-start gap-3">
        <h2 id="import-mode-title" class="min-w-0 flex-1 text-base font-bold">{{ t("importConfirmTitle") }}</h2>
        <button
          type="button"
          class="rounded px-1.5 text-xl leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-700 dark:hover:text-white"
          :aria-label="t('cancelImport')"
          :title="t('cancelImport')"
          @click="emit('cancel')"
        >×</button>
      </div>
      <p class="whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{{ t("importConfirmMessage") }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 dark:border-red-800 dark:hover:bg-red-900/30"
          @click="emit('choose', 'replace')"
        >{{ t("replace") }}</button>
        <button
          type="button"
          class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          @click="emit('choose', 'merge')"
        >{{ t("merge") }}</button>
      </div>
    </div>
  </div>
</template>
