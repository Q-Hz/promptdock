import { computed, ref } from "vue";

export type Language = "auto" | "zh" | "en";
type ResolvedLanguage = Exclude<Language, "auto">;

const zh = {
  managerTagline: "本地优先的 Prompt 管理与调用工具",
  newPrompt: "+ 新建",
  import: "导入",
  export: "导出",
  settings: "设置",
  searchPlaceholder: "搜索标题、标签或文件夹…",
  uncategorized: "未分类",
  noSearchResults: "没有匹配的 Prompt",
  promptLoading: "正在加载 Prompt…",
  promptLoadFailed: "Prompt 加载失败：{error}",
  retry: "重试",
  promptTitlePlaceholder: "Prompt 标题",
  tagsPlaceholder: "标签（逗号分隔）",
  folderPlaceholder: "文件夹（可新建）",
  bodyPlaceholder: "Prompt 正文，支持 {{variable}} / {{count=15}} / {{tone=[a|b|c]}} 变量语法",
  favorite: "收藏",
  favorited: "已收藏",
  variablesDetected: "检测到变量：",
  selectValueHint: "可选值",
  defaultValueHint: "默认 {value}",
  delete: "删除",
  save: "保存",
  importConfirmTitle: "导入 Prompt",
  importConfirmMessage: "是否覆盖现有 Prompt？选择“追加”将合并导入。",
  replace: "覆盖",
  merge: "追加",
  importSuccess: "已导入 {count} 条 Prompt。",
  exportSuccess: "Prompt 已成功导出。",
  deleteConfirm: "确定删除“{title}”吗？此操作无法撤销。",
  operationFailed: "操作失败：{error}",
  settingsTitle: "设置",
  hotkey: "调用快捷键",
  pressHotkey: "请按下新的快捷键组合…",
  change: "修改",
  autostart: "Windows 启动时运行 PromptDock",
  theme: "主题",
  language: "语言",
  automatic: "自动",
  light: "浅色",
  dark: "深色",
  chinese: "中文",
  english: "英文",
  cancel: "取消",
  saved: "已保存",
  saveFailed: "保存失败：{error}",
  hotkeyUnavailable: "新快捷键可能无效或已被占用，原快捷键仍然有效。",
  launcherSearchPlaceholder: "搜索提示词…",
  launcherKeyHint: "↑↓ 选择 · Enter 确认 · Esc 关闭",
  variableCount: "{count} 个变量",
  noVariables: "该 Prompt 没有变量，可以直接生成。",
  back: "返回",
  generatePrompt: "生成提示词",
  copyAndClose: "复制并关闭",
  copying: "正在复制…",
  copied: "已复制",
  copyFailed: "复制失败：{error}",
  dragWindow: "拖动窗口",
  importMissingFormat: "JSON 文件缺少 format 字段。",
  importUnsupportedFormat: "仅支持 promptdeck 或 promptdock 格式。",
  importUnsupportedVersion: "当前仅支持 version = 1 的 JSON 文件。",
  importMissingPrompts: "JSON 文件缺少 prompts 数组。",
  importNoPrompts: "文件中没有可导入的 Prompt。",
  importInvalidPrompt: "文件中存在字段缺失或类型错误的 Prompt。",
  importInvalidJson: "文件不是有效的 JSON。",
  importReadFailed: "无法读取所选文件。",
  invalidTheme: "主题设置无效。",
  invalidLanguage: "语言设置无效。",
} as const;

