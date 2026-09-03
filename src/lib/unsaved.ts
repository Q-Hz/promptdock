// 未保存内容检测（PRD 9.2/9.3）。
// 快照只包含表单将实际发送给保存 API 的可编辑字段；系统生成字段（updatedAt 等）不参与判断。

import type { Prompt } from "./api";

export interface EditorSnapshot {
  title: string;
  body: string;
  tags: string[];
  folder: string;
  favorite: boolean;
}

export function snapshotFromPrompt(p: Prompt): EditorSnapshot {
  return {
    title: p.title,
    body: p.body,
    tags: [...p.tags],
    folder: p.folder,
    favorite: p.favorite,
  };
}

// title/body/folder 按原始字符串比较；tags 按有序数组逐项比较（顺序与重复项参与）；
// favorite 按布尔值比较。修改后恢复为基线相同的值即回到已保存状态。
export function isDirty(current: EditorSnapshot, baseline: EditorSnapshot): boolean {
  return (
    current.title !== baseline.title ||
    current.body !== baseline.body ||
    current.folder !== baseline.folder ||
    current.favorite !== baseline.favorite ||
    current.tags.length !== baseline.tags.length ||
    current.tags.some((tag, i) => tag !== baseline.tags[i])
  );
}
