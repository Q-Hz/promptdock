import test from "node:test";
import assert from "node:assert/strict";
import {
  folderCodePointLength,
  trimFolderName,
  validateFolderName,
  validatePromptFolder,
} from "../src/lib/folder-name.ts";

test("folder names trim Unicode White_Space but preserve internal spacing", () => {
  assert.equal(trimFolderName("\u3000  Alpha  Beta\u00a0"), "Alpha  Beta");
  assert.equal(trimFolderName("\ufeffAlpha\ufeff"), "\ufeffAlpha\ufeff");
});

test("folder validation rejects empty, controls, overlength and exact duplicates", () => {
  assert.equal(validateFolderName("  ", []).error, "empty");
  assert.equal(validateFolderName("A\tB", []).error, "control_character");
  assert.equal(validateFolderName("a".repeat(51), []).error, "too_long");
  assert.equal(validateFolderName(" Notes ", ["Notes"]).error, "duplicate");
  assert.equal(validateFolderName("notes", ["Notes"]).error, null);
});

test("folder length counts Unicode code points", () => {
  assert.equal(folderCodePointLength("😀"), 1);
  assert.equal(folderCodePointLength("e\u0301"), 2);
  assert.equal(validateFolderName("😀".repeat(50), []).error, null);
});

test("common path punctuation and a real localized uncategorized name are allowed", () => {
  assert.equal(validateFolderName('/\\:*?"<>|', []).error, null);
  assert.equal(validateFolderName("未分类", []).error, null);
});

test("prompt folder validation permits blank and existing historical names", () => {
  const legacy = "x".repeat(51);
  assert.deepEqual(validatePromptFolder("  ", [legacy], null), { name: "", error: null });
  assert.deepEqual(validatePromptFolder(legacy, [legacy], null), { name: legacy, error: null });
  assert.equal(validatePromptFolder("new".repeat(20), [legacy], null).error, "too_long");
});
