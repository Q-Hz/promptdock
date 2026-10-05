import { dragPayload } from '/src/lib/drag-state.ts';
import { openContextMenu, startHoldDrag } from './hold-drag-helpers.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const section = key => [...document.querySelectorAll('section[data-section-key]')].find(element => element.dataset.sectionKey === key);
const row = id => section('Note organization').querySelector(`[data-prompt-id="${id}"]`);
const point = element => {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left + 30, clientY: rect.top + rect.height / 2 };
};
const pointer = (target, type, position, buttons = 1) => target.dispatchEvent(new PointerEvent(type, {
  bubbles: true, cancelable: true, pointerId: 77, button: 0, buttons, ...position,
}));
const escape = () => (document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

export async function runHoldDragChecks() {
  let assertions = 0;
  const check = (condition, message) => { if (!condition) throw new Error(message); assertions++; };
  const snapshot = () => JSON.stringify(window.managerFixture.organization());
  check(!document.querySelector('[data-folder-drag-handle], [data-prompt-drag-handle]'), 'handles remain');
  check(![...document.querySelectorAll('button')].some(button => button.textContent.trim() === '⋮'), 'menu buttons remain');

  const source = row('note-02');
  source.scrollIntoView({ block: 'nearest' });
  await wait(140);
  const origin = point(source);
  pointer(source, 'pointerdown', origin);
  pointer(document, 'pointermove', { ...origin, clientX: origin.clientX + 12 });
  check(!dragPayload.value, 'drag starts before 300ms');
  await wait(330);
  check(!dragPayload.value, 'holding without a new movement starts drag');
  pointer(document, 'pointerup', origin, 0);
  check(!dragPayload.value, 'long press without dragging leaves drag state');

  const before = snapshot();
  const editorTitle = document.querySelector('main input[placeholder="Prompt 标题"]').value;
  pointer(source, 'pointerdown', origin);
  escape();
  await wait(330);
  pointer(document, 'pointermove', { ...origin, clientX: origin.clientX + 12 });
  check(!dragPayload.value && snapshot() === before, 'Escape does not cancel pending hold');

  openContextMenu(source);
  await wait(40);
  check(document.querySelector('[role="menu"]')?.getAttribute('aria-label') === 'Prompt 操作', 'prompt menu missing');
  check(document.querySelector('main input[placeholder="Prompt 标题"]').value === editorTitle, 'right click changes editor');
  escape();
  await wait(40);
  openContextMenu(section('').querySelector('header'));
  await wait(40);
  check([...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map(element => element.textContent.trim()).join('|') === '上移|下移|更改图标', 'uncategorized menu is wrong');
  escape();
  await wait(40);

  await startHoldDrag(source);
  check(dragPayload.value?.id === 'note-02', 'row hold does not start drag');
  pointer(document, 'pointermove', point(row('note-01')));
  pointer(document, 'pointerup', point(row('note-01')), 0);
  await wait(120);
  const order = window.managerFixture.organization().promptOrderByFolder['Note organization'];
  check(order.indexOf('note-02') < order.indexOf('note-01'), 'pointer drop does not reorder');
  check(window.managerFixture.callsFor('set_prompt_order').length === 1, 'drop commits more than once');
  source.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await wait(40);
  check(document.querySelector('main input[placeholder="Prompt 标题"]').value === editorTitle, 'drag click changes editor');

  await startHoldDrag(row('note-03'));
  pointer(document, 'pointermove', { clientX: window.innerWidth - 10, clientY: 20 });
  pointer(document, 'pointerup', { clientX: window.innerWidth - 10, clientY: 20 }, 0);
  await wait(40);
  check(window.managerFixture.callsFor('set_prompt_order').length === 1 && !dragPayload.value, 'invalid drop commits or leaves state');

  const folder = section('Writing').querySelector('header');
  const expanded = folder.querySelector('[data-folder-title]').getAttribute('aria-expanded');
  await startHoldDrag(folder);
  check(dragPayload.value?.kind === 'folder', 'folder hold does not start drag');
  escape();
  folder.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  check(folder.querySelector('[data-folder-title]').getAttribute('aria-expanded') === expanded, 'cancelled drag toggles folder');
  check(!dragPayload.value, 'Escape leaves active drag');

  await startHoldDrag(row('note-04'));
  pointer(document, 'pointermove', point(folder));
  pointer(document, 'pointerup', point(folder), 0);
  await wait(120);
  check(window.managerFixture.records().find(prompt => prompt.id === 'note-04').folder === 'Writing', 'cross-folder pointer move fails');
  check(window.managerFixture.callsFor('move_prompt').length === 1, 'cross-folder move duplicated');

  folder.querySelector('[data-folder-title]').click();
  await wait(40);
  await startHoldDrag(row('note-05'));
  pointer(document, 'pointermove', point(folder));
  await wait(650);
  const firstWriting = section('Writing').querySelector('[data-prompt-id]');
  check(!!firstWriting, 'hover does not temporarily expand collapsed folder');
  pointer(document, 'pointermove', point(firstWriting));
  await wait(40);
  check(!!section('Writing').querySelector('[data-prompt-id]'), 'moving from header to temporarily expanded row collapses folder');
  pointer(document, 'pointerup', point(firstWriting), 0);
  await wait(120);
  check(window.managerFixture.records().find(prompt => prompt.id === 'note-05').folder === 'Writing', 'drop into temporarily expanded row fails');

  await startHoldDrag(folder);
  pointer(document, 'pointermove', point(section('Note organization').querySelector('header')));
  pointer(document, 'pointerup', point(section('Note organization').querySelector('header')), 0);
  await wait(120);
  check(window.managerFixture.callsFor('set_folder_order').length === 1, 'folder pointer reorder missing or duplicated');

  const unclassified = section('').querySelector('header');
  await startHoldDrag(unclassified);
  check(dragPayload.value?.kind === 'folder' && dragPayload.value.id === '', 'uncategorized cannot be dragged');
  escape();

  const pinned = document.querySelector('section[data-section-variant="pinned"]');
  await startHoldDrag(pinned.querySelector('header'));
  check(!dragPayload.value, 'pinned header can be dragged');
  pointer(document, 'pointerup', point(pinned.querySelector('header')), 0);
  openContextMenu(pinned.querySelector('header'));
  await wait(40);
  check([...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map(element => element.textContent.trim()).join('|') === '更改图标', 'pinned header menu should only customize its icon');
  escape();
  await wait(40);
  const pinSource = pinned.querySelector('[data-prompt-id="combo-both"]');
  await startHoldDrag(pinSource);
  check(dragPayload.value?.kind === 'prompt', 'pinned prompt cannot be dragged');
  pointer(document, 'pointermove', point(pinned.querySelector('[data-prompt-id="combo-pinned"]')));
  pointer(document, 'pointerup', point(pinned.querySelector('[data-prompt-id="combo-pinned"]')), 0);
  await wait(120);
  check(window.managerFixture.callsFor('set_pinned_order').length === 1, 'pinned reorder fails');

  const search = document.querySelector('aside input');
  search.value = 'Note';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(60);
  await startHoldDrag(row('note-02'));
  check(!dragPayload.value, 'search permits pointer dragging');
  pointer(document, 'pointerup', point(row('note-02')), 0);
  return { group: 'hold-drag', assertions };
}
