export interface TemplateHighlight {
  text: string;
  kind: "text" | "variable" | "reference" | "definition";
}

export interface TemplateBlockRange { start: number; end: number }

// Definition blocks are painted as a whole, including their content and blank
// lines. An unfinished block stays tinted to EOF while the user is editing it.
export function templateBlockRanges(source: string): TemplateBlockRange[] {
  const ranges: TemplateBlockRange[] = [];
  const markers = /^[\t ]*:::(options|end)(?=[\t \r\n]|$)[^\r\n]*/gm;
  let start: number | undefined;
  for (const marker of source.matchAll(markers)) {
    if (marker[1] === "options") start ??= marker.index!;
    else if (start !== undefined) {
      ranges.push({ start, end: marker.index! + marker[0].length });
      start = undefined;
    }
  }
  if (start !== undefined) ranges.push({ start, end: source.length });
  return ranges;
}

// Presentation only: keep every source character and leave validation to the parser.
export function highlightTemplate(source: string): TemplateHighlight[] {
  const parts: TemplateHighlight[] = [];
  const tokens = /^[\t ]*:::(?:options|option|end)(?=[\t \r\n]|$)[^\r\n]*|\{\{\s*[^{}]+?\s*\}\}/gm;
  let offset = 0;
  for (const match of source.matchAll(tokens)) {
    const start = match.index!;
    if (start > offset) parts.push({ text: source.slice(offset, start), kind: "text" });
    parts.push({
      text: match[0],
      kind: match[0].trimStart().startsWith(":::") ? "definition"
        : /^\{\{\s*@/.test(match[0]) ? "reference" : "variable",
    });
    offset = start + match[0].length;
  }
  if (offset < source.length) parts.push({ text: source.slice(offset), kind: "text" });
  return parts;
}
