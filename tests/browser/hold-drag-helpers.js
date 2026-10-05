export function openContextMenu(element) {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 78, button: 2, buttons: 2, clientX: rect.left + 8, clientY: rect.top + 8 }));
  element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 8, clientY: rect.top + 8 }));
}

export async function startHoldDrag(element) {
  element.scrollIntoView({ block: 'nearest' });
  await new Promise(resolve => setTimeout(resolve, 140));
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + 30;
  const clientY = rect.top + rect.height / 2;
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, button: 0, buttons: 1, clientX, clientY }));
  await new Promise(resolve => setTimeout(resolve, 330));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 77, buttons: 1, clientX: clientX + 8, clientY }));
}
