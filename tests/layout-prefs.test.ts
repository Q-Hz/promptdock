import assert from "node:assert/strict";
import test from "node:test";

import {
  LAYOUT_PREFS_KEY, defaultLayout, parseLayout, serializeLayout,
} from "../src/lib/layout-prefs.ts";
import {
  clampSplit, clampTo, folderViewportBounds, splitBounds,
} from "../src/lib/split-pane.ts";

test("layout preferences round-trip through the stored string", () => {
  const layout = {
    sidebarRatio: 0.32,
    editorRatio: 0.7,
    folderHeights: { Alpha: 180, "\u0000pinned": 96 },
    collapsed: { Beta: true },
  };
  assert.deepEqual(parseLayout(serializeLayout(layout)), layout);
  assert.equal(LAYOUT_PREFS_KEY, "manager-layout");
});

test("missing or corrupt preferences fall back to defaults", () => {
  assert.deepEqual(parseLayout(""), defaultLayout());
  assert.deepEqual(parseLayout("   "), defaultLayout());
  assert.deepEqual(parseLayout("not json"), defaultLayout());
  assert.deepEqual(parseLayout("7"), defaultLayout());
  assert.deepEqual(parseLayout("null"), defaultLayout());
});

test("invalid preference fields are dropped one by one", () => {
  const parsed = parseLayout(JSON.stringify({
    sidebarRatio: 3,
    editorRatio: "0.5",
    folderHeights: { ok: 120, bad: "tall", zero: 0 },
    collapsed: { yes: true, nope: "true" },
  }));
  assert.equal(parsed.sidebarRatio, null);
  assert.equal(parsed.editorRatio, null);
  assert.deepEqual(parsed.folderHeights, { ok: 120 });
  assert.deepEqual(parsed.collapsed, { yes: true });
});

test("the sidebar keeps its minimums and the 45% cap", () => {
  // 1080 宽：默认 28% 落在 240–420 之间
  const [min, max] = splitBounds(1072, 220, 480, 0.45);
  assert.equal(min, 220);
  assert.ok(Math.abs(max - 1072 * 0.45) < 1e-9);
  assert.ok(Math.abs(clampSplit(900, 1072, 220, 480, 0.45) - 1072 * 0.45) < 1e-9);
  // 860 宽：右侧最少 480，左侧被压到 372
  assert.equal(clampSplit(600, 852, 220, 480, 0.45), 372);
  // 两栏都放不下时按比例一起收缩，不产生消失的分隔条
  const [tinyMin, tinyMax] = splitBounds(300, 220, 480, 0.45);
  assert.ok(tinyMin <= tinyMax);
  assert.ok(tinyMin > 0);
});

test("folder viewport heights stay inside 40%/60% of the navigation area", () => {
  const bounds = folderViewportBounds(600);
  assert.equal(bounds.initial, 240);
  assert.equal(bounds.max, 360);
  assert.equal(bounds.min, 96);
  assert.equal(clampTo(5000, bounds.min, bounds.max), 360);
  assert.equal(clampTo(10, bounds.min, bounds.max), 96);
});

test("a very short navigation area collapses the bounds instead of inverting them", () => {
  const bounds = folderViewportBounds(80);
  assert.ok(bounds.min <= bounds.max);
  assert.equal(clampTo(1000, bounds.min, bounds.max), bounds.max);
  assert.deepEqual(folderViewportBounds(0), { min: 0, max: 0, initial: 0 });
});
import { MutationQueue } from "../src/lib/mutation-queue.ts";
import { fitPopover } from "../src/lib/popover.ts";

test("mutations wait for response reconciliation and recover after failure", async () => {
  const queue = new MutationQueue();
  let release!: () => void;
  let pinned = false;
  const trace: string[] = [];
  const first = queue.run(async () => {
    trace.push("pin sent");
    await new Promise<void>((resolve) => { release = resolve; });
    pinned = true;
    trace.push("pin reconciled");
  });
  const save = queue.run(async () => { trace.push(`saved ${pinned}`); });
  await Promise.resolve();
  assert.deepEqual(trace, ["pin sent"]);
  release();
  await Promise.all([first, save]);
  assert.deepEqual(trace, ["pin sent", "pin reconciled", "saved true"]);
  await assert.rejects(queue.run(async () => { throw new Error("failure"); }));
  await queue.run(async () => { trace.push("recovered"); });
  await queue.idle();
  assert.equal(trace.at(-1), "recovered");
});

test("menus fit their actual height at the viewport bottom and on short windows", () => {
  const position = fitPopover({ top: 690, bottom: 718, right: 300 }, 208, 202, 1080, 720);
  assert.ok(position.top + 202 <= 712);
  assert.ok(position.top < 690);
  const tall = fitPopover({ top: 20, bottom: 48, right: 110 }, 208, 900, 860, 560);
  assert.equal(tall.maxHeight, 544);
  assert.ok(tall.top >= 8 && tall.left >= 8);
});
