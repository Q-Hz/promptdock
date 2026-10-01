import assert from "node:assert/strict";
import { test } from "node:test";

import { dropFileError, isExternalFileDrag } from "../src/lib/import-drop.ts";

test("external file drags do not consume prompt and folder sorting drags", () => {
  assert.equal(isExternalFileDrag(["Files"], false), true);
  assert.equal(isExternalFileDrag(["Files"], true), false);
  assert.equal(isExternalFileDrag(["application/x-promptdock", "text/plain"], false), false);
});

test("one JSON file is required for a dropped import", () => {
  assert.equal(dropFileError(["backup.json"]), null);
  assert.equal(dropFileError(["backup.JSON"]), null);
  assert.equal(dropFileError([]), "count");
  assert.equal(dropFileError(["a.json", "b.json"]), "count");
  assert.equal(dropFileError(["notes.txt"]), "extension");
});
