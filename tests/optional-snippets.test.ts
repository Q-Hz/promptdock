import assert from "node:assert/strict";
import test from "node:test";
import { parseSnippetTemplate, SnippetSession, templateDiagnostics } from "../src/lib/optional-snippets.ts";

const body = [
  "Start {{language=中文}}", "{{@checks}}", "End", "",
  ":::options checks", ":::option [x] First", "", "- First {{count=3}}", "  indented", "", "inside", "",
  ":::option [ ] Second", "- Second {{tone=[formal|friendly]}} {{tags+=[a|b]~\\n}}", ":::end",
].join("\n");

test("definitions are excluded, defaults initialize in definition order, and fields are conditional", () => {
  const session = new SnippetSession(body);
  assert.deepEqual(session.selections.checks, ["0"]);
  assert.deepEqual(session.variables.map(v => v.name), ["language", "count"]);
  assert.equal(session.values.count, "3");
  assert.equal(session.render(), "Start 中文\n- First 3\n  indented\n\ninside\nEnd\n\n");
  assert.equal(session.dirty, false);
});

test("selection order is click order, including uncheck and recheck", () => {
  const session = new SnippetSession(body);
  session.toggle("checks", "1");
  session.toggle("checks", "0");
  session.toggle("checks", "0");
  session.values.tags = ["b", "a"];
  assert.deepEqual(session.selections.checks, ["1", "0"]);
  assert.equal(session.render(), "Start 中文\n- Second formal b\na\n- First 3\n  indented\n\ninside\nEnd\n\n");
});

test("multiple defaults follow definition order before newly selected options", () => {
  const session = new SnippetSession("{{@g}}\n:::options g\n:::option [x] First\nfirst\n:::option [ ] Second\nsecond\n:::option [x] Third\nthird\n:::end");
  assert.deepEqual(session.selections.g, ["0", "2"]);
  session.toggle("g", "1");
  assert.equal(session.render(), "first\nthird\nsecond\n");
});

test("hidden values are cached for this invocation and excluded from generation and dirty checks", () => {
  const session = new SnippetSession(body);
  session.toggle("checks", "1");
  session.values.tone = "friendly";
  session.values.tags = ["b"];
  session.toggle("checks", "1");
  assert.equal(session.dirty, false);
  assert.equal("tone" in session.values, false);
  assert.ok(!session.render().includes("friendly"));
  session.toggle("checks", "1");
  assert.equal(session.values.tone, "friendly");
  assert.deepEqual(session.values.tags, ["b"]);
  assert.equal(new SnippetSession(body).values.tone, undefined);
});

test("repeated group references share one selection and render each occurrence", () => {
  const session = new SnippetSession(body.replace("End", "Again: {{@checks}}"));
  assert.equal(session.entries.filter(e => e.kind === "group").length, 1);
  assert.equal(session.render().split("- First 3").length, 3);
});

test("an empty standalone reference removes its complete line, while inline text is preserved", () => {
  const source = "Before\n  {{@g}}  \nAfter {{@g}}!\n:::options g\n:::option [ ] Optional\ntext\n:::end";
  assert.equal(new SnippetSession(source).render(), "Before\nAfter !\n");
});

test("CRLF, boundary blank lines, interior whitespace and literal Markdown symbols survive", () => {
  const source = "{{@g}}\r\n:::options g\r\n:::option [x] Math\r\n \r\n  x = [a|b] + $$ y $$\r\n\r\n  z\r\n\t\r\n:::end\r\n";
  assert.equal(new SnippetSession(source).render(), "  x = [a|b] + $$ y $$\r\n\r\n  z\r\n");
});

test("all four existing variable kinds work in selected snippets", () => {
  const session = new SnippetSession("{{@g}}\n:::options g\n:::option [x] Fields\n{{plain}}/{{default=ok}}/{{choice=[a|b]}}/{{multi+=[x|y]}}\n:::end");
  assert.deepEqual(session.variables.map(v => v.type), ["text", "text", "select", "multi"]);
  session.values.plain = "hello";
  session.values.multi = ["y", "x"];
  assert.equal(session.render(), "hello/ok/a/y, x\n");
});

test("ordinary same-name references share one field with body ownership and an explicit default", () => {
  const session = new SnippetSession("{{name}}\n{{@g}}\n:::options g\n:::option [x] A\n{{name=shared}} {{name=shared}}\n:::end");
  assert.equal(session.variables.length, 1);
  assert.equal(session.variables[0].owner, undefined);
  assert.equal(session.values.name, "shared");
  assert.equal(session.render(), "shared\nshared shared\n");
});

test("a shared field moves to the remaining selected snippet without losing its value", () => {
  const session = new SnippetSession("{{@first}}\n{{@second}}\n:::options first\n:::option [x] A\n{{tags+=[a|b]}}\n:::end\n:::options second\n:::option [x] B\n{{tags+=[a|b]}}\n:::end");
  session.values.tags = ["b", "a"];
  assert.equal(session.variables.length, 1);
  assert.deepEqual(session.variables[0].owner, { group: "first", option: "0" });
  session.toggle("first", "0");
  assert.equal(session.variables.length, 1);
  assert.deepEqual(session.variables[0].owner, { group: "second", option: "0" });
  assert.deepEqual(session.values.tags, ["b", "a"]);
  assert.equal(session.render(), "b, a\n");
  session.toggle("second", "0");
  assert.equal(session.variables.length, 0);
  session.toggle("first", "0");
  assert.deepEqual(session.values.tags, ["b", "a"]);
});

