export type KeyChord = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export function isDeveloperToolsShortcut(event: KeyChord): boolean {
  const key = event.key.toLowerCase();
  if (key === "f12") return true;

  const chromiumKey = key === "i" || key === "j" || key === "c";
  return chromiumKey && (
    (event.ctrlKey && event.shiftKey) ||
    (event.metaKey && event.altKey)
  );
}
