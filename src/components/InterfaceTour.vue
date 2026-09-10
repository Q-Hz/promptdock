<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { t, type MessageKey } from "../lib/i18n";
import { ONBOARDING_STEP_COUNT, moveOnboardingStep, onboardingActions } from "../lib/onboarding";
import launcherSearchImage from "../assets/onboarding/launcher-search.png";
import launcherVariablesImage from "../assets/onboarding/launcher-variables.png";
import launcherResultImage from "../assets/onboarding/launcher-result.png";

const props = defineProps<{
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  (event: "skip"): void;
  (event: "finish"): void;
}>();

const targetKeys: Array<string | null> = [null, "create", "variables", "library", "settings", null, null, null];
const guideImages = [launcherSearchImage, launcherVariablesImage, launcherResultImage];
const step = ref(0);
const dialog = ref<HTMLElement | null>(null);
const title = ref<HTMLElement | null>(null);
const targetRect = ref<DOMRect | null>(null);
const calloutPosition = ref({ left: 16, top: 16 });
const placement = ref<"above" | "below" | "left" | "right">("below");
const actions = computed(() => onboardingActions(step.value));
const titleKey = computed(() => `onboardingStep${step.value + 1}Title` as MessageKey);
const bodyKey = computed(() => `onboardingStep${step.value + 1}Body` as MessageKey);
const spotlightStyle = computed(() => {
  const rect = targetRect.value;
  return rect
    ? { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
    : { opacity: "0" };
});
const calloutStyle = computed(() => ({
  left: `${calloutPosition.value.left}px`,
  top: `${calloutPosition.value.top}px`,
  width: `min(${step.value >= 5 ? 640 : step.value === 2 ? 240 : step.value === 0 ? 430 : 390}px, calc(100vw - 24px))`,
}));

let transitionLocked = false;
let transitionTimer: number | undefined;
let animationFrame: number | undefined;
let resizeObserver: ResizeObserver | undefined;
let lastFocused: HTMLElement | null = null;

function targetElements(): HTMLElement[] {
  const key = targetKeys[step.value];
  if (!key) return [];
  return [...document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${key}"]`)]
    .filter((element) => element.offsetParent !== null);
}

function centerCallout() {
  const element = dialog.value;
  if (!element) return;
  placement.value = "below";
  calloutPosition.value = {
    left: Math.max(12, (window.innerWidth - element.offsetWidth) / 2),
    top: Math.max(12, (window.innerHeight - element.offsetHeight) / 2),
  };
}

function measureTarget(elements: HTMLElement[]): DOMRect | null {
  if (elements.length === 0) return null;
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const padding = 8;
  const spotlightLeft = Math.max(6, left - padding);
  const spotlightTop = Math.max(6, top - padding);
  const spotlightRight = Math.min(window.innerWidth - 6, right + padding);
  const spotlightBottom = Math.min(window.innerHeight - 6, bottom + padding);
  return new DOMRect(
    spotlightLeft,
    spotlightTop,
    Math.max(0, spotlightRight - spotlightLeft),
    Math.max(0, spotlightBottom - spotlightTop)
  );
}

function positionCallout(rect: DOMRect) {
  const element = dialog.value;
  if (!element) return;
  const gap = 15;
  const margin = 12;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const spaces = {
    below: window.innerHeight - rect.bottom,
    above: rect.top,
    right: window.innerWidth - rect.right,
    left: rect.left,
  };
  const candidates: Array<typeof placement.value> =
    step.value === 2 ? ["left", "above", "below", "right"] : ["below", "above", "left", "right"];
  const fits = (side: typeof placement.value) =>
    spaces[side] >= (side === "left" || side === "right" ? width : height) + gap + margin;
  const nextPlacement = candidates.find(fits) ?? candidates.reduce((best, side) =>
    spaces[side] > spaces[best] ? side : best
  );

  let left = rect.left + (rect.width - width) / 2;
  let top = nextPlacement === "above" ? rect.top - height - gap : rect.bottom + gap;
  if (nextPlacement === "left" || nextPlacement === "right") {
    left = nextPlacement === "left" ? rect.left - width - gap : rect.right + gap;
    top = rect.top + (rect.height - height) / 2;
  }
  placement.value = nextPlacement;
  calloutPosition.value = {
    left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
    top: Math.max(margin, Math.min(window.innerHeight - height - margin, top)),
  };
}

function updateGeometry() {
  window.cancelAnimationFrame(animationFrame ?? 0);
  animationFrame = window.requestAnimationFrame(() => {
    const elements = targetElements();
    const rect = measureTarget(elements);
    if (!rect) {
      targetRect.value = null;
      resizeObserver?.disconnect();
      void nextTick(centerCallout);
      return;
    }
    targetRect.value = rect;
    void nextTick(() => positionCallout(rect));
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(updateGeometry);
    for (const element of elements) resizeObserver.observe(element);
  });
}

function focusTitle() {
  void nextTick(() => title.value?.focus());
}

function move(direction: -1 | 1) {
  if (transitionLocked || props.busy) return;
  transitionLocked = true;
  step.value = moveOnboardingStep(step.value, direction);
  window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(() => { transitionLocked = false; }, 180);
}

function focusableElements(): HTMLElement[] {
  if (!dialog.value) return [];
  return [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = focusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    title.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === title.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function rememberFocus(event: FocusEvent) {
  if (event.target instanceof HTMLElement) lastFocused = event.target;
}

function restoreFocus() {
  if (!dialog.value || dialog.value.contains(document.activeElement)) return;
  (lastFocused && dialog.value.contains(lastFocused) ? lastFocused : title.value)?.focus();
}

watch(step, () => {
  resizeObserver?.disconnect();
  targetRect.value = null;
  void nextTick(() => { updateGeometry(); focusTitle(); });
});

onMounted(() => {
  updateGeometry();
  focusTitle();
  window.addEventListener("focus", restoreFocus);
  window.addEventListener("resize", updateGeometry);
  window.addEventListener("scroll", updateGeometry, true);
});

onUnmounted(() => {
  window.clearTimeout(transitionTimer);
  window.cancelAnimationFrame(animationFrame ?? 0);
  resizeObserver?.disconnect();
  window.removeEventListener("focus", restoreFocus);
  window.removeEventListener("resize", updateGeometry);
  window.removeEventListener("scroll", updateGeometry, true);
});
</script>

<template>
  <div class="fixed inset-0 z-[70]" data-onboarding :data-onboarding-step="step + 1">
    <div v-if="!targetRect" class="tour-scrim pointer-events-none fixed inset-0" aria-hidden="true" />
    <div v-else class="spotlight pointer-events-none fixed rounded-xl" :style="spotlightStyle" aria-hidden="true" />
    <section
      ref="dialog"
      class="tour-callout fixed flex max-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700"
      :data-placement="placement"
      :style="calloutStyle"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`onboarding-title-${step}`"
      :aria-describedby="`onboarding-body-${step}`"
      @keydown="onKeydown"
      @focusin="rememberFocus"
    >
      <div class="h-1 shrink-0 bg-blue-600" />
      <header class="shrink-0 px-5 pb-2 pt-4">
        <div class="flex items-start justify-between gap-3">
          <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">{{ t("onboardingProgress", { current: step + 1, total: ONBOARDING_STEP_COUNT }) }}</p>
          <button type="button" data-onboarding-action="skip" class="-my-1 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:hover:bg-neutral-700" :disabled="busy" @click="emit('skip')">{{ t("onboardingSkip") }}</button>
        </div>
        <h2 :id="`onboarding-title-${step}`" ref="title" tabindex="-1" class="mt-1 text-lg font-bold tracking-tight text-neutral-900 outline-none dark:text-white">{{ t(titleKey) }}</h2>
      </header>

      <div :id="`onboarding-body-${step}`" class="min-h-0 overflow-y-auto px-5 pb-4 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
        <p v-if="step !== 5">{{ t(bodyKey) }}</p>
        <p v-else>
          {{ t("onboardingDefaultHotkey") }}
          <kbd class="rounded-md border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-mono text-xs font-bold text-neutral-800 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100">{{ t("onboardingDefaultHotkeyValue") }}</kbd>{{ t("onboardingSentencePeriod") }}
          {{ t(bodyKey) }}
        </p>
        <div v-if="step === 2" class="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <p class="text-xs leading-5 text-neutral-600 dark:text-neutral-300">{{ t("onboardingStep3VariableHelp") }}</p>
        </div>
        <template v-else-if="step === 5">
          <img :src="guideImages[0]" :alt="t('onboardingStep6ImageAlt')" class="tour-screenshot mt-3" @load="updateGeometry" />
        </template>
        <img v-else-if="step === 6" :src="guideImages[1]" :alt="t('onboardingStep7ImageAlt')" class="tour-screenshot mt-3" @load="updateGeometry" />
        <img v-else-if="step === 7" :src="guideImages[2]" :alt="t('onboardingStep8ImageAlt')" class="tour-screenshot mt-3" @load="updateGeometry" />
      </div>

      <p v-if="error" class="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-200" role="alert">{{ error }}</p>
      <footer class="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-neutral-50/90 px-5 py-3 dark:border-neutral-700 dark:bg-neutral-800/90">
        <div class="flex gap-0.5" aria-hidden="true">
          <span v-for="index in ONBOARDING_STEP_COUNT" :key="index" class="h-1.5 rounded-full transition-all" :class="index - 1 === step ? 'w-3 bg-blue-600' : 'w-1 bg-neutral-300 dark:bg-neutral-600'" />
        </div>
        <div class="flex gap-2">
          <button v-if="actions.previous" type="button" data-onboarding-action="previous" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-700" :disabled="busy" @click="move(-1)">{{ t("onboardingPrevious") }}</button>
          <button v-if="actions.next" type="button" data-onboarding-action="next" class="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50" :disabled="busy" @click="move(1)">{{ t("onboardingNext") }}</button>
          <button v-if="actions.finish" type="button" data-onboarding-action="finish" class="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50" :disabled="busy" @click="emit('finish')">{{ busy ? t("onboardingSaving") : t("onboardingStart") }}</button>
        </div>
      </footer>
      <p class="sr-only" aria-live="polite">{{ t("onboardingProgress", { current: step + 1, total: ONBOARDING_STEP_COUNT }) }} · {{ t(titleKey) }}</p>
    </section>
  </div>
</template>

<style scoped>
.tour-scrim { z-index: 1; background: rgb(10 15 25 / 0.7); }
.spotlight {
  z-index: 1;
  border: 2px solid rgb(96 165 250);
  background: rgb(255 255 255 / 0.06);
  box-shadow: 0 0 0 9999px rgb(10 15 25 / 0.7), 0 0 0 5px rgb(59 130 246 / 0.22), 0 12px 35px rgb(0 0 0 / 0.22);
  transition: left 220ms ease, top 220ms ease, width 220ms ease, height 220ms ease, opacity 120ms ease;
}
.tour-callout {
  z-index: 2;
  background: rgb(255 255 255);
  transition: left 220ms ease, top 220ms ease;
}
.dark .tour-callout { background: rgb(30 30 30); }
.tour-screenshot {
  display: block;
  width: 100%;
  max-height: 270px;
  border: 1px solid rgb(212 212 212);
  border-radius: 0.7rem;
  object-fit: contain;
  background: white;
}
.dark .tour-screenshot { border-color: rgb(82 82 82); }
</style>