test("only simultaneously active conflicting declarations block generation", () => {
  const source = "{{@g}}\n:::options g\n:::option [x] A\n{{count=3}}\n:::option [ ] B\n{{count=5}}\n:::end";
  const session = new SnippetSession(source);
  assert.equal(session.diagnostics.length, 0);
  assert.equal(templateDiagnostics(session.template)[0].severity, "warning");
  session.values.count = "9";
  session.toggle("g", "1");
  assert.ok(session.diagnostics.some(d => d.code === "conflict" && d.line === 6 && d.relatedLine === 4));
  assert.throws(() => session.render());
  session.toggle("g", "0");
  assert.equal(session.values.count, "5");
  assert.equal(session.diagnostics.length, 0);
  session.toggle("g", "1");
  session.toggle("g", "0");
  assert.equal(session.values.count, "9");
});

test("permanent body declarations participate in conditional conflicts", () => {
  const session = new SnippetSession(body.replace("{{language=中文}}", "{{count=5}}"));
  assert.ok(session.diagnostics.some(d => d.code === "conflict"));
  session.toggle("checks", "0");
  assert.equal(session.diagnostics.length, 0);
});

test("different types, candidate lists and multi separators are conflicting configurations", () => {
  for (const [a, b] of [["x=1", "x=[1|2]"], ["x=[a|b]", "x=[a|c]"], ["x+=[a|b]", "x+=[a|b]~\\n"]]) {
    const session = new SnippetSession(`{{${a}}}\n{{@g}}\n:::options g\n:::option [x] A\n{{${b}}}\n:::end`);
    assert.ok(session.diagnostics.some(d => d.code === "conflict"));
  }
});

test("malformed definitions and missing groups have source line diagnostics", () => {
  const cases: Array<[string, string, number]> = [
    ["hi\n{{@missing}}", "missingGroup", 2],
    ["hi\n{{@unfinished", "invalidReference", 2],
    [":::options g\n:::option [x] A\nbody", "unclosedGroup", 1],
    [":::option [x] A", "orphanOption", 1],
    [":::end", "orphanEnd", 1],
    [":::options g\n:::option [?] A\n:::end", "invalidOption", 2],
    [":::options g\nbody\n:::end", "unexpectedContent", 2],
    [":::options g\n:::end", "emptyGroup", 1],
    [":::options g\n:::option [x] A\n{{@other}}\n:::end", "nestedReference", 3],
    [":::options g\n:::options h\n:::end", "nestedGroup", 2],
  ];
  for (const [source, code, line] of cases) {
    const template = parseSnippetTemplate(source);
    assert.ok(template.diagnostics.some(d => d.code === code && d.line === line), `${code}: ${JSON.stringify(template.diagnostics)}`);
    assert.throws(() => new SnippetSession(template).render());
  }
});

test("duplicate groups error, unused definitions produce no controls or output", () => {
  const definition = ":::options g\n:::option [x] A\n{{hidden}}\n:::end\n";
  assert.ok(parseSnippetTemplate(definition + definition).diagnostics.some(d => d.code === "duplicateGroup" && d.line === 5));
  const session = new SnippetSession("Visible\n" + definition);
  assert.equal(session.variables.length, 0);
  assert.equal(session.entries.length, 0);
  assert.equal(session.render(), "Visible\n");
});

test("filled values are never reinterpreted as variable or group syntax", () => {
  const session = new SnippetSession("{{text}}\n{{@g}}\n:::options g\n:::option [x] A\n{{inside}}\n:::end");
  session.values.text = "{{@g}}";
  session.values.inside = "{{text}}\n:::end";
  assert.equal(session.render(), "{{@g}}\n{{text}}\n:::end\n");
});

test("group and variable names occupy separate namespaces and arbitrary object keys work", () => {
  const session = new SnippetSession("{{g=body}} {{__proto__=safe}} {{@g}}\n:::options g\n:::option [x] A\n{{constructor=ok}}\n:::end");
  assert.equal(session.render(), "body safe ok\n");
});

test("templates without groups retain existing text/select/multi generation", () => {
  const session = new SnippetSession("{{plain}} {{default=ok}} {{choice=[a|b]}} {{multi+=[x|y]~\\n}}");
  assert.equal(session.render(), " ok a ");
  session.values.plain = "text";
  session.values.multi = ["y", "x"];
  assert.equal(session.render(), "text ok a y\nx");
});

test("bare references share the configured separator of a same-name multi variable", () => {
  const session = new SnippetSession("{{tags}}\n{{@g}}\n:::options g\n:::option [x] A\n{{tags+=[a|b]~\\n}}\n:::end");
  session.values.tags = ["a", "b"];
  assert.equal(session.variables.length, 1);
  assert.equal(session.render(), "a\nb\na\nb\n");
});
