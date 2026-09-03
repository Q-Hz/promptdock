// Bounds scale down together only when a window cannot fit both requested minimums.
export function splitBounds(
  available: number,
  minFirst: number,
  minSecond: number,
  maxFirstRatio = 1
): [number, number] {
  const space = Math.max(0, available);
  const total = minFirst + minSecond;
  const scale = total > space && total > 0 ? space / total : 1;
  const min = minFirst * scale;
  const max = Math.max(min, Math.min(space - minSecond * scale, space * maxFirstRatio));
  return [min, max];
}

export function clampSplit(
  first: number,
  available: number,
  minFirst: number,
  minSecond: number,
  maxFirstRatio = 1
): number {
  const [min, max] = splitBounds(available, minFirst, minSecond, maxFirstRatio);
  return Math.min(max, Math.max(min, first));
}

export function clampTo(value: number, min: number, max: number): number {
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, min), upper);
}

// 左侧条目的行高与最少可见行数，用于条目视口的高度下限（PRD 4.2.B.3）
export const ITEM_ROW_HEIGHT = 32;
export const MIN_VISIBLE_ROWS = 3;

export interface ViewportBounds {
  min: number;
  max: number;
  initial: number;
}

// 默认最大 40% 可用高度，上限 60%，下限约 3 行；空间更小时按实际可用高度收敛
export function folderViewportBounds(navHeight: number): ViewportBounds {
  const available = Math.max(0, navHeight);
  const max = available * 0.6;
  const min = clampTo(MIN_VISIBLE_ROWS * ITEM_ROW_HEIGHT, 0, max);
  return { min, max, initial: clampTo(available * 0.4, min, max) };
}
