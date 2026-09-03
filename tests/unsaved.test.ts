import { test } from "node:test";
import assert from "node:assert/strict";

import type { Prompt } from "../src/lib/api.ts";
import { isDirty, snapshotFromPrompt, type EditorSnapshot } from "../src/lib/unsaved.ts";

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "p1", title: "Title", body: "Body", tags: ["a"], folder: "F",
    favorite: false, useCount: 0, lastUsedAt: null, createdAt: 1, updatedAt: 1,
    ...overrides,
  };
}

function snapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return { title: "Title", body: "Body", tags: ["a"], folder: "F", favorite: false, ...overrides };
}

test("snapshotFromPrompt copies tags defensively", () => {
  const p = prompt();
  const s = snapshotFromPrompt(p);
  assert.deepEqual(s, snapshot());
  assert.notEqual(s.tags, p.tags);
});

test("identical snapshots are not dirty", () => {
  assert.equal(isDirty(snapshot(), snapshot()), false);
});

test("each editable field change is dirty", () => {
  assert.equal(isDirty(snapshot({ title: "x" }), snapshot()), true);
  assert.equal(isDirty(snapshot({ body: "x" }), snapshot()), true);
  assert.equal(isDirty(snapshot({ folder: "x" }), snapshot()), true);
  assert.equal(isDirty(snapshot({ favorite: true }), snapshot()), true);
  assert.equal(isDirty(snapshot({ tags: ["b"] }), snapshot()), true);
});

test("raw strings: whitespace and newline differences count as dirty", () => {
  assert.equal(isDirty(snapshot({ title: " Title" }), snapshot()), true);
  assert.equal(isDirty(snapshot({ body: "Body\n" }), snapshot()), true);
});

test("tags order and duplicates participate in dirty check (AC-46A)", () => {
  assert.equal(isDirty(snapshot({ tags: ["a", "a"] }), snapshot()), true); // 重复
  assert.equal(isDirty(snapshot({ tags: ["b", "a"] }), snapshot()), true); // 顺序
  assert.equal(isDirty(snapshot({ tags: ["a", "b"] }), snapshot()), true);
});

test("tags normalization-only changes are not dirty (AC-46)", () => {
  // 编辑器实际发送的数组相同：仅输入框分隔空格差异不触发保护
  assert.equal(isDirty(snapshot({ tags: [] }), snapshot({ tags: [] })), false);
});

test("blank new form is not dirty (AC-36)", () => {
  const blank: EditorSnapshot = { title: "", body: "", tags: [], folder: "", favorite: false };
  assert.equal(isDirty(blank, blank), false);
  // 有有效输入后变为脏
  assert.equal(isDirty({ ...blank, body: "x" }, blank), true);
});

test("reverting to baseline clears dirty (AC-45)", () => {
  const base = snapshot();
  const edited = snapshot({ body: "changed" });
  assert.equal(isDirty(edited, base), true);
  assert.equal(isDirty(base, base), false);
});

test("updatedAt and usage fields are not part of the snapshot", () => {
  const a = snapshotFromPrompt(prompt({ updatedAt: 999, useCount: 5, lastUsedAt: 42 }));
  const b = snapshotFromPrompt(prompt({ updatedAt: 1, useCount: 0, lastUsedAt: null }));
  assert.equal(isDirty(a, b), false);
});
