// Real Vue components with synthetic IPC. No personal library is accessed.
const tick = () => new Promise(resolve => setTimeout(resolve, 50));
function expect(value, message) { if (!value) throw new Error(message); }
function setValue(element, value) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
async function key(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await tick();
}
function clickButton(root, name) {
  const button = [...root.querySelectorAll('button')].find(item => item.textContent.trim() === name);
  expect(button, `Missing button: ${name}`);
  button.click();
}

export async function runSearchStateChecks() {
  const search = () => document.querySelector('#launcher-input');
  setValue(search(), 'Search item');
  await tick();
  const ids = () => [...document.querySelectorAll('[data-launcher-item]')].map(item => item.textContent.trim());
  const before = ids();
  for (let i = 0; i < 18; i++) await key(search(), 'ArrowDown');
  const list = document.querySelector('[data-launcher-list]');
  list.scrollTop = 400;
  const scroll = list.scrollTop;
  const active = document.querySelector('[data-active="true"]').textContent.trim();
  await key(search(), 'Enter');
  expect(!search(), 'Enter opens the prompt');
  clickButton(document, '返回');
  await tick();
  expect(search()?.value === 'Search item', 'Back must retain search text');
  expect(JSON.stringify(ids()) === JSON.stringify(before), 'Back must retain result order');
  expect(document.querySelector('[data-active="true"]').textContent.trim() === active, 'Back must retain selection');
  expect(document.querySelector('[data-launcher-list]').scrollTop === scroll, 'Back must retain scroll');
  expect(document.activeElement === search(), 'Back focuses search');
  await key(search(), 'Enter');
  clickButton(document, '生成提示词');
  await tick();
  await key(document.activeElement, 'Escape');
  await key(document.activeElement, 'Escape');
  expect(search()?.value === 'Search item', 'Result -> variables -> search retains text');
  await key(search(), 'Enter');
  const field = document.querySelector('textarea.variable-input');
  setValue(field, 'draft');
  await key(field, 'Escape');
  expect(document.querySelector('[role="alertdialog"]'), 'Modified variables still require confirmation');
  clickButton(document.querySelector('[role="alertdialog"]'), '取消');
  await tick();
  expect(document.querySelector('textarea.variable-input').value === 'draft', 'Cancel retains variables');
  await key(document.activeElement, 'Escape');
  clickButton(document.querySelector('[role="alertdialog"]'), '放弃修改并返回');
  await tick();
  expect(search()?.value === 'Search item', 'Confirmed discard retains search');
  await key(search(), 'Escape');
  expect(Number(document.documentElement.dataset.hideCalls) === 1, 'Escape in search hides invocation');
  await window.__launcherFixture.emit('main-shown');
  await tick();
  expect(search().value === '', 'New invocation clears search');
  expect(document.querySelector('[data-launcher-list]').scrollTop === 0, 'New invocation resets scroll');
  expect(document.querySelector('[data-launcher-item]').dataset.active === 'true', 'New invocation selects first item');
  return 'PASS: search text, results, selection, scroll, focus, result chain, discard/cancel and new invocation';
}

