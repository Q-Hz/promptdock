import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLatestJson,
  formatRfc3339,
  parseGithubRepoFromEndpoint,
  selectReleaseArtifacts,
} from "../scripts/generate-latest-json.ts";

test("buildLatestJson fills every updater manifest field", () => {
  const manifest = buildLatestJson({
    version: "1.4.0",
    windowsFileName: "PromptDock_1.4.0_x64-setup.exe",
    windowsSignature: "untrusted comment: windows signature\nRWSigData",
    macFileName: "PromptDock.app.tar.gz",
    macSignature: "untrusted comment: mac signature\nRWMacSigData",
    notes: "修复与改进",
    pubDate: "2026-08-28T12:00:00Z",
    downloadBaseUrl: "https://github.com/Q-Hz/promptdock/releases/download/v1.4.0",
  });

  assert.deepEqual(manifest, {
    version: "1.4.0",
    notes: "修复与改进",
    pub_date: "2026-08-28T12:00:00Z",
    platforms: {
      "windows-x86_64": {
        signature: "untrusted comment: windows signature\nRWSigData",
        url: "https://github.com/Q-Hz/promptdock/releases/download/v1.4.0/PromptDock_1.4.0_x64-setup.exe",
      },
      "darwin-aarch64": {
        signature: "untrusted comment: mac signature\nRWMacSigData",
        url: "https://github.com/Q-Hz/promptdock/releases/download/v1.4.0/PromptDock.app.tar.gz",
      },
    },
  });
});

test("buildLatestJson URL-encodes release asset names", () => {
  const manifest = buildLatestJson({
    version: "1.4.0",
    windowsFileName: "PromptDock 1.4.0 setup.exe",
    windowsSignature: "windows-signature",
    macFileName: "PromptDock Apple Silicon.app.tar.gz",
    macSignature: "mac-signature",
    notes: "",
    pubDate: "2026-08-28T12:00:00Z",
    downloadBaseUrl: "https://example.com/v1.4.0",
  });
  assert.equal(
    manifest.platforms["darwin-aarch64"].url,
    "https://example.com/v1.4.0/PromptDock%20Apple%20Silicon.app.tar.gz"
  );
});

test("selectReleaseArtifacts requires the two platform payloads and their signatures", () => {
  assert.deepEqual(
    selectReleaseArtifacts(
      [
        "PromptDock_1.4.0_x64-setup.exe",
        "PromptDock_1.4.0_x64-setup.exe.sig",
        "PromptDock_1.4.0_aarch64.dmg",
        "PromptDock.app.tar.gz",
        "PromptDock.app.tar.gz.sig",
      ],
      "1.4.0"
    ),
    {
      windowsFileName: "PromptDock_1.4.0_x64-setup.exe",
      macDmgFileName: "PromptDock_1.4.0_aarch64.dmg",
      macFileName: "PromptDock.app.tar.gz",
    }
  );
  assert.throws(
    () =>
      selectReleaseArtifacts(
        [
          "PromptDock_1.4.0_x64-setup.exe",
          "PromptDock_1.4.0_x64-setup.exe.sig",
          "PromptDock_1.4.0_aarch64.dmg",
          "PromptDock.app.tar.gz",
        ],
        "1.4.0"
      ),
    /PromptDock\.app\.tar\.gz\.sig/
  );
});

test("selectReleaseArtifacts rejects unsupported macOS architectures", () => {
  assert.throws(
    () =>
      selectReleaseArtifacts(
        [
          "PromptDock_1.4.0_x64-setup.exe",
          "PromptDock_1.4.0_x64-setup.exe.sig",
          "PromptDock_1.4.0_x86_64.dmg",
          "PromptDock_x86_64.app.tar.gz",
          "PromptDock_x86_64.app.tar.gz.sig",
        ],
        "1.4.0"
      ),
    /Apple Silicon/
  );
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
