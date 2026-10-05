// The wait only arms dragging: a move after the delay is still required.
export const HOLD_DRAG_DELAY_MS = 300;

export function holdDragReady(startedAt: number, now: number, x: number, y: number, originX: number, originY: number): boolean {
  return now - startedAt >= HOLD_DRAG_DELAY_MS
    && Math.hypot(x - originX, y - originY) >= 5;
}