const en: Record<keyof typeof zh, string> = {
  managerTagline: "A local-first prompt manager and launcher",
  newPrompt: "+ New",
  import: "Import",
  export: "Export",
  settings: "Settings",
  searchPlaceholder: "Search title, tags, or folder…",
  uncategorized: "Uncategorized",
  noSearchResults: "No matching prompts",
  promptLoading: "Loading prompts…",
  promptLoadFailed: "Could not load prompts: {error}",
  retry: "Retry",
  promptTitlePlaceholder: "Prompt title",
  tagsPlaceholder: "Tags (comma-separated)",
  folderPlaceholder: "Folder (or create one)",
  bodyPlaceholder: "Prompt body. Variables: {{variable}} / {{count=15}} / {{tone=[a|b|c]}}",
  favorite: "Favorite",
  favorited: "Favorited",
  variablesDetected: "Variables detected:",
  selectValueHint: "options",
  defaultValueHint: "default {value}",
  delete: "Delete",
  save: "Save",
  importConfirmTitle: "Import Prompts",
  importConfirmMessage: "Replace existing prompts? Choose Merge to add to the current library.",
  replace: "Replace",
  merge: "Merge",
  importSuccess: "Imported {count} prompts.",
  exportSuccess: "Prompts exported successfully.",
  deleteConfirm: "Delete “{title}”? This cannot be undone.",
  operationFailed: "Operation failed: {error}",
  settingsTitle: "Settings",
  hotkey: "Launcher hotkey",
  pressHotkey: "Press a new keyboard shortcut…",
  change: "Change",
  autostart: "Run PromptDock when Windows starts",
  theme: "Theme",
  language: "Language",
  automatic: "Automatic",
  light: "Light",
  dark: "Dark",
  chinese: "Chinese",
  english: "English",
  cancel: "Cancel",
  saved: "Saved",
  saveFailed: "Could not save settings: {error}",
  hotkeyUnavailable: "The new shortcut may be invalid or unavailable. The previous shortcut is still active.",
  launcherSearchPlaceholder: "Search prompts…",
  launcherKeyHint: "↑↓ Select · Enter Confirm · Esc Close",
  variableCount: "{count} variables",
  noVariables: "This prompt has no variables and can be generated directly.",
  back: "Back",
  generatePrompt: "Generate Prompt",
  copyAndClose: "Copy and Close",
  copying: "Copying…",
  copied: "Copied",
  copyFailed: "Copy failed: {error}",
  dragWindow: "Drag window",
  importMissingFormat: "The JSON file is missing the format field.",
  importUnsupportedFormat: "Only promptdeck and promptdock formats are supported.",
  importUnsupportedVersion: "Only JSON files with version = 1 are currently supported.",
  importMissingPrompts: "The JSON file is missing the prompts array.",
  importNoPrompts: "The file contains no importable prompts.",
  importInvalidPrompt: "One or more prompts have missing fields or invalid field types.",
  importInvalidJson: "The file is not valid JSON.",
  importReadFailed: "The selected file could not be read.",
  invalidTheme: "The theme setting is invalid.",
  invalidLanguage: "The language setting is invalid.",
};

export type MessageKey = keyof typeof zh;

export const language = ref<Language>("auto");
const automaticLanguage = ref<ResolvedLanguage>(detectSystemLanguage());

export const resolvedLanguage = computed<ResolvedLanguage>(() =>
  language.value === "auto" ? automaticLanguage.value : language.value
);

function detectSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function refreshAutomaticLanguage() {
  automaticLanguage.value = detectSystemLanguage();
}

export function setLanguage(value: Language) {
  language.value = value;
}

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = resolvedLanguage.value === "zh" ? zh[key] : en[key];
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    message
  );
}

const apiErrorKeys: Record<string, MessageKey> = {
  "import.missing_format": "importMissingFormat",
  "import.unsupported_format": "importUnsupportedFormat",
  "import.unsupported_version": "importUnsupportedVersion",
  "import.missing_prompts": "importMissingPrompts",
  "import.no_prompts": "importNoPrompts",
  "import.invalid_prompt": "importInvalidPrompt",
  "import.invalid_json": "importInvalidJson",
  "settings.invalid_theme": "invalidTheme",
  "settings.invalid_language": "invalidLanguage",
};

export function translateApiError(error: unknown): string {
  const value = String(error);
  if (value.startsWith("import.read_failed:")) return t("importReadFailed");
  const key = apiErrorKeys[value];
  return key ? t(key) : value;
}
