import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_KEY_BINDINGS,
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
  assert.equal(formatKeybinding("enter"), "Enter");
  assert.equal(formatKeybinding("shift+enter"), "Shift+Enter");
  assert.equal(formatKeybinding("ctrl+shift+space"), "Ctrl+Shift+Space");
  assert.equal(formatKeybinding("esc"), "Esc");
  assert.equal(formatKeybinding("arrowdown"), "↓");
  assert.equal(formatKeybinding("f5"), "F5");
});
