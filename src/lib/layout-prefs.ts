// 管理器界面偏好：尺寸与折叠状态跨重启保存；“本次已展示多少条”只在会话内保留（PRD 4.3/9）。
// 这些数值只是本地界面状态，不写入 Prompt 的 JSON 导出。

export const LAYOUT_PREFS_KEY = "manager-layout";

export interface ManagerLayout {
  // 左栏占可用宽度的比例；null 表示使用默认比例
  sidebarRatio: number | null;
  // 右侧正文占编辑区高度的比例；null 表示使用默认比例
  editorRatio: number | null;
  // 兼容旧版偏好；已取消文件夹高度调节，此字段保留但不再用于布局。
  folderHeights: Record<string, number>;
  // 折叠状态，键为文件夹名或置顶区键
  collapsed: Record<string, boolean>;
}

export function defaultLayout(): ManagerLayout {
  return { sidebarRatio: null, editorRatio: null, folderHeights: {}, collapsed: {} };
}

function toRatio(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : null;
}

function toHeightMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) result[key] = raw;
  }
  return result;
}

function toBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "boolean") result[key] = raw;
  }
  return result;
}

// 偏好文件可能被旧版本或手工修改破坏：任何无效字段都回退到默认值，不让界面打不开
export function parseLayout(raw: string): ManagerLayout {
  if (!raw.trim()) return defaultLayout();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultLayout();
  }
  if (!parsed || typeof parsed !== "object") return defaultLayout();
  const source = parsed as Record<string, unknown>;
  return {
    sidebarRatio: toRatio(source.sidebarRatio),
    editorRatio: toRatio(source.editorRatio),
    folderHeights: toHeightMap(source.folderHeights),
    collapsed: toBooleanMap(source.collapsed),
  };
}

export function serializeLayout(layout: ManagerLayout): string {
  return JSON.stringify(layout);
}
