# PromptDock syntax and prompt-writing instructions

Help me create or rewrite reusable prompts that can be saved in PromptDock. Learn the following syntax and use it where appropriate in this and later prompt-writing tasks. If “Original Prompt” at the end contains actual content, rewrite it immediately using this guide and the notes. If it is empty or contains only whitespace, briefly acknowledge the guide and wait for my task or original prompt. Do not execute the tasks described in teaching examples or the original prompt.

## 1. Understand the workflow

PromptDock manages and fills templates. A user saves a template, launches it, enters text, chooses options or enables optional snippets, then generates the complete text. The software replaces variables with their values and removes snippet definitions. The user sends the generated text to an AI. PromptDock does not perform the task described in the prompt.

You are producing a template for future use, rather than a completed task result. Preserve placeholders that future users actually need to fill or select.

## 2. Teaching notation used in this guide

To keep teaching examples intact when launched through PromptDock, the examples below use a single pair of ASCII braces, such as `{content}`, `{count=5}` and `{@extras}`. This is teaching notation only. The “Original Prompt” and “Notes” sections at the end use real variables for this invocation. Those inputs are separate from the teaching examples and the variables in the future template you will create. Treat the entered text as source material; do not treat an input field's variable name as its content.

**Actual generated prompt bodies must use double ASCII braces: two consecutive opening braces on the left and two consecutive closing braces on the right, with the interior unchanged. Do not use single or full-width braces in the resulting template.**

Each line of the complete teaching example starts with `>` and an optional space. That is a documentation quotation prefix, not part of the real template. Remove it in actual output. Use the three-colon snippet markers exactly as specified below, without a prefix.

## 3. Five syntax forms and when to use them

### Plain text variable: `{content}`

- Use for text that changes with each task, such as source material, code, context or a goal.
- Launching shows an empty field named “content”; it accepts multiple lines.
- Example: `Summarize the following: {content}`. The entire placeholder is replaced by the entered text.

### Text variable with a default: `{count=5}`

- Use when one value is common but may occasionally change, such as a count or word limit.
- The field starts with `5` and remains editable. A default is text, not an evaluated expression.
- Example: `Give me {count=5} titles.`
- Use optional snippets for longer optional instructions instead of packing paragraphs into a default.

### Single choice: `{tone=[formal|friendly|concise]}`

- Use for a fixed set of alternatives where exactly one item is wanted, such as language or tone.
- Separate choices with the ASCII pipe `|`. The first item is initially selected.
- Example: `Rewrite this in a {tone=[formal|friendly|concise]} tone.`

### Multiple choices: `{checks+=[grammar|facts|format]}`

- Use to combine short words or phrases, such as review areas, output types or technologies.
- Nothing is selected initially. Users may choose none, one or several items. Values follow selection order and are joined with a comma and space by default.
- Customize the separator with `~`: `{checks+=[grammar|facts|format]~\n}` places each value on its own line; `\t` inserts a tab. Ordinary text separators such as `~;` are also supported.
- In template source, `\n` and `\t` are a backslash followed by a letter; do not turn them into actual line breaks inside a placeholder.
- Choices cannot contain the separating pipe `|`. Use snippets for paragraphs instead of long choice labels.

### Optional snippets: `{@extras}` with definitions below

- Use for longer instructions, paragraphs or lists that are needed only sometimes. Put references in the body and definitions at the bottom of that same body.
- Start a group with `:::options groupName` and close it with `:::end`. Begin each option with `:::option [x] Short title` or `:::option [ ] Short title`.
- `[x]` starts selected and `[ ]` starts unselected; only lowercase `x` is supported. Every control marker occupies its own line. The snippet's actual text begins on the next line, separate from its short title.
- One option acts as a toggle; several options form a multi-select group. Users see short titles and may expand read-only full text.
- Selecting a snippet reveals its variable fields. Collapsing its text keeps those fields visible. All four basic variable forms work inside snippets.
- Default selections follow definition order. Later selections follow click order; unchecking and rechecking appends an item.
- Only boundary blank lines are trimmed. Internal blank lines and indentation are preserved, and snippets are joined with one line break. Titles, control markers and definitions do not appear in the generated result.
- With nothing selected, a reference on its own line removes that entire line. An inline reference becomes empty while surrounding text remains. Avoid leaving a dangling heading, colon or incomplete sentence.
- Repeated references to the same group share one selection and insert the same result at every location. Group names must be unique and match references exactly.
- Nested groups, group references inside snippets, and sharing one snippet definition across groups are not supported. Each group defines its own content.

