import icons from "./folder-icons.json" with { type: "json" };

export const FOLDER_ICONS = icons;
// The neutral swatch follows the theme so it remains visible in dark mode.
export const FOLDER_COLORS = ["default", "#ff3b3b", "#ff681b", "#ffbf00", "#00b94f", "#0085ff", "#9146ff", "#ff59ae"] as const;
export interface FolderAppearance { icon: string; color: string }
export type FolderAppearances = Record<string, FolderAppearance>;
export function defaultAppearance(key: string): FolderAppearance {
  return { icon: key === "\u0000pinned" ? "pin" : "folder", color: "default" };
}
export function normalizeAppearance(value: unknown, key: string): FolderAppearance {
  const defaults = defaultAppearance(key);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<FolderAppearance>;
  return {
    icon: icons.some((icon) => icon.id === input.icon) ? input.icon! : defaults.icon,
    color: FOLDER_COLORS.some((color) => color === input.color) ? input.color! : "default",
  };
}
export function iconPath(icon: string, expanded: boolean): string {
  const entry = icons.find((entry) => entry.id === icon) ?? icons[0];
  return expanded && entry.open ? entry.open : entry.path;
}
