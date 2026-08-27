import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPrompts,
  parseVariables,
  renderBody,
  type Prompt,
} from "../src/lib/api.ts";
import { setLanguage, t } from "../src/lib/i18n.ts";

const prompts: Prompt[] = [
  {
    id: "1",
    title: "Code review",
    body: "Review {{code}} as {{tone=[strict|friendly]}}.",
    tags: ["review"],
    folder: "Coding",
    favorite: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "2",
    title: "Brainstorm ideas",
    body: "Create {{count=5}} ideas about {{topic}}.",
    tags: ["ideas"],
    folder: "Productivity",
    favorite: false,
    useCount: 0,
    lastUsedAt: null,
    createdAt: 1,
    updatedAt: 1,
  },
];

test("search matches title, tags, and partial case-insensitive folder names", () => {
  assert.deepEqual(filterPrompts(prompts, "code").map((prompt) => prompt.id), ["1"]);
  assert.deepEqual(filterPrompts(prompts, "REVIEW").map((prompt) => prompt.id), ["1"]);
  assert.deepEqual(filterPrompts(prompts, "  duct  ").map((prompt) => prompt.id), ["2"]);
});

test("variable parsing and rendering preserve the launcher generation flow", () => {
  const variables = parseVariables(prompts[1].body);
  assert.deepEqual(variables.map((variable) => variable.name), ["count", "topic"]);
  assert.equal(variables[0].default, "5");
  assert.equal(
    renderBody(prompts[1].body, { count: "3", topic: "local apps" }),
    "Create 3 ideas about local apps."
  );
});

test("multi-select variables parse options and separator", () => {
  const [multi, withSep] = parseVariables(
    "Stack: {{tags+=[react|vue|svelte]}}.\nLines: {{levels+=[low|mid|high]~\\n}}."
  );
  assert.deepEqual(
    { name: multi.name, type: multi.type, options: multi.options, separator: multi.separator },
    { name: "tags", type: "multi", options: ["react", "vue", "svelte"], separator: ", " }
  );
  assert.deepEqual(
    { name: withSep.name, type: withSep.type, options: withSep.options, separator: withSep.separator },
    { name: "levels", type: "multi", options: ["low", "mid", "high"], separator: "\n" }
  );
});

test("multi-select values join with the placeholder separator when rendered", () => {
  const body = "Stack: {{tags+=[react|vue|svelte]}}. Levels: {{levels+=[low|mid|high]~\\n}}.";
  assert.equal(
    renderBody(body, { tags: ["react", "svelte"], levels: ["mid", "high"] }),
    "Stack: react, svelte. Levels: mid\nhigh."
  );
  assert.equal(renderBody(body, { tags: [], levels: [] }), "Stack: . Levels: .");
  // 字符串值仍然直接替换，旧提示词行为不变
  assert.equal(renderBody(body, { tags: "react", levels: "low" }), "Stack: react. Levels: low.");
});

test("multi-select placeholder repeated in the body yields one variable and consistent rendering", () => {
  const body = "{{tags+=[a|b]}} and {{tags+=[a|b]}}";
  const variables = parseVariables(body);
  assert.equal(variables.length, 1);
  assert.equal(renderBody(body, { tags: ["a", "b"] }), "a, b and a, b");
});

test("+= without an option list falls back to a text variable with default", () => {
  const [fallback] = parseVariables("{{count+=5}}");
  assert.deepEqual(
    { name: fallback.name, type: fallback.type, default: fallback.default },
    { name: "count", type: "text", default: "5" }
  );
});

test("the centralized language resources switch between Chinese and English", () => {
  setLanguage("zh");
  assert.equal(t("generatePrompt"), "生成提示词");
  setLanguage("en");
  assert.equal(t("generatePrompt"), "Generate Prompt");
  assert.equal(t("searchPlaceholder"), "Search title, tags, or folder…");
});
