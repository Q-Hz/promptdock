<script setup lang="ts">
import type { ParsedVar } from "../lib/api";
import type { VariableValue } from "../lib/optional-snippets";

const props = defineProps<{
  variable: ParsedVar;
  modelValue: VariableValue;
  activeOption: number;
  focused: boolean;
  keyboardNav: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: VariableValue];
  navigate: [event: KeyboardEvent];
  focus: [];
  blur: [];
}>();
const has = (option: string) => Array.isArray(props.modelValue) && props.modelValue.includes(option);
function toggle(option: string) {
  const current = Array.isArray(props.modelValue) ? props.modelValue : [];
  emit("update:modelValue", current.includes(option) ? current.filter(o => o !== option) : [...current, option]);
}
</script>

<template>
  <div class="shrink-0" :data-variable-field="variable.name">
    <label data-variable-label :for="`variable-${variable.name}`" class="mb-1 block text-xs font-medium text-neutral-500">{{ variable.name }}</label>
    <div
      v-if="variable.type === 'select'"
      :id="`variable-${variable.name}`"
      data-variable-options
      class="variable-input flex flex-wrap gap-1.5 rounded-md outline-none"
      tabindex="0" role="listbox" :aria-label="variable.name"
      @keydown="emit('navigate', $event)" @focus="emit('focus')" @blur="emit('blur')"
    >
      <button
        v-for="o in variable.options" :key="o" type="button" role="option" tabindex="-1"
        :aria-selected="modelValue === o"
        class="rounded-md border px-2 py-1 text-sm transition-colors"
        :class="[
          modelValue === o
            ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
            : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500',
          focused && keyboardNav && modelValue === o ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
        ]"
        @click="emit('update:modelValue', o)"
      >{{ o }}</button>
    </div>
    <div
      v-else-if="variable.type === 'multi'"
      :id="`variable-${variable.name}`"
      data-variable-options
      class="variable-input flex flex-wrap gap-1.5 rounded-md p-0.5 outline-none"
      tabindex="0" role="group" :aria-label="variable.name"
      @keydown="emit('navigate', $event)" @focus="emit('focus')" @blur="emit('blur')"
    >
      <label
        v-for="(o, i) in variable.options" :key="o"
        class="flex cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors"
        :class="[
          has(o)
            ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
            : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500',
          focused && keyboardNav && activeOption === i ? 'ring-2 ring-blue-400 dark:ring-blue-500' : '',
        ]"
      >
        <input type="checkbox" class="accent-blue-500" tabindex="-1" :checked="has(o)" @change="toggle(o)" />
        <span>{{ o }}</span>
      </label>
    </div>
    <textarea
      v-else :id="`variable-${variable.name}`" :value="modelValue as string" :aria-label="variable.name"
      rows="2"
      class="variable-input block min-h-[80px] w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
      style="height: var(--launcher-text-height, 80px)"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
