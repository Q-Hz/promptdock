import assert from "node:assert/strict";
import test from "node:test";

import type { Organization, Prompt } from "../src/lib/api.ts";
import {
  arrangeFolders, arrangePinned, batchView, BATCH_SIZE, emptyOrganization, moveWithin,
  nextBatch, orderMembers, PINNED_SECTION_KEY, reorder, reorderIndex, shift, sortLauncher,
} from "../src/lib/organization.ts";

function prompt(id: string, overrides: Partial<Prompt> = {}): Prompt {
  return {
    id, title: `Title ${id}`, body: "body", tags: [], folder: "A",
    favorite: false, pinned: false, useCount: 0, lastUsedAt: null,
    createdAt: 1, updatedAt: 1, ...overrides,
  };
}

function organization(overrides: Partial<Organization> = {}): Organization {
  return { folderOrder: [], promptOrderByFolder: {}, pinnedOrder: [], ...overrides };
}

const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

test("folders follow the persisted order and hide empty ones", () => {
  const prompts = [
    prompt("a1", { folder: "Alpha" }),
    prompt("b1", { folder: "Beta" }),
  ];
  const groups = arrangeFolders(prompts, organization({
    folderOrder: ["Beta", "Alpha", "Empty"],
    promptOrderByFolder: { Alpha: ["a1"], Beta: ["b1"], Empty: [] },
  }));
  assert.deepEqual(groups.map((group) => group.key), ["Beta", "Alpha"]);
  assert.deepEqual(ids(groups[0].items), ["b1"]);
});

test("folders without a stored preference are appended in a stable order", () => {
  const prompts = [
    prompt("known", { folder: "Known", createdAt: 90 }),
    prompt("late", { folder: "Late", createdAt: 20 }),
    prompt("early", { folder: "Early", createdAt: 10 }),
  ];
  const groups = arrangeFolders(prompts, organization({ folderOrder: ["Known"] }));
  assert.deepEqual(groups.map((group) => group.key), ["Known", "Early", "Late"]);
});

test("the uncategorized key stays distinct from a folder literally named 未分类", () => {
  const prompts = [
    prompt("none", { folder: "" }),
    prompt("named", { folder: "未分类" }),
  ];
  const groups = arrangeFolders(prompts, organization({ folderOrder: ["", "未分类"] }));
  assert.deepEqual(groups.map((group) => group.key), ["", "未分类"]);
  assert.deepEqual(ids(groups[0].items), ["none"]);
  assert.deepEqual(ids(groups[1].items), ["named"]);
});

test("folders differing only by case are not merged", () => {
  const prompts = [
    prompt("lower", { folder: "notes" }),
    prompt("upper", { folder: "Notes" }),
  ];
  const groups = arrangeFolders(prompts, organization({ folderOrder: ["notes", "Notes"] }));
  assert.deepEqual(groups.map((group) => group.key), ["notes", "Notes"]);
  assert.equal(groups.every((group) => group.items.length === 1), true);
});

test("members keep the manual order and unlisted ones fall back stably", () => {
  const prompts = [
    prompt("m1", { createdAt: 5 }),
    prompt("m2", { createdAt: 3 }),
    prompt("m3", { createdAt: 9 }),
  ];
  const ordered = orderMembers(prompts, ["m2"]);
  assert.deepEqual(ids(ordered), ["m2", "m1", "m3"]);
  // 陈旧 ID 与重复 ID 被丢弃，其余成员按创建时间稳定兜底
  assert.deepEqual(ids(orderMembers(prompts, ["gone", "m3", "m3"])), ["m3", "m2", "m1"]);
});

test("two prompts sharing a title can be ordered separately", () => {
  const prompts = [
    prompt("dup-1", { title: "Same" }),
    prompt("dup-2", { title: "Same" }),
  ];
  const groups = arrangeFolders(prompts, organization({
    folderOrder: ["A"],
    promptOrderByFolder: { A: ["dup-2", "dup-1"] },
  }));
  assert.deepEqual(ids(groups[0].items), ["dup-2", "dup-1"]);
});

test("the pinned area lists each pinned prompt once and ignores order-only entries", () => {
  const prompts = [
    prompt("p1", { pinned: true, createdAt: 8 }),
    prompt("p2", { pinned: true, createdAt: 2, folder: "B" }),
    prompt("p3", { favorite: true }),
  ];
  assert.deepEqual(ids(arrangePinned(prompts, organization({ pinnedOrder: ["p1", "ghost"] }))), ["p1", "p2"]);
  assert.deepEqual(ids(arrangePinned(prompts, organization({ pinnedOrder: ["p2", "p1"] }))), ["p2", "p1"]);
  // 收藏不产生置顶入口
  assert.deepEqual(ids(arrangePinned(prompts, emptyOrganization())), ["p2", "p1"]);
});

