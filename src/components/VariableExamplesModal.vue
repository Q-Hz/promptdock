<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { resolvedLanguage, t } from "../lib/i18n";
import { VARIABLE_EXAMPLE_KINDS, variableExample } from "../lib/variable-examples";
import plainZh from "../assets/variable-examples/zh/plain.png";
import defaultZh from "../assets/variable-examples/zh/default.png";
import selectZh from "../assets/variable-examples/zh/select.png";
import multiZh from "../assets/variable-examples/zh/multi.png";
import snippetZh from "../assets/variable-examples/zh/snippet.png";
import plainEn from "../assets/variable-examples/en/plain.png";
import defaultEn from "../assets/variable-examples/en/default.png";
import selectEn from "../assets/variable-examples/en/select.png";
import multiEn from "../assets/variable-examples/en/multi.png";
import snippetEn from "../assets/variable-examples/en/snippet.png";

const emit = defineEmits<{ (event: "close"): void }>();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const screenshots = {
  zh: { Plain: plainZh, Default: defaultZh, Select: selectZh, Multi: multiZh, Snippet: snippetZh },
  en: { Plain: plainEn, Default: defaultEn, Select: selectEn, Multi: multiEn, Snippet: snippetEn },
};
const examples = computed(() => VARIABLE_EXAMPLE_KINDS.map(kind => ({
  ...variableExample(kind), screenshot: screenshots[resolvedLanguage.value][kind],
})));

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
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
    <section ref="dialog" data-variable-examples class="flex max-h-full w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-800" role="dialog" aria-modal="true" aria-labelledby="variable-examples-title" @keydown="onKeydown">
      <header class="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
        <div>
          <h2 id="variable-examples-title" class="text-lg font-bold">{{ t("variableExamplesTitle") }}</h2>
          <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{{ t("variableExamplesIntro") }}</p>
        </div>
        <button ref="closeButton" type="button" title="Esc" aria-keyshortcuts="Escape" class="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-600 dark:hover:bg-neutral-700" @click="emit('close')">{{ t("close") }}</button>
      </header>
      <div data-variable-examples-content tabindex="0" :aria-label="t('variableExamplesTitle')" class="min-h-0 overflow-auto px-5 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <div class="min-w-[1160px]">
          <table class="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <colgroup>
              <col class="w-[18%]" />
              <col class="w-[27%]" />
              <col class="w-[34%]" />
              <col class="w-[21%]" />
            </colgroup>
            <thead>
              <tr>
                <th v-for="label in [t('variableExampleNeed'), t('variableExampleSyntax'), t('variableExampleResult'), t('variableExampleGenerated')]" :key="label" scope="col" class="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-100 px-4 py-3 font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">{{ label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="example in examples" :key="example.kind" :data-example-kind="example.kind">
                <th scope="row" data-example-need class="border-b border-neutral-200 px-4 py-4 align-top font-normal dark:border-neutral-700">
                  <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">{{ example.title }}</h3>
                  <p class="mt-2 whitespace-pre-line leading-6 text-neutral-600 dark:text-neutral-300">{{ example.need }}</p>
                </th>
                <td data-example-syntax class="border-b border-neutral-200 px-4 py-4 align-top dark:border-neutral-700">
                  <pre class="whitespace-pre-wrap rounded-md bg-neutral-100 p-3 font-mono text-[13px] leading-6 text-blue-700 [overflow-wrap:anywhere] dark:bg-neutral-900 dark:text-blue-300"><code data-example-code>{{ example.code }}</code></pre>
                </td>
                <td data-example-interface class="border-b border-neutral-200 px-4 py-4 align-top dark:border-neutral-700">
                  <p class="leading-6 text-neutral-600 dark:text-neutral-300">{{ example.result }}</p>
                  <div class="mt-3 overflow-hidden rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-600">
                    <img :src="example.screenshot" :alt="t('variableExampleImageAlt', { name: example.title })" class="block h-auto w-full" />
                  </div>
                </td>
                <td data-example-output class="border-b border-neutral-200 px-4 py-4 align-top dark:border-neutral-700">
                  <pre data-example-generated class="whitespace-pre-wrap font-sans text-sm leading-6 text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-200">{{ example.generated }}</pre>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div data-example-notes class="space-y-5 pt-5 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          <h2 class="text-base font-semibold text-neutral-800 dark:text-neutral-100">{{ t("variableExampleNotesTitle") }}</h2>
          <section data-example-note="reuse">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">{{ t("variableExampleReuseTitle") }}</h3>
            <p class="mt-2">{{ t("variableExampleReuseVariables") }}</p>
            <p class="mt-2">{{ t("variableExampleReuseGroup") }}</p>
          </section>
          <section data-example-note="order">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">{{ t("variableExampleOrderTitle") }}</h3>
            <p class="mt-2">{{ t("variableExampleOrderRule") }}</p>
            <p class="mt-2">{{ t("variableExampleOrderExample") }}</p>
          </section>
          <section data-example-note="separator">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">{{ t("variableExampleSeparatorTitle") }}</h3>
            <p class="mt-2">{{ t("variableExampleSeparatorDefault") }}</p>
            <pre class="mt-2 whitespace-pre-wrap font-mono text-[13px] text-neutral-800 dark:text-neutral-100">{{ t("variableExampleSeparatorDefaultResult") }}</pre>
            <p class="mt-3">{{ t("variableExampleSeparatorNewline") }}</p>
            <pre class="mt-2 w-fit max-w-full whitespace-pre-wrap rounded-md bg-neutral-100 px-3 py-2 font-mono text-[13px] text-blue-700 [overflow-wrap:anywhere] dark:bg-neutral-900 dark:text-blue-300"><code>{{ t("variableExampleSeparatorCode") }}</code></pre>
            <p class="mt-3">{{ t("variableExampleSeparatorNewlineIntro") }}</p>
            <pre class="mt-2 whitespace-pre-wrap font-mono text-[13px] text-neutral-800 dark:text-neutral-100">{{ t("variableExampleSeparatorNewlineResult") }}</pre>
            <p class="mt-3">{{ t("variableExampleSeparatorEscapes") }}</p>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>
