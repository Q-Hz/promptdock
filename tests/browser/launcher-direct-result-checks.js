// Run via agent-browser eval -b on launcher-preview.html with the fixture queries below.
(async () => {
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); };
  const find = selector => document.querySelector(selector);
  const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
  const key = async (key, repeat = false) => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
    await settle();
  };
  const fill = async (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const fixture = window.__launcherFixture;
  const search = () => find('#launcher-input');
  const result = () => find('#result-input');
  const item = () => find('[data-launcher-item][data-active="true"]');
  const list = () => find('[data-launcher-list]');
  const dialog = () => find('[role="alertdialog"]');
  const params = new URLSearchParams(location.search);
  const kind = params.get('variables');

  if (params.has('search-state')) {
    // ?search-state&variables=unused-snippet
    await fill(search(), 'Search item');
    for (let i = 0; i < 18; i++) await key('ArrowDown');
    list().scrollTop = 400;
    const scroll = list().scrollTop;
    const active = item().textContent.trim();
    const promptId = `search-${active.match(/Search item (\d+)/)[1]}`;
    const expectSearchRestored = () => {
      expect(search()?.value === 'Search item' && document.activeElement === search(), 'Back restores query and focus');
      expect(item().textContent.trim() === active && list().scrollTop === scroll, 'Back restores selection and scroll');
    };

    item().click();
    await settle();
    expect(result()?.value === '# Static result\n', 'Click opens rendered result and removes unused definitions');
    expect(document.activeElement === result() && !find('[data-launcher-variables]'), 'Result receives focus without a form');
    button('返回').click();
    await settle();
    expectSearchRestored();

    await key('Enter');
    await key('Enter', true);
    expect(result()?.value === '# Static result\n' && !fixture.clipboardWrites.length && !fixture.usedPrompts.length, 'Held Enter opens result without copying or recording use');
    await fill(result(), 'Edited result');
    await key('Escape');
    expect(dialog(), 'Edited result requires confirmation');
    button('取消').click();
    await settle();
    expect(result()?.value === 'Edited result', 'Cancel keeps the edited result');
    await key('Escape');
    button('放弃修改并返回').click();
    await settle();
    expectSearchRestored();

    await key('Enter');
    expect(result()?.value === '# Static result\n', 'Reopening generates a clean result');
    await fill(result(), 'Copy this edit');
    await key('Enter');
    expect(fixture.clipboardWrites.join() === 'Copy this edit' && fixture.usedPrompts.join() === promptId, 'Fresh Enter copies the edit and records exactly one use');
    expect(document.documentElement.dataset.hideCalls === '1', 'Only explicit copy hides the window');
    return 'PASS: direct result, keyboard repeat, return state, edit guard and explicit copy';
  }

  item().click();
  await settle();
  if (kind === 'one-default') {
    expect(find('textarea.variable-input')?.value === 'initial', 'A default-only variable remains editable');
  } else if (kind === 'snippet-switch') {
    const toggle = () => find('[data-snippet-toggle]');
    expect(toggle() && !find('[data-variable-field]'), 'A referenced snippet switch stays available without text variables');
    toggle().click();
    await settle();
    button('生成提示词').click();
    await settle();
    expect(result()?.value === 'Before\nExtra text\n', 'Selecting the snippet changes the result');
    await key('Escape');
    expect(toggle()?.checked, 'Back returns to the form and retains the snippet selection');
  } else if (kind === 'snippet-errors') {
    expect(find('[data-template-diagnostics]') && button('生成提示词').disabled, 'Invalid template still displays blocking diagnostics');
    await key('Enter');
    expect(!result() && !fixture.clipboardWrites.length, 'Advance cannot bypass validation');
  } else {
    expect(result()?.value.startsWith('# 验收结论') && !fixture.clipboardWrites.length, 'Plain Markdown opens result without copying');
  }
  return `PASS: ${kind ?? 'plain Markdown'}`;
})()
