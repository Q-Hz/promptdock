// Synthetic requirements only; no user prompts or database access.
export const snippetBodies = {
  snippets: [
    "# Snippet result", "{{language=中文}}", "{{@checks}}", "Again:", "{{@checks}}", "End.",
    ":::options checks", ":::option [x] Formula titles", "- Fix formula titles.",
    ":::option [ ] Inline symbols", "- Fix {{symbol=u}} using {{tone=[formal|friendly]}}; {{tags+=[a|b]}}.",
    ":::option [ ] Count three", "- Count {{count=3}}.",
    ":::option [ ] Count five", "- Count {{count=5}}.", ":::end",
    ":::options toggle", ":::option [ ] Optional note", "- This group is not referenced.", ":::end",
  ].join("\n"),
  "snippet-errors": "{{@missing}}\n:::options broken\n:::option [x] Incomplete\nText",
  "snippet-toggle": "Before\n{{@toggle}}\nAfter\n:::options toggle\n:::option [ ] Optional note\n- Note {{note=initial}}.\n:::end",
  "snippet-shared": "{{language}}\n{{@checks}}\n:::options checks\n:::option [x] First language\n{{language=中文}}\n:::option [x] Second language\n{{language=中文}}\n:::end",
};
