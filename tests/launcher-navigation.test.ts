import assert from "node:assert/strict";
import test from "node:test";

import { launcherBackAction, snapshotVariables, variablesChanged } from "../src/lib/launcher-navigation.ts";

test("back navigation can step from result through variables to search", () => {
  assert.equal(launcherBackAction("result"), "show-variables");
  assert.equal(launcherBackAction("variables"), "reset");
  assert.equal(launcherBackAction("search"), "hide");
});

test("variable baseline detects text, select and multi changes and restoration", () => {
  const values = { text: "default", select: "a", multi: ["a", "b"] };
  const baseline = snapshotVariables(values);
  assert.equal(variablesChanged(values, baseline), false);
  values.text = "edited";
  assert.equal(variablesChanged(values, baseline), true);
  values.text = "default";
  values.select = "b";
  assert.equal(variablesChanged(values, baseline), true);
  values.select = "a";
  values.multi.pop();
  assert.equal(variablesChanged(values, baseline), true);
  assert.deepEqual(baseline.multi, ["a", "b"]);
  values.multi.push("b");
  assert.equal(variablesChanged(values, baseline), false);
  values.multi.reverse();
  assert.equal(variablesChanged(values, baseline), true);
  assert.equal(variablesChanged({ ...values, extra: "" }, baseline), true);
});
