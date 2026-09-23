export type LauncherStage = "search" | "variables" | "result";

export type LauncherBackAction = "hide" | "reset" | "show-variables";

export function launcherBackAction(stage: LauncherStage): LauncherBackAction {
  if (stage === "search") return "hide";
  if (stage === "variables") return "reset";
  return "show-variables";
}
