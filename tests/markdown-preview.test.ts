import assert from "node:assert/strict";
import test from "node:test";
import { renderPreviewMarkdown } from "../src/lib/markdown-preview.ts";

test("preview renders common Markdown structure", () => {
  const html = renderPreviewMarkdown("# 标题\n\n- **通过**\n- `代码`\n\n> 引用");
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<strong>通过<\/strong>/);
  assert.match(html, /<code>代码<\/code>/);
  assert.match(html, /<blockquote>/);
});

test("preview escapes raw HTML and does not load Markdown images", () => {
  const html = renderPreviewMarkdown('<script>alert(1)</script>\n\n![remote](https://example.com/a.png)');
  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /remote/);
});

test("preview rejects script links", () => {
  const html = renderPreviewMarkdown("[click](javascript:alert(1))");
  assert.doesNotMatch(html, /href=["']javascript:/i);
});

test("preview links stay out of the launcher's keyboard focus order", () => {
  const html = renderPreviewMarkdown("[docs](https://example.com)");
  assert.match(html, /<a[^>]*tabindex="-1"/);
});
