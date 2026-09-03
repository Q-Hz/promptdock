import { test } from "node:test";
import assert from "node:assert/strict";

import { selectedIdAfterImport } from "../src/lib/import-selection.ts";
import { clampSplit, splitBounds } from "../src/lib/split-pane.ts";

test("full replacement follows the imported id when it replaces the selected local prompt", () => {
  assert.equal(selectedIdAfterImport("local-1", [
    { importedId: "imported-1", action: "use_imported", targetLocalId: "local-1" },
  ]), "imported-1");
  assert.equal(selectedIdAfterImport("local-2", [
    { importedId: "imported-1", action: "keep_local", targetLocalId: null },
  ]), "local-2");
  assert.equal(selectedIdAfterImport(null, [
    { importedId: "imported-1", action: "use_imported", targetLocalId: "local-1" },
  ]), null);
});

test("split bounds preserve minimum panels and degrade proportionally in small windows", () => {
  assert.deepEqual(splitBounds(800, 180, 520), [180, 280]);
  const [smallMin, smallMax] = splitBounds(350, 180, 520);
  assert.equal(Math.round(smallMin), 90);
  assert.equal(Math.round(smallMax), 90);
  assert.equal(clampSplit(10, 800, 180, 520), 180);
  assert.equal(clampSplit(700, 800, 180, 520), 280);
});
