import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerPreview } from "../src/lib/manager-preview.ts";
import { setLanguage } from "../src/lib/i18n.ts";

setLanguage("zh");

test("template preview protects variables from Markdown, including table pipes", () => {
  const result = buildManagerPreview("# Title\n\n| Field | Value |\n| --- | --- |\n| Language | {{语言=[**中文**|English]}} |\n\n{{要求+=[a|b]~\\n}} {{主题}}");
  assert.match(result.html, /<h1>Title<\/h1>/);
  assert.equal((result.html.match(/<td>/g) ?? []).length, 2);
  assert.match(result.html, /语言 · 单选/);
  assert.match(result.html, /要求 · 多选/);
  assert.doesNotMatch(result.html, /<strong>中文/);
  assert.ok(result.hints.some(h => h.includes("{{语言=[**中文**|English]}}")));
  assert.ok(result.hints.some(h => h.includes("\\n")));
});

test("code keeps literal variables and snippet definitions", () => {
  const source = '`{{主题=**text**}}`\n\n```text\n{{语言=[a|b]}}\n:::options example\n:::option [x] Example\nbody\n:::end\n```\n\n    {{indented}}';
  const result = buildManagerPreview(source);
  assert.equal(result.groups.length, 0);
  assert.equal(result.hints.length, 0);
  assert.match(result.html, /<code>\{\{主题=\*\*text\*\*\}\}<\/code>/);
  assert.match(result.html, /:::options example/);
  assert.match(result.html, /\{\{indented\}\}/);
});

test("multiline inline code cannot turn its example definitions into real groups", () => {
  const result = buildManagerPreview('`\n:::options example\n:::option [x] Example\n{{variable}}\n:::end\n`');
  assert.equal(result.groups.length, 0);
  assert.equal(result.hints.length, 0);
  assert.match(result.html, /<code>.*:::options example.*\{\{variable\}\}.*<\/code>/);
});

test("definitions render once in source order with all options and repeated references", () => {
  const source = '{{@checks}}\n{{@checks}}\n\n:::options checks\n:::option [x] **First**\n- **Check** {{language=中文}}\n:::option [ ] Second\nOther\n:::end';
  const result = buildManagerPreview(source);
  assert.equal((result.html.match(/data-preview-token/g) ?? []).length, 2);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].options.length, 2);
  assert.equal(result.groups[0].options[0].title, "**First**");
  assert.equal(result.groups[0].options[0].checked, true);
  assert.equal(result.groups[0].options[1].checked, false);
  assert.match(result.groups[0].options[0].html, /<strong>Check<\/strong>/);
  assert.doesNotMatch(result.html, /:::options/);
});

test("broken templates remain visible without guessing or dropping content", () => {
  const source = '# Draft\n{{@missing}} {{unfinished\n:::options broken\n:::option [x] One\nKeep this';
  const result = buildManagerPreview(source);
  assert.match(result.html, /<h1>Draft/);
  assert.match(result.html, /未找到定义/);
  assert.match(result.html, /\{\{unfinished/);
  assert.match(result.html, /:::options broken/);
  assert.match(result.html, /Keep this/);
  const nested = buildManagerPreview(':::options outer\n:::option [x] Outer\n:::options inner\n:::option [x] Inner\nKeep nested text\n:::end\n:::end');
  assert.equal(nested.groups.length, 0);
  assert.match(nested.html, /:::options inner/);
  assert.match(nested.html, /Keep nested text/);
});

test("preview escapes source and metadata, never emits images or executable links", () => {
  const source = '<script>alert(1)</script>\n\n{{name=<img src=x onerror=alert(1)>}}\n\n![remote](https://example.com/a.png) [bad](javascript:alert(1))\n\n[link](https://example.com/{{path}})';
  const result = buildManagerPreview(source);
  assert.doesNotMatch(result.html, /<script|<img|href="javascript:/i);
  assert.match(result.html, /&lt;script&gt;/);
  assert.ok(result.hints.some(h => h.includes("<img src=x")));
  assert.doesNotMatch(result.html, /href="[^"\n]*<span/);
  assert.doesNotMatch(result.html, /PDVAR/);
});

test("a variable example containing literal snippet delimiters cannot create definitions", () => {
  const result = buildManagerPreview('{{text=\n:::options fake\n:::option [x] Fake\nbody\n:::end\n}}');
  assert.equal(result.groups.length, 0);
  assert.equal(result.hints.length, 1);
});

test("unrecognizable references and marker-like source remain literal", () => {
  const result = buildManagerPreview('PDVAR0Z0Z {{@}} {{@  }} {{=value}} {{valid}}');
  assert.match(result.html, /PDVAR0Z0Z/);
  assert.match(result.html, /\{\{@\}\}/);
  assert.match(result.html, /\{\{=value\}\}/);
  assert.equal(result.hints.length, 1);
});

test("manager renders formulas in body and snippets without corrupting TeX groups or variables", () => {
  const source = '# Math {{topic}}\n\n$\\frac{{a}}{{b}}$\n\n\\[x_i^2 + y_i^2 = r^2\\]\n\n{{@math}}\n\n:::options math\n:::option [x] Equation\n$$\\int_0^1 x^2\\,dx$$\n{{note=Explain the result}}\n:::end';
  const result = buildManagerPreview(source);
  assert.match(result.html, /class="katex"/);
  assert.match(result.html, /class="katex-display"/);
  assert.match(result.groups[0].options[0].html, /class="katex-display"/);
  assert.ok(result.hints.some(hint => hint.includes('{{topic}}')));
  assert.ok(result.hints.some(hint => hint.includes('{{note=Explain the result}}')));
  assert.doesNotMatch(result.html + result.groups[0].options[0].html, /PDVAR|katex-error/);
});
