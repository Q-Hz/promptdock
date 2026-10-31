// agent-browser eval -b on launcher-preview.html?variables=acceptance.
(async () => {
  const passed = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const click = async element => { if (!element) throw new Error('Missing target'); element.click(); await settle(); };
  const button = (...labels) => [...document.querySelectorAll('button')].find(b => labels.includes(b.textContent.trim()));
  const field = name => document.querySelector(`[data-variable-field="${name}"] textarea`);
  const fill = async (name, value) => {
    const input = field(name); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  };
  await click(document.querySelector('[data-launcher-list] button'));
  const toggle = () => document.querySelector('[data-preview-toggle]');
  if (toggle().getAttribute('aria-pressed') !== 'true') await click(toggle());
  const preview = () => document.querySelector('[data-variable-preview] [data-markdown-preview]');
  if (new URLSearchParams(location.search).get('variables') === 'snippet-errors') {
    expect(!preview() && !!document.querySelector('[data-template-diagnostics]'), 'Invalid templates show diagnostics instead of misleading preview output');
    expect(button('生成提示词', 'Generate Prompt').disabled, 'Preview cannot bypass template validation');
    const { t } = await import('/src/lib/i18n.ts');
    expect(document.querySelector('[data-variable-preview]').textContent.includes(t('templateFixBeforeGenerate')), 'Preview explains why the template cannot be generated');
    return { count: passed.length, passed };
  }
  expect(!!preview() && document.documentElement.dataset.previewWidth === 'true', 'Variable entry can open a live preview and expand the native window');
  const groups = [...document.querySelectorAll('[data-snippet-group]')];
  expect(groups.length === 2 && groups[0].textContent.includes('2/3'), 'Separate snippet groups show their selected counts');
  await fill('task', '实时预览测试');
  await fill('note', '<img src=x onerror=alert(1)>正文');
  expect(preview().textContent.includes('实时预览测试') && preview().textContent.includes('<img src=x'), 'Text changes appear at their output positions immediately');
  expect(!preview().querySelector('img, script'), 'User input remains safe preview text');
  const inline = groups[0].querySelector('[data-snippet-option="1"]');
  await click(inline.querySelector('[data-snippet-toggle]'));
  expect(inline.querySelector('[data-snippet-fields]')?.contains(field('symbol')), 'Dependent inputs sit within the selected snippet');
  await fill('symbol', 'z_TEST');
  expect((preview().textContent.match(/z_TEST/g) || []).length === 2, 'Shared references update both preview positions');
  await click(inline.querySelector('[data-snippet-expand]'));
  await click(inline.querySelector('[data-snippet-expand]'));
  expect(!inline.querySelector('pre') && !!field('symbol'), 'Collapsing original text leaves its inputs visible');
  await click(inline.querySelector('[data-snippet-toggle]'));
  expect(!field('symbol') && !preview().textContent.includes('z_TEST'), 'Deselected snippets and cached values disappear from live output');
  await click(inline.querySelector('[data-snippet-toggle]'));
  expect(field('symbol').value === 'z_TEST' && preview().textContent.includes('z_TEST'), 'Reselecting restores the cached value in both form and preview');
  expect(!preview().textContent.includes(':::options') && !preview().textContent.includes('{{@'), 'Preview omits snippet definitions and syntax markers');
  const formBounds = document.querySelector('[data-launcher-variables]').getBoundingClientRect();
  expect(formBounds.height >= 80, 'Even the shortest supported window keeps a full input usable');
  const previewBounds = document.querySelector('[data-variable-preview]').getBoundingClientRect();
  expect(window.innerWidth < 860 ? previewBounds.top >= formBounds.bottom : previewBounds.left >= formBounds.right, 'Preview stacks below the form on narrow windows and beside it on wide windows');
  expect(document.documentElement.scrollWidth <= window.innerWidth, 'Workspace causes no horizontal window overflow');
  const actions = document.querySelector('[data-launcher-variable-actions]').getBoundingClientRect();
  expect(actions.bottom <= document.querySelector('[data-launcher-hint]').getBoundingClientRect().top + 1, 'Generate and Back remain visible below the workspace');
  await click(toggle());
  expect(!document.querySelector('[data-variable-preview]') && field('symbol').value === 'z_TEST', 'Closing preview preserves the current form');
  await click(toggle());
  const liveHtml = preview().innerHTML;
  await click(button('生成提示词', 'Generate Prompt'));
  expect(document.querySelector('[data-markdown-preview]').innerHTML === liveHtml, 'Live preview and final generated preview match exactly');
  expect(document.querySelector('#result-input').value.includes('z_TEST'), 'Generation uses the current filled values');
  return { width: window.innerWidth, count: passed.length, passed };
})()
