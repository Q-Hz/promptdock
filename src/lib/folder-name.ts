export type FolderNameError = "empty" | "too_long" | "control_character" | "duplicate";

export interface FolderNameValidation {
  name: string;
  error: FolderNameError | null;
}

const EDGE_WHITESPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;
const CONTROL_CHARACTER = /\p{Cc}/u;

export function trimFolderName(value: string): string {
  return value.replace(EDGE_WHITESPACE, "");
}

export function folderCodePointLength(value: string): number {
  return [...value].length;
}

export function validateFolderName(
  value: string,
  existing: readonly string[],
  currentName: string | null = null
): FolderNameValidation {
  if (CONTROL_CHARACTER.test(value)) return { name: value, error: "control_character" };
  const name = trimFolderName(value);
  if (!name) return { name, error: "empty" };
  if (folderCodePointLength(name) > 50) return { name, error: "too_long" };
  if (name !== currentName && existing.includes(name)) return { name, error: "duplicate" };
  return { name, error: null };
}

// Prompt 编辑器允许空值（系统未分类）和选择已有历史名称；只有自动建夹时
// 才必须满足当前的新名称限制。
export function validatePromptFolder(
  value: string,
  existing: readonly string[],
  previousName: string | null
): FolderNameValidation {
  if (value === previousName) return { name: value, error: null };
  if (CONTROL_CHARACTER.test(value)) return { name: value, error: "control_character" };
  const name = trimFolderName(value);
  if (!name || existing.includes(name)) return { name, error: null };
  return validateFolderName(name, existing);
}
