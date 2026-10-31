import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SnippetSession, templateDiagnostics } from "../src/lib/optional-snippets.ts";
import { setLanguage } from "../src/lib/i18n.ts";
import { VARIABLE_EXAMPLE_KINDS, variableExample } from "../src/lib/variable-examples.ts";
import { acceptanceBody } from "./browser/optional-snippet-fixtures.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const defaults = JSON.parse(read("../src-tauri/src/default-prompts.json"));

for (const [locale, title] of [["zh", "提示词标准化"], ["en", "Prompt Standardization"]]) {
  test(`${locale} bundled syntax guide only fills its invocation inputs`, () => {
    const prompt = defaults.prompts.find((p: { title: string }) => p.title === title);
    assert.ok(prompt, "The bundled guide must exist");
    const guide = prompt.body.replace(/\r\n/g, "\n");
    const session = new SnippetSession(guide);
    assert.deepEqual(session.variables.map(v => v.name), ["source_prompt", "note_language", "note"], "Only the source, language and notes create fields");
    assert.equal(session.variables[1].type, "select");
    assert.equal(session.variables[1].options.length, 2);
    assert.equal(session.template.groups.length, 0, "Teaching markers must not become live definitions");
    assert.deepEqual(session.diagnostics, []);
    const expected = (source: string, language: string, note: string) => guide
      .replace("{{source_prompt}}", () => source)
      .replace(/\{\{note_language=\[[^\]]+\]\}\}/, () => language)
      .replace("{{note}}", () => note);
    assert.equal(session.render(), expected("", session.variables[1].options[0], ""));
    session.values.source_prompt = "Rewrite a prompt about {{future_input}}.\n:::options source example";
    session.values.note_language = session.variables[1].options[1];
    session.values.note = "Preserve the original goal and constraints.";
    assert.equal(session.render(), expected(session.values.source_prompt, session.values.note_language, session.values.note), "Only invocation inputs change; the complete lesson and source syntax remain intact");
  });

  test(`${locale} guide's complete teaching example converts into a valid working template`, () => {
    const guide = defaults.prompts.find((p: { title: string }) => p.title === title).body.replace(/\r\n/g, "\n");
    const sample = guide.split("\n").filter(line => line.startsWith(">"))
      .map(line => line.replace(/^> ?/, "")).join("\n")
      .replace(/\{([^{}]+)\}/g, "{{$1}}");
    assert.ok(sample.includes(":::options"));
    const session = new SnippetSession(sample);
    assert.deepEqual(templateDiagnostics(session.template), []);
    assert.ok(session.variables.some(v => v.type === "text"));
    assert.ok(session.variables.some(v => v.type === "select"));
    assert.ok(session.variables.some(v => v.type === "multi"));
    assert.equal(session.template.groups[0].options.length, 2);
    assert.doesNotMatch(session.render(), /:::|\{\{/);
  });
}

test("synthetic acceptance template exercises defaults, shared references, conditional fields and a toggle", () => {
  const session = new SnippetSession(acceptanceBody);
  assert.deepEqual(templateDiagnostics(session.template), []);
  assert.deepEqual(session.selections.checks, ["0", "2"]);
  assert.deepEqual(session.selections.summary, []);
  assert.equal(session.entries.filter(e => e.kind === "group").length, 2);
  assert.equal(session.values.symbol, undefined);
  session.toggle("checks", "1");
  session.values.symbol = "u_0";
  session.toggle("checks", "1");
  session.toggle("checks", "1");
  assert.equal(session.values.symbol, "u_0");
  assert.deepEqual(session.selections.checks, ["0", "2", "1"]);
  assert.equal(session.variables.filter(v => v.name === "language").length, 1);
  assert.equal((session.render().match(/u_0/g) ?? []).length, 2);
  assert.doesNotMatch(session.render(), /:::|\{\{/);
});

test("localized help examples generate the exact text shown beside their screenshots", () => {
  for (const locale of ["zh", "en"] as const) {
    setLanguage(locale);
    for (const kind of VARIABLE_EXAMPLE_KINDS) {
      const example = variableExample(kind);
      const session = new SnippetSession(example.code);
      assert.deepEqual(templateDiagnostics(session.template), []);
      assert.ok(example.need.length > 0);
      if (kind === "Plain") session.values[session.variables[0].name] = locale === "zh"
        ? "今天完成了需求评审。" : "We completed the requirements review today.";
      if (kind === "Select") session.values[session.variables[0].name] = session.variables[0].options[1];
      if (kind === "Multi") {
        const variable = session.variables[0];
        session.values[variable.name] = [variable.options[0], variable.options[2]];
      }
      assert.equal(session.render().trimEnd(), example.generated, `${locale} ${kind}`);
      const image = readFileSync(new URL(`../src/assets/variable-examples/${locale}/${kind.toLowerCase()}.png`, import.meta.url));
      assert.equal(image.subarray(1, 4).toString(), "PNG");
      assert.ok(image.readUInt32BE(16) >= 300 && image.readUInt32BE(20) >= 40);
    }
  }
});
