import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLatestJson,
  formatRfc3339,
  parseGithubRepoFromEndpoint,
} from "../scripts/generate-latest-json.ts";

test("buildLatestJson fills every updater manifest field", () => {
  const manifest = buildLatestJson({
    version: "1.3.1",
    exeFileName: "PromptDock_1.3.1_x64-setup.exe",
    signature: "untrusted comment: signature\nRWSigData",
    notes: "修复与改进",
    pubDate: "2026-08-28T12:00:00Z",
    downloadBaseUrl: "https://github.com/Q-Hz/promptdock/releases/download/v1.3.1",
  });

  assert.deepEqual(manifest, {
    version: "1.3.1",
    notes: "修复与改进",
    pub_date: "2026-08-28T12:00:00Z",
    platforms: {
      "windows-x86_64": {
        signature: "untrusted comment: signature\nRWSigData",
        url: "https://github.com/Q-Hz/promptdock/releases/download/v1.3.1/PromptDock_1.3.1_x64-setup.exe",
      },
    },
  });
});

test("parseGithubRepoFromEndpoint extracts owner and repo", () => {
  assert.deepEqual(
    parseGithubRepoFromEndpoint(
      "https://github.com/Q-Hz/promptdock/releases/latest/download/latest.json"
    ),
    { owner: "Q-Hz", repo: "promptdock" }
  );
  assert.equal(parseGithubRepoFromEndpoint("https://example.com/latest.json"), null);
});

test("formatRfc3339 yields a UTC timestamp with second precision", () => {
  assert.equal(formatRfc3339(new Date("2026-08-28T06:30:00.123Z")), "2026-08-28T06:30:00Z");
});
