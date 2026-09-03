<script setup lang="ts">
import { computed } from "vue";
import { diffLines, type LineDiff } from "../../lib/compare";

const props = defineProps<{ left: string; right: string }>();

const rows = computed(() => diffLines(props.left, props.right));

const lineClass = (row: LineDiff) =>
  row.type === "equal"
    ? ""
    : row.type === "add"
      ? "bg-green-50 dark:bg-green-900/20"
      : row.type === "remove"
        ? "bg-red-50 dark:bg-red-900/20"
        : "bg-amber-50 dark:bg-amber-900/20";

// 非颜色线索：每行用文字标记增删改（PRD 10.2）
const marker = (row: LineDiff) =>
  row.type === "equal" ? " " : row.type === "add" ? "+" : row.type === "remove" ? "−" : "~";
</script>

<template>
  <div class="overflow-auto rounded-md border border-neutral-200 text-xs dark:border-neutral-700">
    <table class="w-full table-fixed border-collapse font-mono">
      <tbody>
        <tr v-for="(row, i) in rows" :key="i" :class="lineClass(row)">
          <td class="w-5 select-none border-r border-neutral-200 px-1 text-center align-top text-neutral-400 dark:border-neutral-700">{{ marker(row) }}</td>
          <td class="w-1/2 whitespace-pre-wrap break-all px-2 py-0.5 align-top">
            <template v-if="row.left">
              <span
                v-for="(seg, j) in row.left"
                :key="j"
                :class="seg.changed ? 'rounded bg-red-200/80 font-semibold text-red-800 dark:bg-red-900/60 dark:text-red-200' : ''"
              >{{ seg.text }}</span>
            </template>
            <span v-else class="text-neutral-300 dark:text-neutral-600">∅</span>
          </td>
          <td class="w-1/2 whitespace-pre-wrap break-all px-2 py-0.5 align-top">
            <template v-if="row.right">
              <span
                v-for="(seg, j) in row.right"
                :key="j"
                :class="seg.changed ? 'rounded bg-green-200/80 font-semibold text-green-800 dark:bg-green-900/60 dark:text-green-200' : ''"
              >{{ seg.text }}</span>
            </template>
            <span v-else class="text-neutral-300 dark:text-neutral-600">∅</span>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="3" class="px-3 py-2 text-center text-neutral-400">∅</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
