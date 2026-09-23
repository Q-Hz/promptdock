import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

// A preview must not fetch remote images from text that may contain private prompts.
markdown.renderer.rules.image = (tokens, index) =>
  markdown.utils.escapeHtml(tokens[index].content);

// The launcher uses Enter to copy; links in the read-only preview must not take focus.
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("tabindex", "-1");
  return renderer.renderToken(tokens, index, options);
};

export function renderPreviewMarkdown(source: string): string {
  return markdown.render(source);
}
