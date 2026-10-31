// Evaluate with agent-browser eval -b on launcher-preview.html?variables=acceptance|syntax-guide-zh|syntax-guide-en.
(async () => {
  const passed = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const click = async target => { target.click(); await settle(); };
  const kind = new URLSearchParams(location.search).get('variables');
  if (!document.querySelector('[data-launcher-variables]')) await click(document.querySelector('button'));
  const generate = () => click([...document.querySelectorAll('button')].find(b => ['生成提示词', 'Generate Prompt'].includes(b.textContent.trim())));
  if (kind.startsWith('syntax-guide')) {
    const locale = kind.endsWith('zh') ? 'zh' : 'en';
    const { default: bundled } = await import('/src-tauri/src/default-prompts.json');
    const source = bundled.prompts.find(prompt => prompt.title === (locale === 'zh' ? '提示词标准化' : 'Prompt Standardization')).body;
    expect(!document.querySelector('[data-template-diagnostics]'), 'Syntax lesson has no accidental template errors');
    expect(JSON.stringify([...document.querySelectorAll('[data-variable-field]')].map(field => field.dataset.variableField)) === JSON.stringify(['source_prompt', 'note_language', 'note']) && !document.querySelector('[data-snippet-group]'), 'Only the original prompt, output language and notes create controls');
    let original = '';
    let note = '';
    const languageOptions = [...document.querySelectorAll('[data-variable-field="note_language"] button')];
    if (new URLSearchParams(location.search).get('filled') === '1') {
      original = '请整理 {{文章}} 中的重要观点。';
      note = '保留原始目标，不执行原始任务。';
      for (const [name, value] of [['source_prompt', original], ['note', note]]) {
        const input = document.querySelector(`[data-variable-field="${name}"] textarea`);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await click(languageOptions[1]);
    }
    const selectedLanguage = languageOptions.find(option => option.getAttribute('aria-selected') === 'true').textContent.trim();
    expect(languageOptions.length === 2 && selectedLanguage === languageOptions[new URLSearchParams(location.search).get('filled') === '1' ? 1 : 0].textContent.trim(), 'The output language defaults to the first option and can be changed');
    await generate();
    const expected = source.replace('{{source_prompt}}', () => original)
      .replace(/\{\{note_language=\[[^\]]+\]\}\}/, () => selectedLanguage)
      .replace('{{note}}', () => note);
    expect(document.querySelector('#result-input').value === expected, 'The complete lesson is preserved and only invocation inputs are substituted');
  } else {
    const groups = [...document.querySelectorAll('[data-snippet-group]')];
    expect(groups.length === 2, 'Acceptance template displays two groups despite repeated references');
    expect(groups[0].querySelectorAll('input:checked').length === 2 && groups[1].querySelectorAll('[data-snippet-toggle]').length === 1, 'Configured defaults and the one-option toggle are visible');
    const symbolToggle = groups[0].querySelector('[data-snippet-option="1"] [data-snippet-toggle]');
    expect(!document.querySelector('[data-variable-field="symbol"]'), 'Unselected field starts hidden');
    await click(symbolToggle);
    const field = document.querySelector('[data-variable-field="symbol"] textarea');
    field.value = 'u_0';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await click(symbolToggle);
    await click(symbolToggle);
    expect(document.querySelector('[data-variable-field="symbol"] textarea').value === 'u_0', 'Acceptance template restores the entered symbol');
    await click(groups[1].querySelector('[data-snippet-toggle]'));
    expect(document.querySelectorAll('[data-variable-field="language"]').length === 1 && document.querySelector('[data-variable-field="details"]'), 'The toggle adds its field and reuses the language field');
    await generate();
    const result = document.querySelector('#result-input').value;
    expect((result.match(/u_0/g) ?? []).length === 2, 'The entered symbol appears at both group references');
    expect(!result.includes(':::') && !result.includes('{{'), 'The acceptance result contains no template control syntax');
  }
  return { kind, count: passed.length, passed };
})()
