// 导入比较相关的纯函数。标题规则与 Rust 端 import_logic::normalize_title 保持一致（PRD 4.2）。

export function titleKey(title: string): string {
  return title.replace(/^\s+|\s+$/gu, "");
}

// 在 peers 集合内保证唯一的缩略 ID：前 8 位起，冲突时逐位延长（PRD 6.4）
export function shortId(id: string, peers: string[] = []): string {
  const others = peers.filter((p) => p !== id);
  let len = 8;
  while (len < id.length) {
    const prefix = id.slice(0, len);
    if (!others.some((p) => p.startsWith(prefix))) return prefix;
    len += 2;
  }
  return id;
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface LineDiff {
  type: "equal" | "add" | "remove" | "modify";
  left?: DiffSegment[];
  right?: DiffSegment[];
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

// 通用 LCS：返回 a/b 的对齐结果（null 表示该侧无对应行）
function lcsAlign<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<[T | null, T | null]> {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[T | null, T | null]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([a[i], b[j]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pairs.push([a[i], null]);
      i++;
    } else {
      pairs.push([null, b[j]]);
      j++;
    }
  }
  while (i < n) pairs.push([a[i++], null]);
  while (j < m) pairs.push([null, b[j++]]);
  return pairs;
}

// 字符级差异段：把一对文本切成未变化段与变化段
function charSegments(left: string, right: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const l = Array.from(left);
  const r = Array.from(right);
  const pairs = lcsAlign(l, r, (x, y) => x === y);

  const leftSegs: DiffSegment[] = [];
  const rightSegs: DiffSegment[] = [];
  const push = (segs: DiffSegment[], text: string, changed: boolean) => {
    const last = segs[segs.length - 1];
    if (last && last.changed === changed) last.text += text;
    else segs.push({ text, changed });
  };

  // 把 LCS 对齐折叠成连续区间：equal 对连续块，其他归入变化块
  let bufL: string[] = [];
  let bufR: string[] = [];
  const flushChanged = () => {
    if (bufL.length === 0 && bufR.length === 0) return;
    push(leftSegs, bufL.join(""), true);
    push(rightSegs, bufR.join(""), true);
    bufL = [];
    bufR = [];
  };
  let equalRun: string[] = [];
  const flushEqual = () => {
    if (equalRun.length === 0) return;
    const text = equalRun.join("");
    push(leftSegs, text, false);
    push(rightSegs, text, false);
    equalRun = [];
  };
  for (const [x, y] of pairs) {
    if (x !== null && y !== null) {
      flushChanged();
      equalRun.push(x);
    } else {
      flushEqual();
      if (x !== null) bufL.push(x);
      if (y !== null) bufR.push(y);
    }
  }
  flushEqual();
  flushChanged();
  return { left: leftSegs, right: rightSegs };
}

// 行级差异 + 变化行内按字符高亮（PRD 7.3）。比较使用原始正文，不做任何规范化。
export function diffLines(a: string, b: string): LineDiff[] {
  const leftLines = splitLines(a);
  const rightLines = splitLines(b);

  // 裁剪公共前后缀，缩小 LCS 规模
  let start = 0;
  while (
    start < leftLines.length &&
    start < rightLines.length &&
    leftLines[start] === rightLines[start]
  ) {
    start++;
  }
  let endL = leftLines.length;
  let endR = rightLines.length;
  while (endL > start && endR > start && leftLines[endL - 1] === rightLines[endR - 1]) {
    endL--;
    endR--;
  }

  const result: LineDiff[] = [];
  for (let i = 0; i < start; i++) {
    result.push({ type: "equal", left: [{ text: leftLines[i], changed: false }], right: [{ text: rightLines[i], changed: false }] });
  }

  const coreL = leftLines.slice(start, endL);
  const coreR = rightLines.slice(start, endR);
  const aligned = lcsAlign(coreL, coreR, (x, y) => x === y);

  // 连续的 remove+add 配对为 modify
  let pendingRemoves: string[] = [];
  const flushRemoves = () => {
    for (const line of pendingRemoves) {
      result.push({ type: "remove", left: [{ text: line, changed: true }] });
    }
    pendingRemoves = [];
  };
  let pendingAdds: string[] = [];
  for (const [x, y] of aligned) {
    if (x !== null && y !== null) {
      flushRemoves();
      pendingAdds = [];
      result.push({ type: "equal", left: [{ text: x, changed: false }], right: [{ text: y, changed: false }] });
    } else if (x !== null) {
      if (pendingAdds.length > 0) {
        // remove 跟在 add 之后：与最早的 add 配对为 modify
        const add = pendingAdds.shift()!;
        const segs = charSegments(x, add);
        result.push({ type: "modify", left: segs.left, right: segs.right });
      } else {
        pendingRemoves.push(x);
      }
    } else if (y !== null) {
      if (pendingRemoves.length > 0) {
        const rem = pendingRemoves.shift()!;
        const segs = charSegments(rem, y);
        result.push({ type: "modify", left: segs.left, right: segs.right });
      } else {
        pendingAdds.push(y);
      }
    }
  }
  flushRemoves();
  for (const line of pendingAdds) {
    result.push({ type: "add", right: [{ text: line, changed: true }] });
  }

  for (let i = endL; i < leftLines.length; i++) {
    result.push({ type: "equal", left: [{ text: leftLines[i], changed: false }], right: [{ text: rightLines[i], changed: false }] });
  }
  return result;
}
