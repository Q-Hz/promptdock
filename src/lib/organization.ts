// 手动组织结果的视图投影与重排计算（PRD 4.1/4.3/4.5/4.6）。
// 顺序数据只描述排列：归属看 prompt.folder，置顶看 prompt.pinned，两者都不由顺序反推。

import type { Organization, Prompt } from "./api";

// 首次显示 5 条，每次“显示更多”再增加 5 条
export const BATCH_SIZE = 5;

// 置顶区在折叠/高度偏好中的键，不会与任何真实文件夹名冲突
export const PINNED_SECTION_KEY = "\u0000pinned";

export interface FolderGroup {
  // 真实文件夹名；未分类为空字符串，显示名称由界面按语言决定
  key: string;
  items: Prompt[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// 兜底顺序必须稳定：数据库与文件都不保证未排序结果可复现
function byCreatedThenId(a: Prompt, b: Prompt): number {
  return a.createdAt - b.createdAt || compareText(a.id, b.id);
}

export function emptyOrganization(): Organization {
  return { folderOrder: [], promptOrderByFolder: {}, pinnedOrder: [] };
}

// 已保存的顺序优先，漏列的成员按稳定兜底追加到末尾，陈旧 ID 被丢弃
export function orderMembers(members: Prompt[], saved: string[] | undefined): Prompt[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const ordered: Prompt[] = [];
  const seen = new Set<string>();
  for (const id of saved ?? []) {
    const member = byId.get(id);
    if (member && !seen.has(id)) {
      seen.add(id);
      ordered.push(member);
    }
  }
  const rest = members.filter((member) => !seen.has(member.id)).sort(byCreatedThenId);
  return [...ordered, ...rest];
}

// 管理器左侧的文件夹分组：只包含有成员的文件夹，空文件夹沿用偏好但不显示
export function arrangeFolders(prompts: Prompt[], organization: Organization): FolderGroup[] {
  const byFolder = new Map<string, Prompt[]>();
  for (const prompt of prompts) {
    const members = byFolder.get(prompt.folder);
    if (members) members.push(prompt);
    else byFolder.set(prompt.folder, [prompt]);
  }

  const groups: FolderGroup[] = [];
  const used = new Set<string>();
  const push = (folder: string) => {
    const members = byFolder.get(folder);
    if (!members) return;
    groups.push({
      key: folder,
      items: orderMembers(members, organization.promptOrderByFolder[folder]),
    });
  };

  for (const folder of organization.folderOrder) {
    if (used.has(folder)) continue;
    const members = byFolder.get(folder);
    if (!members || members.length === 0) continue;
    used.add(folder);
    push(folder);
  }

  // 首次出现且没有本地顺序偏好的文件夹追加到末尾
  const earliest = (folder: string) =>
    Math.min(...(byFolder.get(folder) ?? []).map((prompt) => prompt.createdAt));
  const unlisted = [...byFolder.keys()].filter((folder) => !used.has(folder));
  unlisted.sort((a, b) => earliest(a) - earliest(b) || compareText(a, b));
  for (const folder of unlisted) push(folder);

  return groups;
}

// 置顶区是快捷入口，不复制数据：引用同一 ID，顺序独立于原文件夹
export function arrangePinned(prompts: Prompt[], organization: Organization): Prompt[] {
  return orderMembers(
    prompts.filter((prompt) => prompt.pinned),
    organization.pinnedOrder
  );
}

// 调用窗口排序：置顶按置顶区顺序在前，非置顶按最近使用；收藏不参与优先级
export function sortLauncher(prompts: Prompt[], pinnedOrder: string[]): Prompt[] {
  const rank = new Map(pinnedOrder.map((id, index) => [id, index]));
  const byRecency = (a: Prompt, b: Prompt) =>
    (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || compareText(a.id, b.id);
  const pinned = prompts
    .filter((prompt) => prompt.pinned)
    .sort((a, b) => {
      const first = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const second = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return first - second || byRecency(a, b);
    });
  const rest = prompts.filter((prompt) => !prompt.pinned).sort(byRecency);
  return [...pinned, ...rest];
}

export function moveWithin<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// 拖动落点：targetKey 为 null 表示放到末尾。未列出的条目保持原相对顺序。
export function reorder(
  keys: string[],
  dragKey: string,
  targetKey: string | null,
  position: "before" | "after"
): string[] {
  if (!keys.includes(dragKey) || targetKey === dragKey) return [...keys];
  const rest = keys.filter((key) => key !== dragKey);
  if (targetKey === null) return [...rest, dragKey];
  const index = rest.indexOf(targetKey);
  if (index === -1) return [...keys];
  const at = position === "after" ? index + 1 : index;
  return [...rest.slice(0, at), dragKey, ...rest.slice(at)];
}

// 跨文件夹移动需要的目标下标：按完整成员顺序计算，而不是当前可见行号
export function reorderIndex(
  keys: string[],
  dragKey: string,
  targetKey: string | null,
  position: "before" | "after"
): number {
  const rest = keys.filter((key) => key !== dragKey);
  if (targetKey === null) return rest.length;
  if (targetKey === dragKey) return keys.indexOf(dragKey);
  const index = rest.indexOf(targetKey);
  return index < 0 ? -1 : index + (position === "after" ? 1 : 0);
}

// 菜单里的上移 / 下移，按完整成员顺序执行
export function shift(keys: string[], key: string, offset: number): string[] {
  const from = keys.indexOf(key);
  if (from === -1) return [...keys];
  return moveWithin(keys, from, from + offset);
}

export interface BatchView {
  visible: number;
  remaining: number;
  canCollapse: boolean;
}

// 分批显示：不足 5 条时全部显示且不出现“显示更多”
export function batchView(total: number, shown: number): BatchView {
  const visible = Math.min(total, Math.max(0, shown));
  return { visible, remaining: total - visible, canCollapse: shown > BATCH_SIZE };
}

export function nextBatch(shown: number): number {
  return shown + BATCH_SIZE;
}
