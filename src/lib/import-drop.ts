// 排序拖动使用独立状态；文件拖动只依据浏览器报告的 Files 类型识别。
export function isExternalFileDrag(types: readonly string[], internalDragActive: boolean): boolean {
  return !internalDragActive && types.includes("Files");
}

export type DropFileError = "count" | "extension";

export function dropFileError(names: readonly string[]): DropFileError | null {
  if (names.length !== 1) return "count";
  return /\.json$/i.test(names[0]) ? null : "extension";
}