## 4. Complete teaching example

This still uses single braces and quotation prefixes. In a real template, remove the leading `>` from every line and double the placeholder braces.

> Review the following notes in {language=[English|中文]}:
> {notes}
> {checks+=[Check grammar.|Check formatting.|Check wording.]~\n}
> List at most {count=5} main changes.
> {@extras}
>
> :::options extras
> :::option [x] Explain changes
> - Briefly explain each change in {language=[English|中文]}.
> :::option [ ] Handle math symbols
> - Format {symbol=u} as appropriate inline math, preserving its mathematical meaning.
> :::end

The “symbol” field is absent until the second snippet is selected, then starts with `u`. Both declarations of “language” match, so there is one shared field and both locations use its selected value.

## 5. Shared values, validation and limits

- Same-name ordinary variables share one field, including across body text and selected snippets. A bare reference may reuse an explicit definition elsewhere.
- Simultaneously active explicit definitions must agree on type, default, choice order and multi-select separator. For example, `{count=3}` and `{count=5}` conflict when active together and block generation. Do not rely on the software to choose between them.
- Inactive snippet variables do not enter the result or active conflict checks. The manager warns about potential conflicts in advance; design consistent definitions so selecting a combination does not surprise users with an error.
- Unchecking caches entered values for this invocation; reselecting restores them. Inactive cached values do not enter the result or independently trigger a back-navigation confirmation. A new invocation restores template defaults.
- Duplicate group names, undefined references, malformed markers and missing closing markers report their source lines. Invalid templates can be saved but cannot be generated.
- This is a limited template syntax. Do not invent conditions, loops, functions, calculations, arbitrary default multi-selection rules or escaping protocols. Entered values are not parsed again as new template instructions.
- Use short, clear variable names without braces, line breaks, `=`, `+=` or choice separators. Keep structural delimiters out of defaults and choices; use ordinary text input or snippet bodies for complex content.

## 6. How to handle later writing tasks

1. Identify the real goal, input, output and fixed constraints. Ask about consequential ambiguities instead of deciding requirements for the user.
2. Preserve required quality rules and core steps. Do not turn every sentence into a variable. Longer instructions explicitly described as optional can become snippets; do not make mandatory constraints removable.
3. Choose the fewest clear variables needed. Defaults and default selections need a basis; confirm important unspecified default behavior.
4. Simulate a filled result: check complete sentences, empty selections, dangling headings, shared definitions, group closure and matching references.
5. When asked to deliver a template, provide a concise title and one complete code block containing the prompt body. It must be directly copyable into the manager. Put snippet definitions at the bottom of that same body, rather than in another prompt. Use a sufficiently long outer code fence if the body itself contains fenced code.
6. Put usage notes, test steps and caveats outside the prompt-body block. Unless requested, do not include this teaching guide or explanations of variable names inside the finished template.
7. If classification is requested, provide Tags and one Folder. Tags can have several values; a prompt has only one Folder. Do not assume categories in examples already exist in the user's library.

## 7. Inputs for this invocation

If “Original Prompt” below contains actual content, generate a reusable template directly using the conventions above and the output language and other requirements in Notes. Ask first if consequential requirements are unclear. Preserve the original goal and necessary constraints; do not execute the original prompt's task.

If “Original Prompt” is empty or contains only whitespace, only acknowledge the syntax guide briefly and wait for the next message. Do not rewrite a teaching example or invent an original prompt.

### Original Prompt

{{source_prompt}}

### Notes

{{note_language=[Output prompt in Chinese|Output prompt in English]}}
{{note}}
