import { parseVariables, type ParsedVar } from "./api.ts";

export type VariableValue = string | string[];
export type SnippetSelections = Record<string, string[]>;
export interface TemplateDiagnostic {
  code: "invalidGroup" | "duplicateGroup" | "nestedGroup" | "unclosedGroup" | "emptyGroup"
    | "invalidOption" | "orphanOption" | "orphanEnd" | "invalidEnd" | "unexpectedContent"
    | "missingGroup" | "invalidReference" | "nestedReference" | "conflict";
  line: number;
  name: string;
  relatedLine?: number;
  severity: "error" | "warning";
}
interface VariableUse {
  variable: ParsedVar;
  explicit: boolean;
  line: number;
  owner?: { group: string; option: string };
}
interface SourcePart { text: string; line: number }
export interface SnippetOption {
  id: string;
  title: string;
  checked: boolean;
  body: string;
  line: number;
  uses: VariableUse[];
}
export interface SnippetGroup { name: string; line: number; options: SnippetOption[] }
export interface SnippetTemplate {
  parts: SourcePart[];
  groups: SnippetGroup[];
  references: Array<{ name: string; line: number }>;
  rootUses: VariableUse[];
  diagnostics: TemplateDiagnostic[];
  newline: string;
}
export interface SnippetVariable extends ParsedVar {
  line: number;
  signature: string;
  owner?: { group: string; option: string };
}
export type SnippetEntry = { kind: "variable"; variable: SnippetVariable } | { kind: "group"; group: SnippetGroup };

const tokens = () => /\{\{\s*([^{}]+?)\s*\}\}/g;
const lineCount = (text: string) => (text.match(/\r\n|\n|\r/g) ?? []).length;
const copyValue = (value: VariableValue): VariableValue => Array.isArray(value) ? [...value] : value;
const defaultValue = (v: ParsedVar): VariableValue => v.type === "multi" ? [] : v.default;
const signature = (v: ParsedVar) => JSON.stringify([v.name, v.type, v.default, v.options, v.separator]);
const emptyRecord = <T>(): Record<string, T> => Object.create(null);

