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

test("the centralized language resources switch between Chinese and English", () => {
  setLanguage("zh");
  assert.equal(t("generatePrompt"), "生成提示词");
  setLanguage("en");
  assert.equal(t("generatePrompt"), "Generate Prompt");
  assert.equal(t("searchPlaceholder"), "Search title, tags, or folder…");
});
