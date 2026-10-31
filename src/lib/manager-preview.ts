import { parseVariables } from "./api.ts";
import { t } from "./i18n.ts";
import { createPreviewMarkdown } from "./markdown-preview.ts";
import { parseSnippetTemplate, type SnippetGroup } from "./optional-snippets.ts";

export interface PreviewOption { title: string; checked: boolean; html: string }
export interface PreviewGroup { name: string; options: PreviewOption[] }
export interface ManagerPreview { html: string; groups: PreviewGroup[]; hints: string[] }

// Presentation only: no SnippetSession, substitution, or writes to the draft.
export function buildManagerPreview(source: string): ManagerPreview {
  const markdown = createPreviewMarkdown();
  const escape = markdown.utils.escapeHtml;
  let prefix = "PDVAR0Z";
  while (source.includes(prefix)) prefix += "Z";
  const originals: string[] = [];
  // Protect before block parsing: option pipes must not split Markdown table cells.
  const protectedSource = source.replace(/\{\{\s*[^{}]+?\s*\}\}/g, raw => {
    const marker = `${prefix}${originals.length}Z`;
    originals.push(raw);
    return marker;
  });
  const markerPattern = () => new RegExp(`${prefix}(\\d+)Z`, "g");
  const restore = (text: string) => text.replace(markerPattern(), (_, index) => originals[Number(index)]);

  // Use Markdown's own block boundaries so examples in fences/indented code stay code.
  const codeLines = new Set<number>();
  for (const token of markdown.parse(protectedSource, {})) {
    if ((token.type === "fence" || token.type === "code_block") && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) codeLines.add(line);
    }
    if (token.type === "inline" && token.map && token.children?.some(child => child.type === "code_inline")) {
      const runs = [...token.content.matchAll(/`+/g)];
      for (let index = 0; index < runs.length; index++) {
        const opening = runs[index];
        const escapes = /\\*$/.exec(token.content.slice(0, opening.index))![0].length;
        if (escapes % 2) continue;
        const closing = runs.findIndex((run, next) => next > index && run[0].length === opening[0].length);
        if (closing < 0) continue;
        const first = token.content.slice(0, opening.index).split("\n").length - 1;
        const last = token.content.slice(0, runs[closing].index).split("\n").length - 1;
        // Only interior lines can contain standalone definition delimiters.
        for (let line = first + 1; line < last; line++) codeLines.add(token.map[0] + line);
        index = closing;
      }
    }
  }
  const lines = protectedSource.split(/\r\n|\n|\r/);
  const body: string[] = [];
  const groups: SnippetGroup[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!codeLines.has(i) && /^[\t ]*:::options(?:\s|$)/.test(lines[i])) {
      let end = i + 1;
      while (end < lines.length && !(!codeLines.has(end) && /^[\t ]*:::end\s*$/.test(lines[end]))) end++;
      if (end < lines.length) {
        const candidate = parseSnippetTemplate(restore(lines.slice(i, end + 1).join("\n")));
        // Malformed definitions stay visible in place rather than silently losing text.
        if (candidate.groups.length === 1 && candidate.diagnostics.length === 0) {
          groups.push(candidate.groups[0]);
          body.push("");
        } else body.push(lines.slice(i, end + 1).join("\n"));
        i = end;
        continue;
      }
      body.push(lines.slice(i).join("\n"));
      break;
    }
    body.push(lines[i]);
  }

  const hints: string[] = [];
  const markerHtml = (raw: string) => {
    const reference = /^\{\{\s*@([^{}]+?)\s*\}\}$/.exec(raw);
    let label: string;
    let hint: string;
    let kind = "variable";
    if (reference) {
      const name = reference[1].trim();
      if (!name) return escape(raw);
      const group = groups.find(group => group.name === name);
      kind = group ? "reference" : "missing";
      label = `${name} · ${t(group ? "managerPreviewSnippet" : "managerPreviewMissing")}`;
      hint = `${raw}\n${group ? t("managerPreviewGroupHint", {
        count: group.options.length,
        defaults: group.options.filter(option => option.checked).map(option => option.title).join(", ") || t("managerPreviewNone"),
      }) : t("managerPreviewMissing")}`;
    } else {
      if (/^\{\{\s*@/.test(raw)) return escape(raw);
      const variable = parseVariables(raw)[0];
      if (!variable || !variable.name.trim()) return escape(raw);
      const type = t(variable.type === "multi" ? "managerPreviewMulti" : variable.type === "select" ? "managerPreviewSelect" : "managerPreviewText");
      label = `${variable.name.trim()} · ${type}`;
      hint = `${raw}\n${t("managerPreviewType", { type })}`;
      if (variable.type !== "multi") hint += `\n${variable.default ? t("managerPreviewDefault", { value: variable.default }) : t("managerPreviewNoDefault")}`;
      if (variable.options.length) hint += `\n${t("managerPreviewOptions", { value: variable.options.join(" | ") })}`;
      if (variable.type === "multi") hint += `\n${t("managerPreviewSeparator", { value: JSON.stringify(variable.separator) })}`;
    }
    const id = hints.push(hint) - 1;
    return `<span class="manager-preview-token" data-preview-kind="${kind}" data-preview-token="${id}" tabindex="0" aria-label="${escape(hint)}">〔${escape(label)}〕</span>`;
  };

  markdown.renderer.rules.text = (tokens, index) => {
    const text = tokens[index].content;
    let html = "";
    let offset = 0;
    for (const match of text.matchAll(markerPattern())) {
      html += escape(text.slice(offset, match.index)) + markerHtml(originals[Number(match[1])]);
      offset = match.index! + match[0].length;
    }
    return html + escape(text.slice(offset));
  };
  // Restore code, fence language, image alt text, and link attributes as literal text.
  // Never replace strings in finished HTML, which could inject spans into attributes.
  markdown.core.ruler.after("inline", "restore_template_literals", state => {
    const visit = (tokens: typeof state.tokens) => {
      for (const token of tokens) {
        if (token.type !== "text") token.content = restore(token.content);
        token.info = restore(token.info);
        if (token.attrs) token.attrs = token.attrs.map(([name, value]) => [name, restore(String(value))]);
        if (token.children) visit(token.children);
      }
    };
    visit(state.tokens);
  });
  const render = (text: string) => markdown.render(text);
  const html = render(body.join("\n"));
  return {
    html,
    groups: groups.map(group => ({
      name: group.name,
      options: group.options.map(option => ({
        title: option.title, checked: option.checked,
        html: render(option.body.replace(/\{\{\s*[^{}]+?\s*\}\}/g, raw => {
          const marker = `${prefix}${originals.length}Z`;
          originals.push(raw);
          return marker;
        })),
      })),
    })),
    hints,
  };
}
