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

test("preview renders dollar and LaTeX delimiters as inline and display math", () => {
  for (const source of [String.raw`Inline $E=mc^2$.`, String.raw`Inline \(x_i^2\).`]) {
    const html = renderPreviewMarkdown(source);
    assert.match(html, /class="katex"/);
    assert.match(html, /<math/);
    assert.doesNotMatch(html, /class="katex-display"/);
  }
  for (const source of [String.raw`$$\frac{a}{b}$$`, String.raw`\[\sum_{i=1}^{n} i\]`, "$$\n\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}\n$$"]) {
    assert.match(renderPreviewMarkdown(source), /class="katex-display"/);
  }
});

test("math syntax stays literal in code, escaped dollars and ordinary currency", () => {
  const source = '`$x_i$`\n\n```latex\n\\[x^2\\]\n$$y$$\n```\n\nPrice: $5 and $10.\n\nEscaped: \\$x$.';
  const html = renderPreviewMarkdown(source);
  assert.doesNotMatch(html, /class="katex/);
  assert.match(html, /\$x_i\$/);
  assert.match(html, /\$5 and \$10/);
  assert.match(html, /\$x\$/);
});

test("invalid formulas and unmatched delimiters do not break surrounding Markdown", () => {
  const html = renderPreviewMarkdown('# Title\n\n$\\notARealMacro{x}$\n\n**Still visible**\n\nUnclosed $x + 1');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /notARealMacro/);
  assert.match(html, /<strong>Still visible<\/strong>/);
  assert.match(html, /Unclosed \$x \+ 1/);
});

test("formula commands cannot load images, create links or inject HTML", () => {
  const html = renderPreviewMarkdown(String.raw`$\includegraphics{https://example.com/a.png}$

$\href{javascript:alert(1)}{click}$

$\htmlStyle{background:url(https://example.com/x)}{x}$`);
  assert.doesNotMatch(html, /<img|<script|<a\s|style=["'][^"']*background:\s*url\(/i);
});

test("custom formula definitions cannot leak into another preview", () => {
  renderPreviewMarkdown(String.raw`$\gdef\PromptDockTestMacro{42}\PromptDockTestMacro$`);
  const html = renderPreviewMarkdown(String.raw`$\PromptDockTestMacro$`);
  assert.match(html, /PromptDockTestMacro/);
  assert.doesNotMatch(html, /<mn>42<\/mn>/);
});
