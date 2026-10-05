import test from "node:test";
import assert from "node:assert/strict";
import { FOLDER_COLORS, FOLDER_ICONS, defaultAppearance, normalizeAppearance, iconPath } from "../src/lib/folder-appearance.ts";

test("legacy and corrupt appearances fall back to section-specific defaults", () => {
  assert.deepEqual(normalizeAppearance(undefined, "A"), { icon: "folder", color: "default" });
  assert.deepEqual(normalizeAppearance({ icon: "bad", color: "url(x)" }, "\0pinned"), { icon: "pin", color: "default" });
  assert.deepEqual(defaultAppearance(""), defaultAppearance("A"));
  assert.deepEqual(normalizeAppearance({ icon: "book", color: "#9146ff" }, "A"), { icon: "book", color: "#9146ff" });
});

test("paired icons change with expansion and single-state icons remain stable", () => {
  for (const id of ["folder", "book", "package", "triangle", "chevron"]) {
    assert.notEqual(iconPath(id, false), iconPath(id, true));
  }
  assert.equal(iconPath("music", false), iconPath("music", true));
  assert.equal(iconPath("missing", true), iconPath("folder", true));
  assert.equal(new Set(FOLDER_ICONS.map((icon) => icon.id)).size, 40);
  assert.equal(FOLDER_COLORS.length, 8);
});