export async function runFolderCreateChecks() {
  const fixture = window.managerFixture;
  const count = () => fixture.records().length;
  const editor = () => document.querySelector('main');
  const title = () => editor().querySelector('input[placeholder="Prompt 标题"]');
  const folder = () => editor().querySelector('input[list="folder-list"]');
  const search = () => document.querySelector('input[placeholder="搜索标题、标签或文件夹…"]');
  const section = name => [...document.querySelectorAll('section[data-section-key]')].find(item => item.dataset.sectionKey === name);
  const menu = () => document.querySelector('[role="menu"]');
  async function open(name) {
    const header = section(name).querySelector('header');
    header.scrollIntoView({ block: 'nearest' });
    await tick();
    const rect = header.getBoundingClientRect();
    header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
    await tick();
    expect(menu(), `Menu opens: ${name}`);
  }
  async function create(name) {
    await open(name);
    clickButton(menu(), '新建提示词');
    await tick();
  }
  const initial = count();
  await create('Empty folder');
  expect(folder().value === 'Empty folder' && title().value === '', 'Empty folder opens prefilled blank draft');
  expect(count() === initial, 'Opening draft creates no record');
  expect(!editor().querySelector('[role="status"]'), 'Prefilled folder is the clean draft baseline');
  await create('Writing');
  expect(folder().value === 'Writing', 'Repeated new action replaces clean draft without duplicate');
  setValue(title(), 'Unsaved original');
  await create('Empty folder');
  expect(document.querySelector('[role="alertdialog"]'), 'Dirty editor is guarded');
  clickButton(document.querySelector('[role="alertdialog"]'), '取消');
  await tick();
  expect(title().value === 'Unsaved original' && folder().value === 'Writing', 'Cancel keeps original draft');
  await create('Empty folder');
  clickButton(document.querySelector('[role="alertdialog"]'), '放弃修改');
  await tick();
  expect(title().value === '' && folder().value === 'Empty folder' && count() === initial, 'Discard opens target draft without writing');
  setValue(editor().querySelector('textarea'), 'Body without title');
  await create('Writing');
  clickButton(document.querySelector('[role="alertdialog"]'), '保存并继续');
  await tick();
  expect(folder().value === 'Empty folder' && !document.querySelector('[role="alertdialog"]') && count() === initial,
    'Validation failure keeps original draft and creates nothing');
  setValue(title(), 'Saved original');
  const invoke = window.__TAURI__.core.invoke;
  try {
    window.__TAURI__.core.invoke = async (command, args) => {
      if (command === 'save_prompt') throw new Error('Synthetic save failure');
      return invoke(command, args);
    };
    await create('Writing');
    clickButton(document.querySelector('[role="alertdialog"]'), '保存并继续');
    await tick();
    expect(folder().value === 'Empty folder' && title().value === 'Saved original' && count() === initial,
      'IPC save failure preserves the original draft and creates nothing');
    expect(fixture.state.alerts.length === 1, 'Save failure is reported');
  } finally {
    window.__TAURI__.core.invoke = invoke;
  }
  await create('Writing');
  clickButton(document.querySelector('[role="alertdialog"]'), '保存并继续');
  await tick();
  expect(count() === initial + 1 && title().value === '' && folder().value === 'Writing', 'Save and continue saves original then opens target');
  section('Empty folder').querySelector('[data-folder-title]').click();
  await tick();
  setValue(search(), 'Writing');
  await tick();
  // Search matches the folder but the eventual new prompt is moved to a different folder.
  setValue(title(), 'New record outside filter');
  setValue(folder(), 'Empty folder');
  clickButton(editor(), '保存');
  clickButton(editor(), '保存');
  await tick();
  expect(count() === initial + 2, 'Repeated save creates one record');
  expect(search().value === '', 'Successful new save clears manager search');
  const saved = fixture.records().find(item => item.title === 'New record outside filter');
  expect(saved?.folder === 'Empty folder', 'Saved record keeps chosen folder');
  expect(section('Empty folder').querySelector(`[data-prompt-id="${saved.id}"]`), 'Saved row is revealed in folder');
  for (const target of [section(''), document.querySelector('section[data-section-variant="pinned"]')]) {
    await open(target.dataset.sectionKey);
    expect(![...menu().querySelectorAll('button')].some(item => item.textContent.trim() === '新建提示词'), 'System section has no new action');
    await key(menu(), 'Escape');
  }
  expect(fixture.state.alerts.length === 1, 'No unexpected operation errors');
  return 'PASS: normal/empty folders, clean baseline, dirty cancel/discard/save/failure, deferred write, repeated save, search clear/reveal, system exclusions';
}

export async function runEnglishFolderCreateChecks() {
  document.documentElement.classList.add('dark');
  const header = [...document.querySelectorAll('section[data-section-key]')]
    .find(item => item.dataset.sectionKey === 'Empty folder').querySelector('header');
  header.scrollIntoView({ block: 'nearest' });
  await tick();
  const rect = header.getBoundingClientRect();
  header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
  await tick();
  const menu = document.querySelector('[role="menu"]');
  expect(menu.textContent.includes('New Prompt'), 'English menu labels new action');
  expect(!menu.textContent.includes('新建提示词'), 'English menu has no Chinese new action');
  return 'PASS: English dark folder creation menu';
}
