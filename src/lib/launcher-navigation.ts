export type LauncherStage = "search" | "variables" | "result";

export type VariableValues = Record<string, string | string[]>;

export function snapshotVariables(values: VariableValues): VariableValues {
  return Object.fromEntries(Object.entries(values).map(([name, value]) =>
    [name, Array.isArray(value) ? [...value] : value]
  ));
}

export function variablesChanged(current: VariableValues, baseline: VariableValues): boolean {
  const names = Object.keys(baseline);
  return Object.keys(current).length !== names.length || names.some((name) => {
    const before = baseline[name];
    const after = current[name];
    if (Array.isArray(before)) {
      return !Array.isArray(after) || before.length !== after.length ||
        before.some((value, index) => value !== after[index]);
    }
    return before !== after;
  });
}

export type LauncherBackAction = "hide" | "show-search" | "show-variables";

export function launcherBackAction(stage: LauncherStage, resultBackStage: "search" | "variables"): LauncherBackAction {
  if (stage === "search") return "hide";
  if (stage === "result" && resultBackStage === "variables") return "show-variables";
  return "show-search";
}
