import { t } from "./i18n.ts";

export const VARIABLE_EXAMPLE_KINDS = ["Plain", "Default", "Select", "Multi", "Snippet"] as const;
export type VariableExampleKind = typeof VARIABLE_EXAMPLE_KINDS[number];

export function variableExample(kind: VariableExampleKind) {
  return {
    kind,
    title: t(`variableExample${kind}Title`),
    need: t(`variableExample${kind}Need`),
    code: t(`variableExample${kind}Code`),
    result: t(`variableExample${kind}Result`),
    generated: t(`variableExample${kind}Generated`),
  };
}
