import assert from "node:assert/strict";
import test from "node:test";
import { LauncherPreviewPreference } from "../src/lib/launcher-preview-preference.ts";

test("the last preview choice survives new launcher instances, including closed", async () => {
  let stored = "";
  const storage = { read: async () => stored, write: async (value: string) => { stored = value; } };
  const first = new LauncherPreviewPreference(storage);
  assert.equal(await first.restore(), false);
  await first.save(true);
  await first.flush();
  assert.equal(await new LauncherPreviewPreference(storage).restore(), true);
  await first.save(false);
  assert.equal(await new LauncherPreviewPreference(storage).restore(), false);
});

test("a late startup read cannot overwrite a newer user choice", async () => {
  let release!: (value: string) => void;
  let stored = "false";
  const preference = new LauncherPreviewPreference({
    read: () => new Promise<string>(resolve => { release = resolve; }),
    write: async value => { stored = value; },
  });
  const restore = preference.restore();
  await Promise.resolve();
  const save = preference.save(true);
  release("false");
  assert.equal(await restore, true);
  await save;
  assert.equal(stored, "true");
});

test("exit flush waits for rapid toggles and retries a failed final save", async () => {
  const writes: string[] = [];
  let release!: () => void;
  let fail = true;
  const preference = new LauncherPreviewPreference({
    read: async () => "false",
    write: async value => {
      writes.push(value);
      if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
      if (value === "false" && fail) throw new Error("write failed");
    },
  });
  const open = preference.save(true);
  const close = preference.save(false);
  const closeFailure = assert.rejects(close, /write failed/);
  let flushed = false;
  const flush = preference.flush().then(() => { flushed = true; });
  const flushFailure = assert.rejects(flush, /write failed/);
  await Promise.resolve();
  assert.deepEqual(writes, ["true"]);
  assert.equal(flushed, false);
  release();
  await Promise.all([open, closeFailure, flushFailure]);
  fail = false;
  await preference.flush();
  assert.deepEqual(writes, ["true", "false", "false", "false"]);
  assert.equal(await preference.restore(), false);
});

test("failed restoration never writes a default over an existing preference", async () => {
  let writes = 0;
  const preference = new LauncherPreviewPreference({
    read: async () => { throw new Error("not ready"); },
    write: async () => { writes++; },
  });
  await assert.rejects(preference.restore(), /not ready/);
  await preference.flush();
  assert.equal(writes, 0);
});

test("an earlier matching value does not mark a later failed toggle as saved", async () => {
  let stored = "false";
  let attempts = 0;
  const preference = new LauncherPreviewPreference({
    read: async () => stored,
    write: async value => {
      if (++attempts === 3) throw new Error("last toggle failed");
      stored = value;
    },
  });
  const first = preference.save(true);
  const second = preference.save(false);
  const last = assert.rejects(preference.save(true), /last toggle failed/);
  await Promise.all([first, second, last]);
  assert.equal(stored, "false");
  await preference.flush();
  assert.equal(stored, "true");
});