test("favorite and pinned are independent states", () => {
  const both = prompt("both", { favorite: true, pinned: true });
  const onlyFavorite = prompt("fav", { favorite: true });
  const onlyPinned = prompt("pin", { pinned: true });
  const neither = prompt("plain");
  const prompts = [both, onlyFavorite, onlyPinned, neither];
  assert.deepEqual(ids(arrangePinned(prompts, emptyOrganization())), ["both", "pin"]);
  const groups = arrangeFolders(prompts, emptyOrganization());
  assert.equal(groups[0].items.length, 4);
});

test("the launcher puts pinned prompts first in pinned order, then recency", () => {
  const prompts = [
    prompt("fav-old", { favorite: true, lastUsedAt: 900 }),
    prompt("pin-b", { pinned: true, lastUsedAt: 10 }),
    prompt("pin-a", { pinned: true, lastUsedAt: 5 }),
    prompt("recent", { lastUsedAt: 500 }),
    prompt("never", { lastUsedAt: null }),
  ];
  const sorted = sortLauncher(prompts, ["pin-a", "pin-b"]);
  assert.deepEqual(ids(sorted), ["pin-a", "pin-b", "fav-old", "recent", "never"]);
});

test("the launcher keeps a stable order when nothing was used yet", () => {
  const prompts = [prompt("b"), prompt("a"), prompt("c")];
  assert.deepEqual(ids(sortLauncher(prompts, [])), ["a", "b", "c"]);
});

test("batching shows five at a time and reports the real remainder", () => {
  assert.deepEqual(batchView(1, BATCH_SIZE), { visible: 1, remaining: 0, canCollapse: false });
  assert.deepEqual(batchView(5, BATCH_SIZE), { visible: 5, remaining: 0, canCollapse: false });
  assert.deepEqual(batchView(6, BATCH_SIZE), { visible: 5, remaining: 1, canCollapse: false });
  assert.deepEqual(batchView(30, BATCH_SIZE), { visible: 5, remaining: 25, canCollapse: false });
  assert.deepEqual(batchView(30, nextBatch(BATCH_SIZE)), { visible: 10, remaining: 20, canCollapse: true });
  assert.deepEqual(batchView(6, nextBatch(BATCH_SIZE)), { visible: 6, remaining: 0, canCollapse: true });
  assert.equal(nextBatch(nextBatch(BATCH_SIZE)), 15);
});

test("reorder moves the dragged key around an explicit insertion point", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "a", "c", "before"), ["b", "a", "c"]);
  assert.deepEqual(reorder(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
  assert.deepEqual(reorder(["a", "b", "c"], "c", null, "after"), ["a", "b", "c"]);
  // 自投放或过期落点不应意外移到末尾。
  assert.deepEqual(reorder(["a", "b"], "a", "ghost", "before"), ["a", "b"]);
  assert.deepEqual(reorder(["a", "b"], "a", "a", "after"), ["a", "b"]);
  assert.deepEqual(reorder(["a", "b"], "ghost", "a", "before"), ["a", "b"]);
});

test("reorderIndex reports the position inside the full member list", () => {
  const members = ["m1", "m2", "m3", "m4", "m5", "m6"];
  // 拖到第 5 条之前：目标下标按完整成员顺序计算，未显示条目保持相对顺序
  assert.equal(reorderIndex(members, "m1", "m5", "before"), 3);
  assert.equal(reorderIndex(members, "m6", "m2", "after"), 2);
  assert.equal(reorderIndex(members, "other-folder-id", "m5", "before"), 4);
  assert.equal(reorderIndex(members, "other-folder-id", "missing", "before"), -1);
});

test("shift and moveWithin implement the up/down/end menu actions", () => {
  assert.deepEqual(shift(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(shift(["a", "b", "c"], "a", 1), ["b", "a", "c"]);
  assert.deepEqual(shift(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(shift(["a", "b"], "ghost", 1), ["a", "b"]);
  assert.deepEqual(moveWithin([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(moveWithin([1, 2, 3], 5, 0), [1, 2, 3]);
});

test("the pinned section key never collides with a real folder name", () => {
  const groups = arrangeFolders([prompt("x", { folder: PINNED_SECTION_KEY })], emptyOrganization());
  assert.equal(groups.length, 1);
  assert.notEqual(PINNED_SECTION_KEY, "");
});
