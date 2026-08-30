import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GLOBAL_HOTKEY,
  DEFAULT_KEY_BINDINGS,
  bindingFromKeyboardEvent,
  formatKeybinding,
  matchesKeybinding,
  normalizeBinding,
  type KeybindingEvent,
} from "../src/lib/keybindings.ts";

function event(overrides: Partial<KeybindingEvent> & { key: string }): KeybindingEvent {
  return { ctrlKey: false, altKey: false, shiftKey: false, ...overrides };
}

test("normalizeBinding orders modifiers and maps aliases", () => {
  assert.equal(normalizeBinding("Enter"), "enter");
  assert.equal(normalizeBinding("shift+enter"), "shift+enter");
  assert.equal(normalizeBinding("Shift + Enter"), "shift+enter");
  assert.equal(normalizeBinding("ENTER+SHIFT"), "shift+enter");
  assert.equal(normalizeBinding("alt+ctrl+x"), "ctrl+alt+x");
  assert.equal(normalizeBinding("Ctrl+Alt+Space"), "ctrl+alt+space");
  assert.equal(normalizeBinding("Command+Shift+Space"), "shift+meta+space");
  assert.equal(normalizeBinding("CmdOrCtrl+Shift+Space"), "shift+cmdorctrl+space");
  assert.equal(normalizeBinding("esc"), "escape");
});

test("normalizeBinding rejects empty and modifier-only strings", () => {
  assert.equal(normalizeBinding(""), null);
  assert.equal(normalizeBinding("ctrl+shift"), null);
  assert.equal(normalizeBinding("+"), null);
});

test("matchesKeybinding requires the exact key and modifier set", () => {
  assert.equal(matchesKeybinding(event({ key: "Enter" }), "enter"), true);
  assert.equal(matchesKeybinding(event({ key: "Enter", shiftKey: true }), "enter"), false);
  assert.equal(matchesKeybinding(event({ key: "Enter", shiftKey: true }), "shift+enter"), true);
  assert.equal(matchesKeybinding(event({ key: "Enter" }), "shift+enter"), false);
  assert.equal(matchesKeybinding(event({ key: "Enter", ctrlKey: true }), "ctrl+enter"), true);
  assert.equal(
    matchesKeybinding(event({ key: "Enter", ctrlKey: true, shiftKey: true }), "ctrl+enter"),
    false
  );
  assert.equal(matchesKeybinding(event({ key: "Escape" }), DEFAULT_KEY_BINDINGS.back), true);
});

test("cmdOrCtrl resolves to the platform primary modifier", () => {
  assert.equal(
    matchesKeybinding(event({ key: " ", metaKey: true, shiftKey: true }), DEFAULT_GLOBAL_HOTKEY, "macos"),
    true
  );
  assert.equal(
    matchesKeybinding(event({ key: " ", ctrlKey: true, shiftKey: true }), DEFAULT_GLOBAL_HOTKEY, "windows"),
    true
  );
  assert.equal(
    matchesKeybinding(event({ key: " ", ctrlKey: true, shiftKey: true }), DEFAULT_GLOBAL_HOTKEY, "macos"),
    false
  );
});

test("keyboard recording preserves a backend-compatible Command modifier", () => {
  const pressed = event({ key: "K", metaKey: true, shiftKey: true });
  assert.equal(bindingFromKeyboardEvent(pressed, true), "shift+command+k");
  assert.equal(bindingFromKeyboardEvent(pressed, false), "shift+meta+k");
  assert.equal(bindingFromKeyboardEvent(event({ key: "Meta", metaKey: true }), true), null);
});

test("matchesKeybinding normalizes space and escape spellings", () => {
  assert.equal(matchesKeybinding(event({ key: " " }), "ctrl+shift+space"), false);
  assert.equal(matchesKeybinding(event({ key: " ", ctrlKey: true, shiftKey: true }), "space+ctrl+shift"), true);
  assert.equal(matchesKeybinding(event({ key: "Escape" }), "esc"), true);
});

test("matchesKeybinding ignores events while an IME composition is active", () => {
  assert.equal(matchesKeybinding(event({ key: "Enter", isComposing: true }), "enter"), false);
});

test("matchesKeybinding returns false for invalid bindings", () => {
  assert.equal(matchesKeybinding(event({ key: "Enter" }), ""), false);
  assert.equal(matchesKeybinding(event({ key: "Enter" }), "ctrl+shift"), false);
});

test("formatKeybinding renders display names and keeps arrow symbols", () => {
  assert.equal(formatKeybinding("enter", "windows"), "Enter");
  assert.equal(formatKeybinding("shift+enter", "windows"), "Shift+Enter");
  assert.equal(formatKeybinding("ctrl+shift+space", "windows"), "Ctrl+Shift+Space");
  assert.equal(formatKeybinding("cmdorctrl+shift+space", "windows"), "Ctrl+Shift+Space");
  assert.equal(formatKeybinding("command+shift+space", "macos"), "⇧⌘Space");
  assert.equal(formatKeybinding("cmdorctrl+shift+space", "macos"), "⇧⌘Space");
  assert.equal(formatKeybinding("alt+ctrl+k", "macos"), "⌃⌥K");
  assert.equal(formatKeybinding("esc", "windows"), "Esc");
  assert.equal(formatKeybinding("arrowdown", "windows"), "↓");
  assert.equal(formatKeybinding("f5", "windows"), "F5");
});
