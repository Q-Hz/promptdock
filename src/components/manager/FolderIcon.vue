<script setup lang="ts">
import { iconPath, type FolderAppearance } from "../../lib/folder-appearance";
defineProps<{ appearance: FolderAppearance; expanded?: boolean }>();
</script>

<template>
  <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-neutral-600 dark:text-neutral-300" :style="appearance.color === 'default' ? undefined : { color: appearance.color }" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="iconPath(appearance.icon, !!expanded)" />
  </svg>
</template>
