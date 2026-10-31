// Evaluate as UTF-8 base64 on manager-layout.html. Uses synthetic IPC only.
(async () => {
  const passed = [];
  const expect = (condition, label) => {
    if (!condition) throw new Error(label);
    passed.push(label);
  };
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); };
  const toggle = () => document.querySelector('[data-manager-preview-toggle]');
  const preview = () => document.querySelector('[data-manager-preview]');
  const editor = document.querySelector('[data-template-editor] textarea');
  const set = async (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const buttons = (...labels) => [...document.querySelectorAll('button')].find(button => labels.includes(button.textContent.trim()));
  if (preview()) { toggle().click(); await settle(); }
  const source = '# 论文方法与实验设计\n\n请以 {{角色=科研论文精读助手}} 的身份，分析 {{主题}}。\n\n## 分析要求\n\n- **解释方法**：梳理研究问题与实验目的。\n- 输出语言：{{语言=[中文|English]}}\n- 关注维度：{{维度+=[准确性|创新性|局限性]~、}}\n\n> 先解释作者做了什么，再判断结论是否充分。\n\n| 内容 | 输出方式 |\n| --- | --- |\n| 方法 | {{形式=[列表|表格]}} |\n\n{{@附加要求}}\n\n同一组再次引用：{{@附加要求}}\n\n`{{代码变量=保持原样}}`\n\n```text\n{{语言=[中文|English]}}\n```\n\n[参考链接](https://example.com)\n\n![不加载的图片](https://example.com/image.png)\n\n:::options 附加要求\n:::option [x] 给出修改说明\n- 用 {{说明语言=中文}} 解释**主要修改**。\n:::option [ ] 检查格式\n- 检查标题与列表格式。\n:::end';
  await set(editor, source);
  editor.focus();
  editor.setSelectionRange(3, 8);
  const saves = window.managerFixture.callsFor('save_prompt').length;
  const baselinePreferences = window.managerFixture.prefs();
  toggle().click();
  await settle();
  expect(preview()?.querySelector('h1')?.textContent === '论文方法与实验设计', 'Preview renders the current unsaved draft');
  expect(getComputedStyle(editor.closest('[data-template-editor]')).display === 'none' && !preview().querySelector('textarea, input, [contenteditable]'), 'Only the body becomes read-only');
  expect(getComputedStyle(preview()).userSelect === 'text', 'Preview text can be selected');
  expect(document.querySelector('main input[data-manager-field]')?.disabled === false && !buttons('保存', 'Save').disabled, 'Metadata and save remain available');
  expect(window.managerFixture.callsFor('save_prompt').length === saves, 'Switching does not save the draft');
  expect(preview().querySelectorAll('tbody td').length === 2, 'Variable option pipes do not split table columns');
  expect(preview().querySelectorAll('[data-preview-group]').length === 1 && preview().querySelectorAll('[data-preview-option]').length === 2, 'Repeated references share one complete definition, including disabled options');
  expect(preview().querySelectorAll('[data-preview-kind="reference"]').length === 2, 'Each reference keeps its own marker');
  expect(preview().querySelector('[data-default-enabled="false"]') && !preview().querySelector('input[type="checkbox"]'), 'Default states are labels, not editable choices');
  expect(preview().querySelector('pre code').textContent.includes('{{语言=[中文|English]}}') && [...preview().querySelectorAll('code')].some(code => code.textContent.includes('{{代码变量=保持原样}}')), 'Code keeps literal variable syntax');
  expect(!preview().querySelector('img, script'), 'Images are not loaded and HTML is not executed');
  const link = preview().querySelector('a');
  expect(!link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 'Preview links cannot navigate');
  const marker = preview().querySelector('[data-preview-kind="variable"]');
  marker.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await settle();
  const tooltip = document.querySelector('[data-manager-preview-tooltip]');
  expect(tooltip?.textContent.includes('{{角色=科研论文精读助手}}'), 'Hover shows the complete original variable configuration');
  const rect = tooltip.getBoundingClientRect();
  expect(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'Tooltip stays inside the viewport');
  const markerRect = marker.getBoundingClientRect();
  expect(Math.max(rect.top - markerRect.bottom, markerRect.top - rect.bottom) <= 8, 'Tooltip stays adjacent to its marker');
  marker.focus();
  marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  expect(!document.querySelector('[data-manager-preview-tooltip]'), 'Keyboard focus exposes hints and Escape dismisses them');
  toggle().click();
  await settle();
  expect(document.querySelector('[data-template-editor] textarea') === editor && editor.value === source, 'Returning preserves the native editor and exact source');
  expect(editor.selectionStart === 3 && editor.selectionEnd === 8 && document.activeElement === editor, 'Returning restores the caret selection and focus');
  toggle().click();
  await settle();
  await set(document.querySelector('main input[data-manager-field]'), 'Markdown 预览验收');
  buttons('保存', 'Save').click();
  await settle();
  expect(window.managerFixture.records().some(prompt => prompt.title === 'Markdown 预览验收' && prompt.body === source), 'Saving in preview persists the original template, not rendered text');
  const row = [...document.querySelectorAll('[data-prompt-id]')].find(row => row.dataset.promptId === 'solo-1');
  if (row) { row.click(); await settle(); }
  else { buttons('+ 新建', '+ New').click(); await settle(); }
  expect(!!preview(), 'Switching or creating a Prompt keeps preview mode');
  expect(window.managerFixture.prefs()['manager.markdownPreviewOpen'] === 'true', 'Manager mode persists using its own preference');
  expect(window.managerFixture.prefs()['launcher.markdownPreviewOpen'] === baselinePreferences['launcher.markdownPreviewOpen'], 'Launcher preview preference is untouched');
  toggle().click();
  await settle();
  await set(editor, '# Draft\n{{@missing}} {{unfinished\n:::options broken\n:::option [x] One\nKeep this');
  toggle().click();
  await settle();
  expect(preview().textContent.includes('Keep this') && preview().textContent.includes(':::options broken'), 'Malformed definitions remain visible');
  expect(preview().querySelector('[data-preview-kind="missing"]') && document.querySelector('[data-template-diagnostics]'), 'Missing definitions keep their marker and existing diagnostics');
  toggle().click();
  await settle();
  await set(editor, source);
  await set(document.querySelector('main input[data-manager-field]'), 'Markdown 预览验收');
  buttons('保存', 'Save').click();
  await settle();
  toggle().click();
  await settle();
  preview().scrollTop = 0;
  return { count: passed.length, passed };
})()
