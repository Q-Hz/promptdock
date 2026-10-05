<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { FOLDER_COLORS, FOLDER_ICONS, defaultAppearance, normalizeAppearance, type FolderAppearance } from "../../lib/folder-appearance";
import { resolvedLanguage, t } from "../../lib/i18n";
import FolderIcon from "./FolderIcon.vue";

const props = defineProps<{ sectionKey: string; title: string; appearance: FolderAppearance; busy: boolean; error: string }>();
const emit = defineEmits<{ save: [value: FolderAppearance]; cancel: [] }>();
const draft = ref(normalizeAppearance(props.appearance, props.sectionKey));
const dialog = ref<HTMLElement | null>(null);
const origin = document.activeElement as HTMLElement | null;
const colorNames = computed(() => t("folderIconColors").split(","));
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation(); event.preventDefault();
    if (!props.busy) emit("cancel");
  }
  if (event.key !== "Tab") return;
  const buttons = [...(dialog.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => { await nextTick(); dialog.value?.querySelector<HTMLButtonElement>("button[aria-pressed='true']")?.focus(); });
onUnmounted(() => { origin?.focus({ preventScroll: true }); });
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" @pointerdown.self="!busy && emit('cancel')" @keydown="onKeydown">
      <div ref="dialog" role="dialog" aria-modal="true" aria-labelledby="folder-icon-title" data-folder-icon-picker class="flex max-h-[85vh] w-[360px] max-w-full flex-col rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xl dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100" :aria-busy="busy">
        <h2 id="folder-icon-title" class="mb-3 truncate text-sm font-medium">{{ t('changeFolderIcon') }} · {{ title }}</h2>
        <div class="min-h-0 overflow-y-auto">
          <div class="mb-4 flex justify-between gap-1" role="group" :aria-label="t('folderIconColor')">
            <button v-for="(color, index) in FOLDER_COLORS" :key="color" type="button" :disabled="busy" :aria-label="colorNames[index]" :title="colorNames[index]" :aria-pressed="draft.color === color" class="flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" :class="draft.color === color ? 'ring-2 ring-neutral-300 dark:ring-neutral-500' : ''" @click="draft.color = color">
              <span class="h-6 w-6 rounded-full" :class="color === 'default' ? 'bg-neutral-800 dark:bg-neutral-200' : ''" :style="color === 'default' ? undefined : { backgroundColor: color }" />
            </button>
          </div>
          <div class="grid grid-cols-8 gap-1" role="group" :aria-label="t('folderIconShape')">
            <button v-for="icon in FOLDER_ICONS" :key="icon.id" type="button" :disabled="busy" :aria-label="resolvedLanguage === 'zh' ? icon.zh : icon.en" :title="resolvedLanguage === 'zh' ? icon.zh : icon.en" :aria-pressed="draft.icon === icon.id" :data-icon-id="icon.id" class="flex h-9 items-center justify-center rounded-md hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-700" :class="draft.icon === icon.id ? 'bg-neutral-100 ring-1 ring-neutral-300 dark:bg-neutral-700 dark:ring-neutral-500' : ''" @click="draft.icon = icon.id">
              <FolderIcon :appearance="{ icon: icon.id, color: draft.color }" />
            </button>
          </div>
          <div class="mt-4 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400" :aria-label="t('folderIconPreview')">
            <FolderIcon :appearance="draft" /><FolderIcon :appearance="draft" expanded />
            <span>{{ t('folderIconPreview') }}</span>
          </div>
          <p v-if="error" role="alert" class="mt-2 text-xs text-red-600 dark:text-red-400">{{ error }}</p>
        </div>
        <div class="mt-4 flex items-center gap-2 text-xs">
          <button type="button" :disabled="busy" class="mr-auto rounded px-2 py-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700" @click="draft = defaultAppearance(sectionKey)">{{ t('restoreFolderIcon') }}</button>
          <button type="button" :disabled="busy" class="rounded px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="emit('cancel')">{{ t('cancel') }}</button>
          <button type="button" :disabled="busy" class="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900" @click="emit('save', { ...draft })">{{ t('folderIconDone') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
