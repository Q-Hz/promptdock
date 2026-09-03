// Regression probes promoted from the independent acceptance review.
// Open manager-layout.html?fresh=1 before each probe unless its precondition says otherwise.
// These call real Vue DOM handlers; native WebView2 drag interception is a separate gate.
const tick = () => new Promise(resolve => setTimeout(resolve, 50));
const section = key => [...document.querySelectorAll('section[data-section-key]')].find(e => e.dataset.sectionKey === key);
const row = (id, key = 'Note organization') => section(key).querySelector(`[data-prompt-id="${id}"]`);
const clickText = (root, label) => [...root.querySelectorAll('button')].find(e => e.textContent.trim() === label).click();
const setValue = async (element, value) => { element.focus(); element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); await tick(); };

export async function selfDrop() {
  const before = window.managerFixture.organization().promptOrderByFolder['Note organization'];
  const source = row('note-02');
  const transfer = new DataTransfer();
  const box = source.getBoundingClientRect();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  source.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: box.top + 2 }));
  await tick();
  source.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: box.top + 2 }));
  await tick();
  const after = window.managerFixture.organization().promptOrderByFolder['Note organization'];
  return { case: 'self-drop-must-not-reorder', pass: JSON.stringify(before) === JSON.stringify(after), beforeIndex: before.indexOf('note-02'), afterIndex: after.indexOf('note-02'), calls: window.managerFixture.callsFor('set_prompt_order') };
}

export async function variableFocus() {
  const original = document.querySelector('main textarea');
  await setValue(original, 'Plain text');
  const plain = document.querySelector('main textarea');
  const removal = { sameNode: original === plain, focusRetained: document.activeElement === plain };
  await setValue(plain, 'Plain text {{topic}}');
  const withVar = document.querySelector('main textarea');
  const addition = { sameNode: plain === withVar, focusRetained: document.activeElement === withVar };
  return { case: 'variable-boundary-preserves-typing-focus', pass: removal.focusRetained && addition.focusRetained, removal, addition };
}

export async function delayedPinThenSave() {
  const core = window.__TAURI__.core;
  const original = core.invoke;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  core.invoke = async (command, args) => {
    const result = await original(command, args);
    if (command === 'set_pinned') await pending;
    return result;
  };
  document.querySelector('main button[aria-label="置顶"]').click();
  await tick();
  await setValue(document.querySelector('main textarea'), 'User draft {{topic}}');
  clickText(document.querySelector('main'), '保存');
  await tick();
  release();
  await tick();
  core.invoke = original;
  const saved = window.managerFixture.records().find(p => p.id === 'note-01');
  const pin = [...document.querySelectorAll('main button')].find(e => /置顶/.test(e.textContent));
  return { case: 'pending-pin-cannot-be-overwritten-by-save', pass: saved.pinned === true && pin.getAttribute('aria-pressed') === 'true', database: { pinned: saved.pinned, body: saved.body }, visiblePinned: pin.getAttribute('aria-pressed'), calls: window.managerFixture.state.calls.filter(c => ['save_prompt', 'set_pinned'].includes(c.command)) };
}

export async function pickerScroll() {
  row('note-01').querySelector('button[aria-label="Prompt 操作"]').click();
  await tick();
  clickText(document.querySelector('[role="menu"]'), '移动到文件夹');
  await tick();
  const picker = document.querySelector('[data-folder-picker]');
  const list = picker.querySelector('.overflow-y-auto');
  const before = { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, rect: picker.getBoundingClientRect().toJSON(), windowHeight: innerHeight };
  if (list.scrollHeight <= list.clientHeight) throw new Error('Precondition: seed more folders so picker requires scrolling');
  list.scrollTop = 35;
  await tick();
  return { case: 'folder-picker-stays-open-on-own-scroll', pass: !!document.querySelector('[data-folder-picker]'), before, remainsOpen: !!document.querySelector('[data-folder-picker]') };
}

export async function bottomMenu() {
  const target = row('write-5', 'Writing');
  const nav = document.querySelector('aside > div:last-child');
  target.scrollIntoView({ block: 'end' });
  await tick();
  target.querySelector('button[aria-label="Prompt 操作"]').click();
  await tick();
  const popup = document.querySelector('[role="menu"]');
  const box = popup.getBoundingClientRect();
  return { case: 'menu-bottom-within-viewport', pass: box.bottom <= innerHeight, top: box.top, bottom: box.bottom, windowHeight: innerHeight, navBottom: nav.getBoundingClientRect().bottom, items: [...popup.querySelectorAll('button')].map(e => ({ label: e.textContent.trim(), bottom: e.getBoundingClientRect().bottom })) };
}

export async function immediateClosePrefs() {
  const before = window.managerFixture.callsFor('set_ui_prefs').length;
  const handle = document.querySelector('.split-handle.columns');
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  window.managerFixture.emit('manager-close-requested');
  await tick();
  const calls = window.managerFixture.state.calls.filter(c => ['set_ui_prefs','resolve_close'].includes(c.command));
  const atClose = window.managerFixture.callsFor('set_ui_prefs').length - before;
  await new Promise(resolve => setTimeout(resolve, 350));
  return { case: 'close-awaits-layout-flush', pass: atClose > 0, savedAtClose: atClose, callsAtClose: calls, writesLater: window.managerFixture.callsFor('set_ui_prefs').length - before };
}

