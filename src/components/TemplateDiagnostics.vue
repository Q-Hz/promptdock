<script setup lang="ts">
import { t, type MessageKey } from "../lib/i18n";
import type { TemplateDiagnostic } from "../lib/optional-snippets";

defineProps<{ diagnostics: TemplateDiagnostic[] }>();
const keys: Record<TemplateDiagnostic["code"], MessageKey> = {
  invalidGroup: "templateInvalidGroup", duplicateGroup: "templateDuplicateGroup", nestedGroup: "templateNestedGroup",
  unclosedGroup: "templateUnclosedGroup", emptyGroup: "templateEmptyGroup", invalidOption: "templateInvalidOption",
  orphanOption: "templateOrphanOption", orphanEnd: "templateOrphanEnd", invalidEnd: "templateInvalidEnd",
  unexpectedContent: "templateUnexpectedContent", missingGroup: "templateMissingGroup",
  invalidReference: "templateInvalidReference",
  nestedReference: "templateNestedReference", conflict: "templateConflict",
};
function message(d: TemplateDiagnostic) {
  return t("templateDiagnosticLine", {
    line: d.line,
    message: t(keys[d.code], { name: d.name, relatedLine: d.relatedLine ?? "" }),
  });
}
</script>

<template>
  <div v-if="diagnostics.length" data-template-diagnostics aria-live="polite" class="space-y-1 rounded-md border border-neutral-300 p-2 text-xs dark:border-neutral-600">
    <p class="font-medium text-neutral-600 dark:text-neutral-300">{{ t("templateCheck") }}</p>
    <p v-for="(d, i) in diagnostics" :key="i" :data-diagnostic-severity="d.severity" :class="d.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'">
      {{ d.severity === 'warning' ? t("templatePotentialConflict") : '' }}{{ message(d) }}
    </p>
  </div>
</template>
