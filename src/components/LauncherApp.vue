<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  api, filterPrompts, parseVariables, renderBody, sortPrompts,
  type Prompt, type ParsedVar,
} from "../lib/api";

type Stage = "search" | "variables" | "result";

const stage = ref<Stage>("search");
const query = ref("");
const prompts = ref<Prompt[]>([]);
const selectedId = ref<string | null>(null);
const selIndex = ref(0);
const varValues = ref<Record<string, string>>({});
const resultText = ref("");
const copied = ref(false);

const filtered = computed(() => filterPrompts(sortPrompts(prompts.value), query.value));
const selected = computed(() => prompts.value.find((p) => p.id === selectedId.value) ?? null);
const vars = computed(() => (selected.value ? parseVariables(selected.value.body) : []));

async function reload() {
  prompts.value = await api.listPrompts();
}

onMounted(async () => {
  await reload();
  (window as any).__TAURI__.event.listen("main-shown", async () => {
    reset();
    await reload();
  });
  window.addEventListener("focusout", () => {
    if (stage.value === "search") api.hideMain();
  });
  reset();
});

function reset() {
  stage.value = "search";
  query.value = "";
  selectedId.value = null;
  selIndex.value = 0;
  copied.value = false;
  const input = document.querySelector<HTMLInputElement>("#launcher-input");
  input?.focus();
}

function choose(p: Prompt) {
  selectedId.value = p.id;
  const values: Record<string, string> = {};
  for (const v of parseVariables(p.body)) values[v.name] = v.default;
  varValues.value = values;
  stage.value = "variables";
}

function generate() {
  if (!selected.value) return;
  resultText.value = renderBody(selected.value.body, varValues.value);
  stage.value = "result";
}

async function copyAndClose() {
  await api.copyText(resultText.value);
  if (selected.value) await api.markUsed(selected.value.id);
  await api.hideMain();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (stage.value === "search") api.hideMain();
    else if (stage.value === "variables") reset();
    else stage.value = "variables";
  } else if (stage.value === "search") {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selIndex.value = Math.min(selIndex.value + 1, filtered.value.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selIndex.value = Math.max(selIndex.value - 1, 0);
    } else if (e.key === "Enter") {
      const p = filtered.value[selIndex.value];
      if (p) choose(p);
    }
  } else if (stage.value === "variables" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    generate();
  } else if (stage.value === "result" && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
    copyAndClose();
  }
}
</script>

<template>
  <div class="h-full overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800" @keydown="onKeydown">
    <!-- 搜索阶段 -->
    <div v-if="stage === 'search'" class="flex h-full flex-col">
      <div class="border-b border-neutral-200 p-3 dark:border-neutral-700">
        <input
          id="launcher-input"
          v-model="query"
          placeholder="Search prompts..."
          class="w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
          autofocus
        />
      </div>
      <div class="flex-1 overflow-y-auto p-1">
        <button
          v-for="(p, i) in filtered"
          :key="p.id"
          class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left"
          :class="i === selIndex ? 'bg-blue-500 text-white' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'"
          @mouseenter="selIndex = i"
          @click="choose(p)"
        >
          <span class="flex items-center gap-2 truncate">
            <span v-if="p.favorite">⭐</span>
            <span class="truncate text-sm font-medium">{{ p.title }}</span>
          </span>
          <span class="ml-2 shrink-0 text-xs opacity-70">
            {{ p.tags.join(" · ") }}<template v-if="p.folder"> · 📁{{ p.folder }}</template>
          </span>
        </button>
        <div v-if="filtered.length === 0" class="p-4 text-center text-sm text-neutral-400">
          没有匹配的 Prompt
        </div>
      </div>
      <div class="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700">
        ↑↓ 选择 · Enter 确认 · Esc 关闭
      </div>
    </div>

    <!-- 变量填写阶段 -->
    <div v-else-if="stage === 'variables'" class="flex h-full flex-col overflow-y-auto p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">{{ selected?.title }}</h2>
        <span class="text-xs text-neutral-400">{{ vars.length }} 个变量</span>
      </div>
      <div v-if="vars.length === 0" class="text-sm text-neutral-400">该 Prompt 没有变量，直接生成。</div>
      <div v-for="v in vars" :key="v.name" class="mb-3">
        <label class="mb-1 block text-xs font-medium text-neutral-500">{{ v.name }}</label>
        <select
          v-if="v.type === 'select'"
          v-model="varValues[v.name]"
          class="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
        >
          <option v-for="o in v.options" :key="o" :value="o">{{ o }}</option>
        </select>
        <textarea
          v-else
          v-model="varValues[v.name]"
          rows="2"
          class="w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
        />
      </div>
      <div class="mt-auto flex justify-end gap-2 pt-2">
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="reset">返回</button>
        <button class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600" @click="generate">生成 Prompt</button>
      </div>
    </div>

    <!-- 结果编辑阶段 -->
    <div v-else class="flex h-full flex-col p-4">
      <textarea
        v-model="resultText"
        class="flex-1 resize-none rounded-md border border-neutral-300 bg-white p-2 font-mono text-sm outline-none dark:border-neutral-600 dark:bg-neutral-700"
      />
      <div class="mt-3 flex justify-end gap-2">
        <button class="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700" @click="stage = 'variables'">返回</button>
        <button
          class="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          @click="copyAndClose"
        >
          {{ copied ? "已复制" : "复制并关闭" }}
        </button>
      </div>
    </div>
  </div>
</template>