export async function closeWaitsForWriteAndRetriesFailure() {
  const core = window.__TAURI__.core;
  const original = core.invoke;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let fail = true;
  let writes = 0;
  core.invoke = async (command, args) => {
    if (command === 'set_ui_prefs') {
      writes++;
      await pending;
      if (fail) throw new Error('injected preference failure');
    }
    return original(command, args);
  };
  try {
    const handle = document.querySelector('.split-handle.columns');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    window.managerFixture.emit('manager-close-requested');
    await tick();
    const waited = writes === 1 && window.managerFixture.callsFor('resolve_close').length === 0;
    release();
    await tick();
    const refused = window.managerFixture.callsFor('resolve_close').at(-1)?.args.allow === false;
    fail = false;
    window.managerFixture.emit('manager-close-requested');
    await tick();
    const accepted = window.managerFixture.callsFor('resolve_close').at(-1)?.args.allow === true;
    const persisted = !!window.managerFixture.prefs()['manager-layout'];
    return { case: 'close-awaits-completion-and-refuses-failed-write', pass: waited && refused && accepted && persisted, waited, refused, accepted, persisted, writes };
  } finally {
    release();
    core.invoke = original;
  }
}

export async function staleOrderPreservesDraft() {
  await setValue(document.querySelector('main textarea'), 'Unsaved draft');
  const fixture = window.managerFixture;
  const expected = fixture.organization();
  const newOrder = [...expected.promptOrderByFolder['Note organization']].reverse();
  await window.__TAURI__.core.invoke('set_prompt_order', { folder: 'Note organization', order: newOrder, expected });
  // The Vue list is deliberately stale, like a second window's list.
  row('note-01').querySelector('button[aria-label="Prompt 操作"]').click();
  await tick();
  clickText(document.querySelector('[role="menu"]'), '下移');
  await tick();
  const actual = fixture.organization().promptOrderByFolder['Note organization'];
  const preserved = document.querySelector('main textarea').value === 'Unsaved draft';
  const warned = fixture.state.alerts.some(a => a.includes('已发生变化'));
  return { case: 'stale-order-rejected-with-draft-preserved', pass: JSON.stringify(actual) === JSON.stringify(newOrder) && preserved && warned, preserved, warned };
}

export async function duplicateSaveIsCoalesced() {
  const core = window.__TAURI__.core;
  const original = core.invoke;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  core.invoke = async (command, args) => {
    if (command === 'save_prompt') await pending;
    return original(command, args);
  };
  try {
    await setValue(document.querySelector('main textarea'), 'One save only');
    clickText(document.querySelector('main'), '保存');
    clickText(document.querySelector('main'), '保存');
    release();
    await tick();
    const count = window.managerFixture.callsFor('save_prompt').length;
    return { case: 'duplicate-save-is-coalesced', pass: count === 1, count };
  } finally { release(); core.invoke = original; }
}

export async function dragAutoScrollAndCancel() {
  const source = row('note-01');
  const nav = document.querySelector('[data-manager-navigation]');
  const before = JSON.stringify(window.managerFixture.organization());
  const transfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  const rect = nav.getBoundingClientRect();
  nav.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 10, clientY: rect.bottom - 5 }));
  await new Promise(resolve => setTimeout(resolve, 220));
  const scrolled = nav.scrollTop > 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const stoppedAt = nav.scrollTop;
  await tick();
  const stopped = nav.scrollTop === stoppedAt;
  const unchanged = before === JSON.stringify(window.managerFixture.organization());
  return { case: 'drag-scrolls-at-edge-and-escape-cancels', pass: scrolled && stopped && unchanged, scrolled, stopped, unchanged, scrollTop: stoppedAt };
}

export async function immediateEnterDrop() {
  const source = row('note-01');
  const target = section('Writing').querySelector('header');
  const rect = target.getBoundingClientRect();
  const transfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 20, clientY: rect.top + 10 }));
  // Release immediately, before a subsequent dragover arrives.
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 20, clientY: rect.top + 10 }));
  await tick();
  const folder = window.managerFixture.records().find(p => p.id === 'note-01').folder;
  const order = window.managerFixture.organization().promptOrderByFolder.Writing;
  return { case: 'immediate-drop-appends-to-real-folder-end', pass: folder === 'Writing' && order.at(-1) === 'note-01' && order.length === 7, folder, order };
}

export async function pinnedReveal() {
  // Precondition: note-20 has been pinned through fixture API, followed by page reload.
  const shortcut = [...document.querySelectorAll('[data-prompt-id="note-20"]')].find(e => e.closest('section').dataset.sectionVariant === 'pinned');
  if (!shortcut) throw new Error('Precondition: pin note-20 and reload before running');
  shortcut.querySelector('button').click();
  await tick();
  const original = row('note-20');
  return { case: 'selecting-pinned-item-reveals-original-folder-entry', pass: !!original, selectedTitle: document.querySelector('main input').value, originalEntryVisible: !!original, originalVisibleRows: section('Note organization').querySelectorAll('[data-prompt-id]').length };
}
