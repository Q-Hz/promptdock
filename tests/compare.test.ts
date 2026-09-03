import { test } from "node:test";
import assert from "node:assert/strict";

import { diffLines, shortId, titleKey } from "../src/lib/compare.ts";

// 与 Rust 端 import_logic::normalize_title 使用同一组样例（PRD 4.2）
test("titleKey trims Unicode whitespace only", () => {
  assert.equal(titleKey(" Code review "), "Code review");
  assert.equal(titleKey("　代码审查　"), "代码审查"); // 全角空格 U+3000
  assert.equal(titleKey("\tCode\nreview\r\n"), "Code\nreview"); // 制表符与换行
  assert.notEqual(titleKey("Code review"), titleKey("code review")); // 区分大小写
  assert.notEqual(titleKey("a  b"), titleKey("a b")); // 不折叠中间空格
  assert.equal(titleKey("　Code review "), "Code review"); // 混合空白
});

test("shortId stays unique among peers", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const peer = "aaaaaaaa-1111-2222-3333-444444444444";
  const short = shortId(id, [peer]);
  // 前 8 位与 peer 冲突，逐位延长到能区分
  assert.equal(short, "aaaaaaaa-b");
  assert.ok(!peer.startsWith(short));
  assert.equal(shortId(id, []), "aaaaaaaa");
});

test("shortId falls back to full id when unavoidable", () => {
  const id = "abcdef1234567890";
  // peer 与 id 拥有无限长公共前缀是不可能的（id 唯一），此处验证逐位延长逻辑
  const peers = ["abcdef1234", "abcdef12345", "abcdef123456"];
  const short = shortId(id, peers);
  assert.ok(!peers.some((p) => p.startsWith(short)) || short === id);
});

test("diffLines reports equal texts as all-equal rows", () => {
  const rows = diffLines("a\nb", "a\nb");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.type === "equal"));
});

test("diffLines handles empty sides", () => {
  assert.deepEqual(diffLines("", ""), []);
  const added = diffLines("", "x\ny");
  assert.equal(added.length, 2);
  assert.ok(added.every((r) => r.type === "add"));
  const removed = diffLines("x\ny", "");
  assert.equal(removed.length, 2);
  assert.ok(removed.every((r) => r.type === "remove"));
});

test("diffLines marks pure insertions and deletions", () => {
  const rows = diffLines("a\nb\nc", "a\nc");
  assert.equal(rows[0].type, "equal");
  assert.equal(rows[1].type, "remove");
  assert.equal(rows[2].type, "equal");
});

test("diffLines pairs changed lines as modify with char-level segments", () => {
  const rows = diffLines("hello world", "hello brave world");
  const modify = rows.find((r) => r.type === "modify");
  assert.ok(modify);
  const changedLeft = modify.left!.filter((s) => s.changed).map((s) => s.text).join("");
  const changedRight = modify.right!.filter((s) => s.changed).map((s) => s.text).join("");
  // 左侧整行都是公共子序列（hello + world 在右侧仍按序出现），右侧仅 "brave" 为新增
  assert.equal(changedLeft, "");
  assert.equal(changedRight.trim(), "brave");
  const sameLeft = modify.left!.filter((s) => !s.changed).map((s) => s.text).join("");
  assert.equal(sameLeft, "hello world");
});

test("diffLines preserves raw text without normalization", () => {
  const rows = diffLines("a  b", "a b");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "modify");
});