function scan(text: string, firstLine: number, owner?: VariableUse["owner"]) {
  const uses: VariableUse[] = [];
  const references: SnippetTemplate["references"] = [];
  const validReferenceOffsets = new Set<number>();
  for (const match of text.matchAll(tokens())) {
    const line = firstLine + lineCount(text.slice(0, match.index));
    if (match[1].startsWith("@")) {
      references.push({ name: match[1].slice(1).trim(), line });
      validReferenceOffsets.add(match.index!);
    } else {
      const variable = parseVariables(match[0])[0];
      if (variable) uses.push({ variable, explicit: match[1].includes("="), line, owner });
    }
  }
  const invalidReferences = [...text.matchAll(/\{\{[\t ]*@/g)]
    .filter(m => !validReferenceOffsets.has(m.index!))
    .map(m => firstLine + lineCount(text.slice(0, m.index)));
  return { uses, references, invalidReferences };
}

// Only boundary blank lines belong to the definition layout. Interior whitespace is prompt content.
function trimBoundaryLines(lines: string[]): { body: string; skipped: number } {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return { body: lines.slice(start, end).join("").replace(/(?:\r\n|\n|\r)$/, ""), skipped: start };
}

export function parseSnippetTemplate(body: string): SnippetTemplate {
  const template: SnippetTemplate = {
    parts: [], groups: [], references: [], rootUses: [], diagnostics: [],
    newline: body.match(/\r\n|\n|\r/)?.[0] ?? "\n",
  };
  const lines = body.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
  let group: SnippetGroup | undefined;
  let option: SnippetOption | undefined;
  let optionLines: string[] = [];
  let normal = "";
  let normalLine = 1;
  const error = (code: TemplateDiagnostic["code"], line: number, name = "", relatedLine?: number) =>
    template.diagnostics.push({ code, line, name, relatedLine, severity: "error" });
  const flushNormal = () => {
    if (normal) template.parts.push({ text: normal, line: normalLine });
    normal = "";
  };
  const flushOption = () => {
    if (!option || !group) return;
    const trimmed = trimBoundaryLines(optionLines);
    option.body = trimmed.body;
    const parsed = scan(option.body, option.line + 1 + trimmed.skipped, { group: group.name, option: option.id });
    option.uses = parsed.uses;
    for (const ref of parsed.references) error("nestedReference", ref.line, ref.name);
    for (const line of parsed.invalidReferences) error("invalidReference", line);
    optionLines = [];
    option = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const text = raw.trim();
    const line = index + 1;
    if (/^:::options(?:\s|$)/.test(text)) {
      if (group) {
        error("nestedGroup", line);
        continue;
      }
      flushNormal();
      const name = text.slice(":::options".length).trim();
      if (!name || /[{}]/.test(name)) error("invalidGroup", line, name);
      const previous = template.groups.find(g => g.name === name);
      if (previous) error("duplicateGroup", line, name, previous.line);
      group = { name, line, options: [] };
      template.groups.push(group);
    } else if (/^:::option(?:\s|$)/.test(text)) {
      if (!group) { flushNormal(); error("orphanOption", line); continue; }
      flushOption();
      const match = /^:::option\s+\[([x ])\]\s+(.+)$/.exec(text);
      if (!match) { error("invalidOption", line); continue; }
      option = { id: String(group.options.length), title: match[2].trim(), checked: match[1] === "x", body: "", line, uses: [] };
      group.options.push(option);
    } else if (/^:::end(?:\s|$)/.test(text)) {
      if (text !== ":::end") error("invalidEnd", line);
      if (!group) { flushNormal(); error("orphanEnd", line); continue; }
      flushOption();
      if (!group.options.length) error("emptyGroup", group.line, group.name);
      group = undefined;
    } else if (group) {
      if (option) optionLines.push(raw);
      else if (text) error("unexpectedContent", line, group.name);
    } else {
      if (!normal) normalLine = line;
      normal += raw;
    }
  }
  if (group) { flushOption(); error("unclosedGroup", group.line, group.name); }
  flushNormal();
  for (const part of template.parts) {
    const parsed = scan(part.text, part.line);
    template.rootUses.push(...parsed.uses);
    template.references.push(...parsed.references);
    for (const line of parsed.invalidReferences) error("invalidReference", line);
  }
  for (const ref of template.references) {
    if (!template.groups.some(g => g.name === ref.name)) error("missingGroup", ref.line, ref.name);
  }
  return template;
}

function referencedGroups(template: SnippetTemplate): SnippetGroup[] {
  const seen = new Set<string>();
  return template.references.flatMap(ref => {
    const group = template.groups.find(g => g.name === ref.name);
    if (!group || seen.has(ref.name)) return [];
    seen.add(ref.name);
    return [group];
  });
}

function resolveVariables(uses: VariableUse[]) {
  const byName = new Map<string, VariableUse[]>();
  for (const use of uses) {
    const previous = byName.get(use.variable.name) ?? [];
    previous.push(use);
    byName.set(use.variable.name, previous);
  }
  const variables: SnippetVariable[] = [];
  const diagnostics: TemplateDiagnostic[] = [];
  for (const [name, named] of byName) {
    const explicit = named.filter(u => u.explicit);
    const definition = explicit[0] ?? named[0];
    const sig = signature(definition.variable);
    for (const use of explicit.slice(1)) {
      if (signature(use.variable) !== sig) diagnostics.push({
        code: "conflict", name, line: use.line, relatedLine: definition.line, severity: "error",
      });
    }
    const placement = named.find(use => !use.owner) ?? named[0];
    variables.push({ ...definition.variable, signature: sig, line: definition.line, owner: placement.owner });
  }
  return { variables, diagnostics };
}

export function templateDiagnostics(template: SnippetTemplate): TemplateDiagnostic[] {
  const potential = resolveVariables([
    ...template.rootUses,
    ...referencedGroups(template).flatMap(g => g.options.flatMap(o => o.uses)),
  ]).diagnostics;
  const permanent = resolveVariables(template.rootUses).diagnostics;
  return [...template.diagnostics, ...potential.map(d => ({
    ...d, severity: permanent.some(p => p.name === d.name) ? "error" as const : "warning" as const,
  }))].sort((a, b) => a.line - b.line);
}

export function templateVariableHints(template: SnippetTemplate): ParsedVar[] {
  return resolveVariables([
    ...template.rootUses, ...referencedGroups(template).flatMap(g => g.options.flatMap(o => o.uses)),
  ]).variables;
}

export class SnippetSession {
  template: SnippetTemplate;
  selections: SnippetSelections = emptyRecord();
  values: Record<string, VariableValue> = emptyRecord();
  variables: SnippetVariable[] = [];
  diagnostics: TemplateDiagnostic[] = [];
  private cache = new Map<string, VariableValue>();
  private initialSelections = "";
  private initialValues = "";

  constructor(source: string | SnippetTemplate) {
    this.template = typeof source === "string" ? parseSnippetTemplate(source) : source;
    for (const group of referencedGroups(this.template)) {
      this.selections[group.name] = group.options.filter(o => o.checked).map(o => o.id);
    }
    this.refresh();
    this.initialSelections = JSON.stringify(this.selections);
    this.initialValues = JSON.stringify(this.values);
  }

  get dirty(): boolean {
    return JSON.stringify(this.selections) !== this.initialSelections || JSON.stringify(this.values) !== this.initialValues;
  }

  get entries(): SnippetEntry[] {
    const entries: Array<{ line: number; entry: SnippetEntry }> = [];
    for (const variable of this.variables.filter(v => !v.owner)) {
      const use = this.template.rootUses.find(u => u.variable.name === variable.name)!;
      entries.push({ line: use.line, entry: { kind: "variable", variable } });
    }
    for (const group of referencedGroups(this.template)) {
      entries.push({ line: this.template.references.find(r => r.name === group.name)!.line, entry: { kind: "group", group } });
    }
    return entries.sort((a, b) => a.line - b.line).map(e => e.entry);
  }

  isSelected(group: string, option: string): boolean { return this.selections[group]?.includes(option) ?? false; }

  toggle(group: string, option: string): void {
    if (!this.template.groups.find(g => g.name === group)?.options.some(o => o.id === option)) return;
    const current = this.selections[group] ?? [];
    this.selections[group] = current.includes(option) ? current.filter(id => id !== option) : [...current, option];
    this.refresh();
  }

  private refresh(): void {
    for (const variable of this.variables) this.cache.set(variable.signature, copyValue(this.values[variable.name]));
    const uses = [...this.template.rootUses];
    for (const group of referencedGroups(this.template)) {
      for (const option of group.options) if (this.isSelected(group.name, option.id)) uses.push(...option.uses);
    }
    const resolved = resolveVariables(uses);
    this.variables = resolved.variables;
    this.diagnostics = [...this.template.diagnostics, ...resolved.diagnostics].sort((a, b) => a.line - b.line);
    this.values = emptyRecord();
    for (const v of this.variables) this.values[v.name] = copyValue(this.cache.get(v.signature) ?? defaultValue(v));
  }

  render(): string {
    if (this.diagnostics.length) throw new Error("Invalid prompt template");
    const output = new Map<string, string>();
    const renderVariables = (text: string) => text.replace(tokens(), full => {
      const name = parseVariables(full)[0]?.name;
      const value = this.values[name];
      if (!Array.isArray(value)) return value ?? "";
      return value.join(this.variables.find(v => v.name === name)?.separator ?? ", ");
    });
    for (const group of referencedGroups(this.template)) {
      output.set(group.name, this.selections[group.name].map(id => {
        const option = group.options.find(o => o.id === id)!;
        return renderVariables(option.body);
      }).join(this.template.newline));
    }
    // A single pass prevents filled values (or inserted snippets) from becoming new template instructions.
    const replace = (text: string) => text.replace(
      /^[\t ]*\{\{[\t ]*@([^{}\r\n]+?)[\t ]*\}\}[\t ]*(?:\r\n|\n|\r|$)|\{\{\s*([^{}]+?)\s*\}\}/gm,
      (full, standalone: string | undefined, raw: string | undefined) => {
        if (standalone !== undefined) {
          const value = output.get(standalone.trim()) ?? "";
          return value ? full.replace(tokens(), () => value) : "";
        }
        if (raw!.startsWith("@")) return output.get(raw!.slice(1).trim()) ?? "";
        return renderVariables(full);
      },
    );
    return this.template.parts.map(part => replace(part.text)).join("");
  }
}
