export function fitPopover(anchor: { top: number; bottom: number; right: number }, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 8;
  const maxHeight = Math.max(0, viewportHeight - 2 * margin);
  const actualHeight = Math.min(height, maxHeight);
  const below = anchor.bottom + 4;
  const preferred = below + actualHeight <= viewportHeight - margin ? below : anchor.top - actualHeight - 4;
  return {
    top: Math.max(margin, Math.min(preferred, viewportHeight - margin - actualHeight)),
    left: Math.max(margin, Math.min(anchor.right - width, viewportWidth - width - margin)),
    maxHeight,
  };
}
