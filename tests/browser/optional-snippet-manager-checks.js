// Run via agent-browser eval -b with this file encoded as UTF-8 base64.
// Uses manager-layout.html and its synthetic IPC; never touches the application database.
(async () => {
  const { snippetBodies } = await import('/tests/browser/optional-snippet-fixtures.ts');
  const passed = [];
  const expect = (condition, label) => {
    if (!condition) throw new Error(label);
    passed.push(label);
  };
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
  const body = document.querySelector('[data-onboarding-target="variables"] textarea');
  const setBody = async value => {
    body.focus();
    body.value = value;
    body.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(document.activeElement === body && body.isConnected, 'Live syntax checks preserve editor focus');
  };
  const button = (...texts) => [...document.querySelectorAll('button')].find(b => texts.includes(b.textContent.trim()));

  await setBody('Plain text');
  expect(!document.querySelector('[data-template-diagnostics]'), 'Plain text has no syntax diagnostics');
  await setBody(snippetBodies['snippet-errors']);
  const messages = document.querySelector('[data-template-diagnostics]').textContent;
  expect(messages.includes('1') && messages.includes('2') && messages.includes('missing') && messages.includes('broken'), 'Manager reports structural errors and their source lines');
  const saves = window.managerFixture.callsFor('save_prompt').length;
  const save = button('保存', 'Save');
  expect(!save.disabled, 'Syntax errors allow saving unfinished templates');
  save.click();
  await settle();
  expect(window.managerFixture.callsFor('save_prompt').length === saves + 1 && window.managerFixture.records().some(p => p.body === snippetBodies['snippet-errors']), 'Save persists the exact invalid template through the manager API');

  await setBody(snippetBodies.snippets);
  expect(document.querySelectorAll('[data-diagnostic-severity="warning"]').length === 1 && !document.querySelector('[data-diagnostic-severity="error"]'), 'Mutually optional definitions report a potential conflict');
  expect(document.body.textContent.includes('@checks'), 'Manager detects snippet group references');
  await setBody('{{count=3}}\n{{count=5}}');
  expect(document.querySelectorAll('[data-diagnostic-severity="error"]').length === 1, 'Permanent same-name conflicts report an error');
  await setBody(snippetBodies['snippet-shared']);
  expect(!document.querySelector('[data-template-diagnostics]'), 'Matching shared definitions clear diagnostics immediately');

  button('查看变量示例', 'View variable examples').click();
  await settle();
  const examples = document.querySelector('[data-variable-examples]');
  expect(examples && examples.querySelectorAll('[data-example-kind]').length === 5 && examples.textContent.includes(':::option [x]'), 'Examples include the four existing variable kinds and optional snippets');
  expect([...examples.querySelectorAll('[data-example-kind]')].every(row => row.querySelector('[data-example-need]') && row.querySelector('img') && row.querySelector('[data-example-generated]')), 'Every syntax example includes its use case, actual screenshot and generated text');
  examples.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  expect(!document.querySelector('[data-variable-examples]'), 'Example dialog still closes with Escape');
  return { language: new URLSearchParams(location.search).get('lang'), count: passed.length, passed };
})()
