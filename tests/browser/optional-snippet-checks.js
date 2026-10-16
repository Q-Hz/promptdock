// Run via agent-browser eval -b with this file encoded as UTF-8 base64.
// Open launcher-preview.html?variables=... before evaluating it.
// DOM interaction against real Vue components, using synthetic Tauri data only.
(async () => {
  const passed = [];
  const expect = (condition, label) => {
    if (!condition) throw new Error(label);
    passed.push(label);
  };
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
  const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  const click = async element => { if (!element) throw new Error('Missing interaction target'); element.click(); await settle(); };
  const fill = async (name, value) => {
    const input = document.querySelector(`[data-variable-field="${name}"] textarea`);
    if (!input) throw new Error(`Missing variable ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const field = name => document.querySelector(`[data-variable-field="${name}"]`);
  const option = id => document.querySelector(`[data-snippet-option="${id}"]`);
  const toggle = id => click(option(id).querySelector('[data-snippet-toggle]'));
  const generate = () => click(button('生成提示词') || button('Generate Prompt'));
  const back = () => click(button('返回') || button('Back'));
  const choose = async () => {
    await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('Markdown 预览验收')));
  };
  const kind = new URLSearchParams(location.search).get('variables');
  if (!document.querySelector('[data-launcher-variables]')) await choose();
  await settle();

  if (kind === 'snippets') {
    expect(document.querySelectorAll('[data-snippet-group]').length === 1, 'Repeated references share a single group; unused group is hidden');
    expect(document.querySelectorAll('[data-snippet-toggle]:checked').length === 1, 'Only configured default is selected');
    expect(!field('symbol'), 'Inactive snippet variables are hidden');
    await toggle('1');
    expect(field('symbol') && field('tone') && field('tags'), 'All selected snippet fields appear beneath their option');
    expect(option('1').contains(field('symbol')), 'Fields belong to their option');
    await fill('symbol', 'u_0');
    await click(option('1').querySelector('[data-snippet-expand]'));
    expect(option('1').querySelector('pre').textContent.includes('{{symbol=u}}'), 'Expand shows the original snippet text');
    await click(option('1').querySelector('[data-snippet-expand]'));
    expect(!option('1').querySelector('pre') && field('symbol'), 'Collapsing text keeps fields visible');
    await toggle('1');
    expect(!field('symbol'), 'Unchecking hides dependent fields');
    await back();
    expect(document.querySelector('#launcher-input') && !document.querySelector('[role="alertdialog"]'), 'Hidden cached edits do not trigger a back guard');
    await choose();
    await toggle('1');
    expect(field('symbol').querySelector('textarea').value === 'u', 'New invocation resets variable defaults');
    await fill('symbol', 'v');
    await toggle('1');
    await toggle('1');
    expect(field('symbol').querySelector('textarea').value === 'v', 'Reselecting restores cached input in this invocation');
    await toggle('0');
    await toggle('0');
    expect(document.querySelector('[data-snippet-group]').textContent.includes('Inline symbols → Formula titles'), 'Reselecting appends to insertion order');
    await toggle('2');
    await toggle('3');
    expect(document.querySelector('[data-template-diagnostics]') && (button('生成提示词') || button('Generate Prompt')).disabled, 'Active conflicting defaults block generation');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(!document.querySelector('#result-input'), 'Advance shortcut cannot bypass syntax errors');
    await toggle('3');
    expect(!document.querySelector('[data-template-diagnostics]'), 'Unselected conflicting declarations do not block generation');
    await toggle('2');
    const actions = document.querySelector('[data-launcher-variable-actions]').getBoundingClientRect();
    const hint = document.querySelector('[data-launcher-hint]').getBoundingClientRect();
    expect(actions.bottom <= hint.top + 1, 'Action buttons stay below the scrollable form');
    await generate();
    const text = document.querySelector('#result-input').value;
    expect((text.match(/- Fix v/g) || []).length === 2, 'Repeated references contain the same filled text');
    expect(text.indexOf('- Fix v') < text.indexOf('- Fix formula titles.'), 'Generated text uses click order');
    expect(!text.includes(':::') && !text.includes('{{') && !text.includes('Count'), 'Definitions and inactive content never enter the result');
    if (document.querySelector('[data-preview-toggle]').getAttribute('aria-pressed') !== 'true') await click(document.querySelector('[data-preview-toggle]'));
    expect(document.querySelector('[data-markdown-preview] h1')?.textContent === 'Snippet result', 'Markdown preview renders the generated result');
    await back();
    expect(field('symbol').querySelector('textarea').value === 'v', 'Returning from the result preserves fields and selections');
    await back();
    expect(document.querySelector('[role="alertdialog"]'), 'Active selection changes still trigger the back guard');
  } else if (kind === 'snippet-toggle') {
    expect(document.querySelectorAll('[data-snippet-toggle]').length === 1, 'A one-option group is a single toggle');
    await generate();
    expect(document.querySelector('#result-input').value === 'Before\nAfter\n', 'Empty standalone reference removes its complete line');
    await back();
    await toggle('0');
    expect(field('note').querySelector('textarea').value === 'initial', 'Selecting a toggle reveals its default field');
    await fill('note', 'edited');
    await toggle('0');
    await back();
    expect(document.querySelector('#launcher-input') && !document.querySelector('[role="alertdialog"]'), 'Returning to baseline ignores hidden field edits');
  } else if (kind === 'snippet-shared') {
    expect(document.querySelectorAll('[data-variable-field="language"]').length === 1, 'Body and snippets share one same-name field');
    await fill('language', 'English');
    await generate();
    expect(document.querySelector('#result-input').value === 'English\nEnglish\nEnglish\n', 'Same-name fields fill every occurrence consistently');
  } else if (kind === 'snippet-errors') {
    const errors = document.querySelector('[data-template-diagnostics]').textContent;
    expect(errors.includes('1') && errors.includes('2'), 'Structural errors retain original source line numbers');
    expect((button('生成提示词') || button('Generate Prompt')).disabled, 'Malformed templates cannot be generated');
  } else {
    const counts = { one: 1, two: 2, three: 3, mixed: 2, many: 12, options: 0 };
    const inputs = [...document.querySelectorAll('[data-launcher-fields] textarea')];
    expect(inputs.length === counts[kind], `Legacy ${kind}: field count`);
    expect(inputs.every(i => i.getBoundingClientRect().height >= 80), `Legacy ${kind}: minimum input height`);
    if (['one', 'two', 'three', 'mixed'].includes(kind)) {
      expect(inputs.every(i => Math.abs(i.getBoundingClientRect().height - inputs[0].getBoundingClientRect().height) < 1), `Legacy ${kind}: equal input heights`);
      const viewport = document.querySelector('[data-launcher-variables]');
      expect(Math.abs(document.querySelector('[data-launcher-fields]').getBoundingClientRect().height - viewport.clientHeight) < 2, `Legacy ${kind}: fills available height`);
    }
  }
  return { kind, count: passed.length, passed };
})()
