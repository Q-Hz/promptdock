export type KeyBindingAction = "advance" | "newline" | "back";

export type KeyBindings = Record<KeyBindingAction, string>;

export type KeybindingPlatform = "macos" | "windows" | "other";

export const DEFAULT_GLOBAL_HOTKEY = "cmdorctrl+shift+space";

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  advance: "enter",
  newline: "shift+enter",
  back: "escape",
};

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta", "cmdorctrl"] as const;
const MODIFIERS = new Set<string>(MODIFIER_ORDER);
const PHYSICAL_MODIFIERS = ["ctrl", "alt", "shift", "meta"] as const;

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  control: "ctrl",
  option: "alt",
  command: "meta",
  cmd: "meta",
  super: "meta",
  win: "meta",
  windows: "meta",
  commandorcontrol: "cmdorctrl",
  commandorctrl: "cmdorctrl",
  cmdorcontrol: "cmdorctrl",
  cmdorctrl: "cmdorctrl",
};

export function detectKeybindingPlatform(): KeybindingPlatform {
  if (typeof navigator === "undefined") return "other";
  const value = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  return "other";
}

function normalizeKeyName(key: string): string {
  if (key === " ") return "space";
  if (key === "esc") return "escape";
  return key;
}

// 归一为 "ctrl+alt+shift+meta+<key>" 小写形式；仅修饰键或空串返回 null
export function normalizeBinding(raw: string): string | null {
  const parts = raw
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const modifiers = new Set<string>();
  let key = "";
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part] ?? part;
    if (MODIFIERS.has(modifier)) {
      modifiers.add(modifier);
    } else {
      key = normalizeKeyName(part);
    }
  }
  if (!key || MODIFIERS.has(key)) return null;
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join("+");
}

export interface KeybindingEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}

export function bindingFromKeyboardEvent(
  event: KeybindingEvent,
  forGlobalHotkey = false
): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push(forGlobalHotkey ? "command" : "meta");

  const key = event.key.toLowerCase();
  if (["control", "alt", "shift", "meta", "os", "command"].includes(key)) return null;
  parts.push(normalizeKeyName(key));
  return parts.join("+");
}

// 修饰键必须完全一致（多按或少按都不命中），输入法组合态一律不命中
export function matchesKeybinding(
  event: KeybindingEvent,
  binding: string,
  platform: KeybindingPlatform = detectKeybindingPlatform()
): boolean {
  if (event.isComposing) return false;
  const normalized = normalizeBinding(binding);
  if (!normalized) return false;
  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const required = new Set(
    parts.slice(0, -1).map((modifier) => {
      if (modifier !== "cmdorctrl") return modifier;
      return platform === "macos" ? "meta" : "ctrl";
    })
  );
  if (normalizeKeyName(event.key.toLowerCase()) !== key) return false;
  const pressed = new Set(
    PHYSICAL_MODIFIERS.filter((modifier) =>
      modifier === "meta" ? event.metaKey === true : event[`${modifier}Key`]
    )
  );
  if (pressed.size !== required.size) return false;
  return [...pressed].every((modifier) => required.has(modifier));
}

const WINDOWS_DISPLAY_NAMES: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Win",
  cmdorctrl: "Ctrl",
  escape: "Esc",
  enter: "Enter",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const MACOS_DISPLAY_NAMES: Record<string, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
  cmdorctrl: "⌘",
};

export function formatKeybinding(
  binding: string,
  platform: KeybindingPlatform = detectKeybindingPlatform()
): string {
  const normalized = normalizeBinding(binding);
  if (!normalized) return binding;
  const normalizedParts = normalized.split("+");
  const key = normalizedParts[normalizedParts.length - 1] ?? "";
  const modifierRank =
    platform === "macos"
      ? ["ctrl", "alt", "shift", "meta", "cmdorctrl"]
      : ["ctrl", "cmdorctrl", "alt", "shift", "meta"];
  const orderedParts = [
    ...normalizedParts
      .slice(0, -1)
      .sort((left, right) => modifierRank.indexOf(left) - modifierRank.indexOf(right)),
    key,
  ];
  const parts = orderedParts
    .map((part) => {
      const display =
        platform === "macos" ? MACOS_DISPLAY_NAMES[part] ?? WINDOWS_DISPLAY_NAMES[part] : WINDOWS_DISPLAY_NAMES[part];
      if (display) return display;
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    });
  return parts.join(platform === "macos" ? "" : "+");
}
