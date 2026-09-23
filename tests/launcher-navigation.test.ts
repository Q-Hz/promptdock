import assert from "node:assert/strict";
import test from "node:test";

import { launcherBackAction } from "../src/lib/launcher-navigation.ts";

test("back navigation can step from result through variables to search", () => {
  assert.equal(launcherBackAction("result"), "show-variables");
  assert.equal(launcherBackAction("variables"), "reset");
  assert.equal(launcherBackAction("search"), "hide");
});
