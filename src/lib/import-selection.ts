import type { ImportDecision } from "./api";

// A full replacement may change the primary key. Follow the selected record after commit.
export function selectedIdAfterImport(selectedId: string | null, decisions: ImportDecision[]): string | null {
  if (selectedId === null) return null;
  return decisions.find((d) => d.action === "use_imported" && d.targetLocalId === selectedId)?.importedId ?? selectedId;
}
