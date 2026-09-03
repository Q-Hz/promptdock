// Bounds scale down together only when a window cannot fit both requested minimums.
export function splitBounds(available: number, minFirst: number, minSecond: number): [number, number] {
  const space = Math.max(0, available);
  const total = minFirst + minSecond;
  const scale = total > space && total > 0 ? space / total : 1;
  return [minFirst * scale, space - minSecond * scale];
}

export function clampSplit(first: number, available: number, minFirst: number, minSecond: number): number {
  const [min, max] = splitBounds(available, minFirst, minSecond);
  return Math.min(max, Math.max(min, first));
}
