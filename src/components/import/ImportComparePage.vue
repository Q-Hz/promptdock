<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { api, type ImportAction, type ImportPrecheck } from "../../lib/api";
import { shortId } from "../../lib/compare";
import { openDiscardDialog } from "../../lib/confirm-dialog";
import { resolvedLanguage, t } from "../../lib/i18n";
import BodyDiff from "./BodyDiff.vue";
import ResizableSplit from "./ResizableSplit.vue";

const props = defineProps<{ precheck: ImportPrecheck; busy?: boolean }>();
const emit = defineEmits<{
  confirm: [decisions: Array<{ importedId: string; action: ImportAction; targetLocalId: string | null }>];
  cancel: [];
}>();

interface Choice {
  action: ImportAction | null;
  targetLocalId: string | null;
}

const conflictItems = computed(() => props.precheck.items.filter((i) => i.kind === "conflict"));
const currentIndex = ref(0);
const root = ref<HTMLElement | null>(null);
const copiedCandidateId = ref<string | null>(null);
const current = computed(() => conflictItems.value[currentIndex.value]);

// 选择草稿（未确认）与已确认的临时选择（PRD 7.5）
const drafts = ref(new Map<string, Choice>());
const saved = ref(new Map<string, Choice>());

const currentChoice = computed<Choice>(() => {
  const id = current.value.imported.id;
  return (
    drafts.value.get(id) ??
    saved.value.get(id) ?? { action: null, targetLocalId: null }
  );
});

const hasMultipleCandidates = computed(() => current.value.candidates.length > 1);
const selectedTarget = computed(() =>
  current.value.candidates.find((c) => c.id === currentChoice.value.targetLocalId) ?? null
);
const localShown = computed(() =>
  hasMultipleCandidates.value ? selectedTarget.value : current.value.candidates[0] ?? null
);

const processedCount = computed(() => saved.value.size);

const targetConflict = computed(() => {
  const targets = new Set<string>();
  for (const choice of saved.value.values()) {
    if (choice.action === "use_imported" && choice.targetLocalId) {
      if (targets.has(choice.targetLocalId)) return true;
      targets.add(choice.targetLocalId);
    }
  }
  return false;
});

const allProcessed = computed(() =>
  conflictItems.value.every((i) => saved.value.has(i.imported.id))
);

const canConfirm = computed(() => allProcessed.value && !targetConflict.value && !props.busy);

const canSaveChoice = computed(() => {
  const choice = currentChoice.value;
  if (!choice.action) return false;
  if (choice.action === "use_imported" && !choice.targetLocalId) return false;
  return true;
});

function touchDraft(updater: (draft: Choice) => Choice) {
  if (props.busy) return;
  const id = current.value.imported.id;
  const base = drafts.value.get(id) ?? saved.value.get(id) ?? { action: null, targetLocalId: null };
  const next = updater({ ...base });
  drafts.value.set(id, next);
  drafts.value = new Map(drafts.value);
  // 修改已处理项（含更换更新目标）后立即恢复为未处理（PRD 7.5 / AC-17A / AC-22D）
  const confirmed = saved.value.get(id);
  if (confirmed && (confirmed.action !== next.action || confirmed.targetLocalId !== next.targetLocalId)) {
    saved.value.delete(id);
    saved.value = new Map(saved.value);
  }
}

function chooseAction(action: ImportAction) {
  touchDraft((draft) => {
    // 单候选时“使用导入版本”目标唯一，直接确定；多候选保持未选状态
    const target =
      action === "use_imported"
        ? draft.targetLocalId ?? (hasMultipleCandidates.value ? null : current.value.candidates[0]?.id ?? null)
        : null;
    return { action, targetLocalId: target };
  });
}

function chooseTarget(id: string) {
  touchDraft((draft) => ({ ...draft, targetLocalId: id || null }));
}

async function copyCandidateId(id: string) {
  const value = shortId(id, candidatePeers.value);
  await api.copyText(value);
  copiedCandidateId.value = id;
  window.setTimeout(() => {
    if (copiedCandidateId.value === id) copiedCandidateId.value = null;
  }, 1500);
}

