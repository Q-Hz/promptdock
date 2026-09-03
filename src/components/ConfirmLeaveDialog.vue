<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { confirmDialog, settleConfirmDialog, type DialogChoice, type DiscardChoice } from "../lib/confirm-dialog";
import { t } from "../lib/i18n";

const root = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function choose(choice: DialogChoice | DiscardChoice) {
  const shouldRestore = choice === "cancel" || choice === "continue";
  settleConfirmDialog(choice);
  if (shouldRestore) {
    void nextTick(() => previouslyFocused?.focus());
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    // Esc 取非破坏性选项：未保存确认 → 取消；放弃比较 → 继续处理
    choose(confirmDialog.mode === "unsaved" ? "cancel" : "continue");
    return;
  }
  if (e.key === "Tab") {
    const focusable = Array.from(root.value?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (focusable.length === 0) {
      e.preventDefault();
      root.value?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root.value)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(
  () => confirmDialog.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      root.value?.focus();
    }
  }
);
</script>

<template>
  <div
    v-if="confirmDialog.open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
  >
    <div
      ref="root"
      role="alertdialog"
      aria-modal="true"
      :aria-label="confirmDialog.mode === 'unsaved' ? t('unsavedDialogTitle') : t('discardReviewTitle')"
      tabindex="-1"
      class="w-[420px] rounded-lg border border-neutral-300 bg-white p-5 shadow-xl outline-none dark:border-neutral-600 dark:bg-neutral-800"
      @keydown="onKeydown"
    >
      <h2 class="mb-2 text-base font-bold">
        {{ confirmDialog.mode === "unsaved" ? t("unsavedDialogTitle") : t("discardReviewTitle") }}
      </h2>
      <p class="mb-4 whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300">
        {{ confirmDialog.mode === "unsaved" ? t("unsavedDialogMessage") : t("discardReviewMessage") }}
      </p>
      <div class="flex justify-end gap-2">
        <template v-if="confirmDialog.mode === 'unsaved'">
          <button
            class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
            @click="choose('cancel')"
          >{{ t("cancel") }}</button>
          <button
            class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
            @click="choose('discard')"
          >{{ t("discardChanges") }}</button>
          <button
            class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
            @click="choose('save')"
          >{{ t("saveAndContinue") }}</button>
        </template>
        <template v-else>
          <button
            class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
            @click="choose('continue')"
          >{{ t("continueReviewing") }}</button>
          <button
            class="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
            @click="choose('discard')"
          >{{ t("discardAndExit") }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
