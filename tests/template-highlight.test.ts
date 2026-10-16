import assert from "node:assert/strict";
import test from "node:test";
import { highlightTemplate, templateBlockRanges } from "../src/lib/template-highlight.ts";

test("highlighting preserves source exactly, including whitespace and incomplete edits", () => {
  for (const source of ["", "plain <img src=x> & 中文", "\t{{value}}\r\n{{未完成", "{{multi+=[a|b]~\\n}}\n\n"]) {
    assert.equal(highlightTemplate(source).map(part => part.text).join(""), source);
  }
});

test("block shading covers opening and closing markers, text, indentation and blank lines", () => {
  const block = "  :::options 修复\r\n:::option [x] 公式\r\n\r\n  修复 {{符号=u}}\r\n:::end";
  const source = `Before\r\n${block}\r\nAfter`;
  assert.deepEqual(templateBlockRanges(source), [{ start: 8, end: 8 + block.length }]);
  assert.equal(source.slice(8, 8 + block.length), block);
});

test("separate blocks keep intervening prose unshaded and incomplete blocks extend to EOF", () => {
  const first = ":::options first\n:::option [ ] A\nText\n:::end";
  const last = ":::options second\n:::option [x] B\nUnfinished\n";
  const source = `${first}\nProse {{text}}\n${last}`;
  assert.deepEqual(templateBlockRanges(source).map(r => source.slice(r.start, r.end)), [first, last]);
  assert.deepEqual(templateBlockRanges("inline :::options example\n:::option [x] A\n:::end\n{{text}}"), []);
});

test("all variable forms and snippet boundaries receive presentation tokens", () => {
  const source = "{{text}} {{count=3}} {{language=[中文|English]}} {{checks+=[a|b]}} {{@修复}}\n"
    + ":::options 修复\r\n  :::option [x] 公式\n- 修复 {{symbol=u}}\n:::end\n";
  const parts = highlightTemplate(source);
  assert.equal(parts.map(p => p.text).join(""), source);
  assert.equal(parts.filter(p => p.kind === "variable").length, 5);
  assert.equal(parts.filter(p => p.kind === "reference").length, 1);
  assert.equal(parts.filter(p => p.kind === "definition").length, 3);
  assert.equal(highlightTemplate("text :::options not a boundary")[0].kind, "text");
});