function saveChoice() {
  if (!canSaveChoice.value || props.busy) return;
  const id = current.value.imported.id;
  saved.value.set(id, { ...currentChoice.value });
  drafts.value.delete(id);
  saved.value = new Map(saved.value);
  drafts.value = new Map(drafts.value);
  // 打开下一条未处理项；最后一条停留当前页（PRD 7.5）
  const nextIndex = conflictItems.value.findIndex(
    (item, i) => i !== currentIndex.value && !saved.value.has(item.imported.id)
  );
  if (nextIndex >= 0) currentIndex.value = nextIndex;
}

function gotoItem(index: number) {
  if (props.busy) return;
  if (index >= 0 && index < conflictItems.value.length) currentIndex.value = index;
}

// 预检查结果被替换（stale 后重新预检查）时回到第一条
watch(
  () => props.precheck,
  () => {
    currentIndex.value = 0;
    drafts.value = new Map();
    saved.value = new Map();
    void nextTick(() => root.value?.focus());
  }
);

onMounted(() => {
  void nextTick(() => root.value?.focus());
});

function prevItem() {
  gotoItem(currentIndex.value - 1);
}

function confirmImport() {
  if (!canConfirm.value) return;
  const decisions = conflictItems.value
    .map((item) => {
      const choice = saved.value.get(item.imported.id);
      if (!choice?.action) return null;
      return {
        importedId: item.imported.id,
        action: choice.action,
        targetLocalId: choice.targetLocalId,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  emit("confirm", decisions);
}

const hasAnyProgress = () => drafts.value.size > 0 || saved.value.size > 0;

async function cancelImport() {
  if (props.busy) return;
  // 尚未处理任何项目时立即退出；否则确认放弃（PRD 7.6）
  if (hasAnyProgress()) {
    const choice = await openDiscardDialog();
    if (choice !== "discard") return;
  }
  emit("cancel");
}

// Esc 在比较页面执行“取消导入”语义（PRD 10.2）
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    cancelImport();
  }
}

const fieldRow = (label: string, left: string, right: string) => ({
  label,
  left,
  right,
  same: left === right,
});

const fieldRows = computed(() => {
  const local = localShown.value;
  const imported = current.value.imported;
  if (!local) return [];
  return [
    fieldRow(t("fieldTitle"), local.title, imported.title),
    fieldRow(t("fieldTags"), local.tags.join(", "), imported.tags.join(", ")),
    fieldRow(t("fieldFolder"), local.folder, imported.folder),
    fieldRow(t("fieldFavorite"), local.favorite ? t("favoriteYes") : t("favoriteNo"), imported.favorite ? t("favoriteYes") : t("favoriteNo")),
  ];
});

const candidatePeers = computed(() => current.value.candidates.map((c) => c.id));

defineExpose({ hasAnyProgress });
</script>

<template>
  <div ref="root" tabindex="-1" class="flex h-full min-h-0 flex-col outline-none" @keydown="onKeydown">
    <!-- 头部：计数 + 操作 -->
    <header class="flex items-center gap-3 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
      <div class="mr-auto">
        <h2 class="text-base font-bold">{{ t("resolveImportConflicts") }}</h2>
        <p class="text-[11px] text-neutral-400">
          {{ t("autoAppended", { count: precheck.newCount }) }} ·
          {{ t("autoSkipped", { count: precheck.identicalCount }) }} ·
          {{ t("pendingItems", { count: conflictItems.length }) }}
        </p>
      </div>
      <button
        class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
        :disabled="busy"
        @click="cancelImport"
      >{{ t("cancelImport") }}</button>
      <button
        class="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canConfirm"
        @click="confirmImport"
      >{{ busy ? t("importing") : t("confirmImport") }}</button>
    </header>

    <div class="min-h-0 flex-1" :inert="busy ? true : undefined">
      <ResizableSplit axis="columns" :label="t('resizeConflictList')" :initial-size="264" :min-first="180" :min-second="520">
        <template #first>
          <!-- 左侧：待比较列表 -->
          <aside class="flex h-full min-h-0 flex-col">
            <div class="px-3 py-2 text-xs text-neutral-500">
              {{ t("processedProgress", { done: processedCount, total: conflictItems.length }) }}
            </div>
            <div class="flex-1 overflow-y-auto px-2 pb-2">
              <button
                v-for="(item, i) in conflictItems"
                :key="item.imported.id"
                class="mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm"
                :class="i === currentIndex ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
                @click="gotoItem(i)"
              >
                <span class="shrink-0 text-[11px]" :aria-label="saved.has(item.imported.id) ? t('processedItem') : t('unprocessedItem')">
                  {{ saved.has(item.imported.id) ? "●" : "○" }}
                </span>
                <span class="truncate">{{ item.imported.title }}</span>
                <span class="ml-auto shrink-0 text-[10px] uppercase tracking-wide opacity-70">
                  {{ saved.has(item.imported.id) ? t("processedItem") : t("unprocessedItem") }}
                </span>
              </button>
            </div>
          </aside>
        </template>

        <!-- 右侧：比较区 -->
        <template #second>
          <main class="h-full min-h-0 min-w-0 p-3">
            <ResizableSplit axis="rows" :label="t('resizeMetadata')" :initial-size="150" :min-first="96" :min-second="300">
              <template #first>
                <section class="h-full overflow-auto pr-1">
                  <!-- 多候选选择器 -->
                  <div v-if="hasMultipleCandidates" class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-900/20">
                    <fieldset>
                      <legend class="mb-2 font-medium">{{ t("selectUpdateTarget") }}</legend>
                      <div class="space-y-2">
                        <div
                          v-for="c in current.candidates"
                          :key="c.id"
                          class="flex items-start gap-2 rounded-md border bg-white/70 p-2 dark:bg-neutral-800/60"
                          :class="currentChoice.targetLocalId === c.id ? 'border-blue-500' : 'border-neutral-300 dark:border-neutral-600'"
                        >
                          <label class="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                            <input
                              type="radio"
                              name="import-target"
                              class="mt-1"
                              :checked="currentChoice.targetLocalId === c.id"
                              @change="chooseTarget(c.id)"
                            />
                            <span class="min-w-0">
                              <span class="block font-medium">{{ c.title }}</span>
                              <span class="block break-words text-xs text-neutral-500">
                                {{ t("fieldFolder") }}: {{ c.folder || t("uncategorized") }} ·
                                {{ t("fieldTags") }}: {{ c.tags.join(", ") || "—" }}
                              </span>
                              <span class="block text-xs text-neutral-500">
                                {{ t("createdAtRef") }}: {{ new Date(c.createdAt).toLocaleString() }} ·
                                {{ t("updatedAtRef") }}: {{ new Date(c.updatedAt).toLocaleString() }}
                              </span>
                              <span class="block font-mono text-xs text-neutral-500">ID: {{ shortId(c.id, candidatePeers) }}</span>
                            </span>
                          </label>
                          <button
                            type="button"
                            class="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-600"
                            @click="copyCandidateId(c.id)"
                          >{{ copiedCandidateId === c.id ? t("shortIdCopied") : t("copyShortId") }}</button>
                        </div>
                      </div>
                    </fieldset>
                    <p v-if="currentChoice.action === 'use_imported' && !currentChoice.targetLocalId" class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      {{ t("targetNotSelected") }}
                    </p>
                  </div>

                  <!-- 并排字段比较 -->
                  <div v-if="localShown" class="grid grid-cols-2 gap-3">
                    <div class="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-x-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        {{ t("localVersion") }}
                        <span class="normal-case">{{ t("updatedAtRef") }}: {{ new Date(localShown.updatedAt).toLocaleString() }}</span>
                      </div>
                      <dl class="space-y-1 text-sm">
                        <div v-for="row in fieldRows" :key="row.label" class="flex items-baseline justify-between gap-2">
                          <dt class="shrink-0 text-neutral-400">{{ row.label }}</dt>
                          <dd class="min-w-0 break-all text-right font-medium">{{ row.left || "—" }}</dd>
                        </div>
                      </dl>
                    </div>
                    <div class="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-x-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        {{ t("importedVersion") }}
                        <span class="normal-case">{{ t("updatedAtRef") }}: {{ new Date(current.imported.updatedAt).toLocaleString() }}</span>
                      </div>
                      <dl class="space-y-1 text-sm">
                        <div v-for="row in fieldRows" :key="row.label" class="flex items-baseline justify-between gap-2">
                          <dt class="shrink-0 text-neutral-400">{{ row.label }}</dt>
                          <dd class="min-w-0 break-all text-right font-medium" :class="row.same ? '' : 'font-bold text-blue-600 dark:text-blue-400'">
                            {{ row.right || "—" }}
                            <span v-if="!row.same" class="ml-1 text-[10px] font-normal text-neutral-400">[{{ t("fieldChanged") }}]</span>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div v-else class="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-600">
                    {{ t("targetNotSelected") }}
                  </div>
                </section>
              </template>

              <template #second>
                <ResizableSplit axis="rows" :label="t('resizeChoices')" :initial-size="resolvedLanguage === 'en' ? 224 : 160" from-end :min-first="130" :min-second="112">
                  <template #first>
                    <!-- 正文差异 -->
                    <section v-if="localShown" class="flex h-full min-h-0 flex-col">
                      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{{ t("fieldBody") }}</div>
                      <BodyDiff :left="localShown.body" :right="current.imported.body" class="min-h-0 flex-1" />
                    </section>
                    <div v-else class="h-full" />
                  </template>

                  <template #second>
                    <section class="flex h-full min-h-0 flex-col gap-2 pt-1">
                      <div class="min-h-0 flex-1 overflow-y-auto">
                        <!-- 三个处理操作 -->
                        <fieldset class="grid grid-cols-3 gap-2">
                          <legend class="sr-only">{{ t("resolveImportConflicts") }}</legend>
                          <label
                            class="flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm"
                            :class="currentChoice.action === 'keep_local'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700/50'"
                          >
                            <span class="flex items-center gap-2 font-medium">
                              <input
                                type="radio"
                                name="import-action"
                                :checked="currentChoice.action === 'keep_local'"
                                @change="chooseAction('keep_local')"
                              />
                              {{ t("keepLocal") }}
                            </span>
                          </label>
                          <label
                            class="flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm"
                            :class="currentChoice.action === 'use_imported'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700/50'"
                          >
                            <span class="flex items-center gap-2 font-medium">
                              <input
                                type="radio"
                                name="import-action"
                                :checked="currentChoice.action === 'use_imported'"
                                :disabled="hasMultipleCandidates && !currentChoice.targetLocalId"
                                @change="chooseAction('use_imported')"
                              />
                              {{ t("useImported") }}
                            </span>
                            <span class="text-[11px] text-neutral-400">{{ t("useImportedHint") }}</span>
                          </label>
                          <label
                            class="flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm"
                            :class="currentChoice.action === 'import_as_new'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700/50'"
                          >
                            <span class="flex items-center gap-2 font-medium">
                              <input
                                type="radio"
                                name="import-action"
                                :checked="currentChoice.action === 'import_as_new'"
                                @change="chooseAction('import_as_new')"
                              />
                              {{ t("importAsNew") }}
                            </span>
                            <span class="text-[11px] text-neutral-400">{{ t("importAsNewHint") }}</span>
                          </label>
                        </fieldset>
                      </div>

                      <!-- 底部操作 -->
                      <div class="mt-auto flex shrink-0 items-center gap-2 pb-0.5">
                        <button
                          class="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
                          :disabled="currentIndex === 0"
                          @click="prevItem"
                        >{{ t("prevItem") }}</button>
                        <p v-if="allProcessed" class="text-sm text-green-600 dark:text-green-400">{{ t("allItemsProcessed") }}</p>
                        <p v-if="targetConflict" class="text-sm text-red-600 dark:text-red-400">{{ t("importTargetConflict") }}</p>
                        <button
                          class="ml-auto rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                          :disabled="!canSaveChoice"
                          @click="saveChoice"
                        >{{ t("saveChoiceAndNext") }}</button>
                      </div>
                    </section>
                  </template>
                </ResizableSplit>
              </template>
            </ResizableSplit>
          </main>
        </template>
      </ResizableSplit>
    </div>
  </div>
</template>
