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
  bodyPlaceholder: "Prompt 正文，支持 {{variable}} / {{count=15}} / {{tone=[a|b|c]}} / {{tags+=[a|b|c]}} 变量语法",
  favorite: "收藏",
  favorited: "已收藏",
  variablesDetected: "检测到变量：",
  selectValueHint: "可选值",
  multiValueHint: "多选",
  defaultValueHint: "默认 {value}",
  delete: "删除",
  save: "保存",
  importConfirmTitle: "导入 Prompt",
  importConfirmMessage: "请选择导入方式：\n\n「覆盖」：清空当前所有 Prompt，仅保留文件中的内容。\n「追加」：保留当前所有 Prompt，将文件中的条目添加进来（同名条目会更新为文件中的版本）。",
  importReplaceConfirmMessage: "确定要清空当前所有 Prompt 吗？\n\n此操作无法撤销，现有 Prompt 将被文件内容完全替换。",
  replace: "覆盖",
  merge: "追加",
  importSuccess: "已导入 {count} 条 Prompt。",
  exportSuccess: "Prompt 已成功导出。",
  deleteConfirm: "确定删除“{title}”吗？此操作无法撤销。",
  operationFailed: "操作失败：{error}",
  settingsTitle: "设置",
  hotkey: "调用快捷键",
  launcherKeysSection: "界面快捷键",
  keyAdvance: "前进 / 确认",
  keyNewline: "换行",
  keyBack: "返回上一界面",
  pressHotkey: "请按下新的快捷键组合…",
  change: "修改",
  autostart: "登录时运行 PromptDock",
  autostartFailed: "无法更新登录自启动设置：{error}",
  updates: "软件更新",
  autoCheckUpdate: "启动时自动检查更新",
  checkUpdate: "检查更新",
  checkingUpdate: "正在检查更新…",
  updateUpToDate: "已是最新版本",
  updateAvailable: "发现新版本 {version}",
  installUpdate: "安装并重启",
  downloadingUpdate: "正在下载更新…",
  installingUpdate: "正在安装，应用即将重启…",
  updateCheckFailed: "检查更新失败：{error}",
  updateInstallFailed: "更新安装失败：{error}",
  currentVersion: "当前版本 {version}",
  updateNotPending: "没有待安装的更新，请先检查更新。",
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
  invalidKeybinding: "快捷键格式无效，需为单个按键或“修饰键 + 按键”的组合。",
  launcherSearchPlaceholder: "搜索提示词…",
  launcherKeyHint: "↑↓ 选择 · {advance} 确认 · {back} 关闭",
  variablesKeyHint: "↑↓/Space 选项 · Tab 切换 · {newline} 换行 · {advance} 生成 · {back} 返回",
  resultKeyHint: "{advance} 复制并关闭 · {newline} 换行 · {back} 返回",
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
  bodyPlaceholder: "Prompt body. Variables: {{variable}} / {{count=15}} / {{tone=[a|b|c]}} / {{tags+=[a|b|c]}}",
  favorite: "Favorite",
  favorited: "Favorited",
  variablesDetected: "Variables detected:",
  selectValueHint: "options",
  multiValueHint: "multi-select",
  defaultValueHint: "default {value}",
  delete: "Delete",
  save: "Save",
  importConfirmTitle: "Import Prompts",
  importConfirmMessage: "Choose how to import:\n\n“Replace”: delete all current prompts and keep only the ones in the file.\n“Merge”: keep current prompts and add the file's entries (prompts with the same title are updated to the file's version).",
  importReplaceConfirmMessage: "Delete ALL current prompts?\n\nThis cannot be undone. Your library will be fully replaced by the file's contents.",
  replace: "Replace",
  merge: "Merge",
  importSuccess: "Imported {count} prompts.",
  exportSuccess: "Prompts exported successfully.",
  deleteConfirm: "Delete “{title}”? This cannot be undone.",
  operationFailed: "Operation failed: {error}",
  settingsTitle: "Settings",
  hotkey: "Launcher hotkey",
  launcherKeysSection: "In-app shortcuts",
  keyAdvance: "Advance / Confirm",
  keyNewline: "New line",
  keyBack: "Go back",
  pressHotkey: "Press a new keyboard shortcut…",
  change: "Change",
  autostart: "Launch PromptDock at login",
  autostartFailed: "Could not update the login startup setting: {error}",
  updates: "Software updates",
  autoCheckUpdate: "Check for updates on startup",
  checkUpdate: "Check for updates",
  checkingUpdate: "Checking for updates…",
  updateUpToDate: "You're on the latest version",
  updateAvailable: "New version available: {version}",
  installUpdate: "Install and restart",
  downloadingUpdate: "Downloading update…",
  installingUpdate: "Installing, the app will restart shortly…",
  updateCheckFailed: "Could not check for updates: {error}",
  updateInstallFailed: "Could not install the update: {error}",
  currentVersion: "Current version: {version}",
  updateNotPending: "No update pending. Check for updates first.",
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
  invalidKeybinding: "The shortcut format is invalid. It must be a single key or a “modifier + key” combination.",
  launcherSearchPlaceholder: "Search prompts…",
  launcherKeyHint: "↑↓ Select · {advance} Confirm · {back} Close",
  variablesKeyHint: "↑↓/Space Options · Tab Switch · {newline} New line · {advance} Generate · {back} Back",
  resultKeyHint: "{advance} Copy and close · {newline} New line · {back} Back",
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
  "settings.invalid_key_binding": "invalidKeybinding",
  "update.not_pending": "updateNotPending",
};

export function translateApiError(error: unknown): string {
  const value = String(error);
  if (value.startsWith("import.read_failed:")) return t("importReadFailed");
  if (value.startsWith("settings.autostart_failed:")) {
    return t("autostartFailed", { error: value.slice("settings.autostart_failed:".length) });
  }
  const key = apiErrorKeys[value];
  return key ? t(key) : value;
}
