export type KeyBindingAction = "advance" | "newline" | "back";

export type KeyBindings = Record<KeyBindingAction, string>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  advance: "enter",
  newline: "shift+enter",
  back: "escape",
};

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const;
const MODIFIERS = new Set<string>(MODIFIER_ORDER);

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
    if (MODIFIERS.has(part)) {
      modifiers.add(part);
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

// 修饰键必须完全一致（多按或少按都不命中），输入法组合态一律不命中
export function matchesKeybinding(event: KeybindingEvent, binding: string): boolean {
  if (event.isComposing) return false;
  const normalized = normalizeBinding(binding);
  if (!normalized) return false;
  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const required = new Set(parts.slice(0, -1));
  if (normalizeKeyName(event.key.toLowerCase()) !== key) return false;
  const pressed = new Set(
    MODIFIER_ORDER.filter((modifier) =>
      modifier === "meta" ? event.metaKey === true : event[`${modifier}Key`]
    )
  );
  if (pressed.size !== required.size) return false;
  return [...pressed].every((modifier) => required.has(modifier));
}

const DISPLAY_NAMES: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Win",
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

export function formatKeybinding(binding: string): string {
  const normalized = normalizeBinding(binding);
  if (!normalized) return binding;
  return normalized
    .split("+")
    .map((part) => {
      const display = DISPLAY_NAMES[part];
      if (display) return display;
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}
