import { reactive } from "vue";

export type DialogChoice = "save" | "discard" | "cancel";
export type DiscardChoice = "continue" | "discard";

interface ConfirmDialogState {
  open: boolean;
  mode: "unsaved" | "discard";
  resolve: ((choice: DialogChoice | DiscardChoice) => void) | null;
}

export const confirmDialog = reactive<ConfirmDialogState>({
  open: false,
  mode: "unsaved",
  resolve: null,
});

function open(mode: ConfirmDialogState["mode"]): Promise<DialogChoice | DiscardChoice> {
  // 连续触发时只处理第一次（PRD 12.2）
  if (confirmDialog.open) return Promise.resolve("cancel");
  confirmDialog.open = true;
  confirmDialog.mode = mode;
  return new Promise((resolve) => {
    confirmDialog.resolve = resolve;
  });
}

// 未保存确认：保存并继续 / 放弃修改 / 取消（PRD 9.5）
export function openUnsavedDialog(): Promise<DialogChoice> {
  return open("unsaved") as Promise<DialogChoice>;
}

// 放弃比较进度确认：继续处理 / 放弃并退出（PRD 7.6）
export function openDiscardDialog(): Promise<DiscardChoice> {
  return open("discard") as Promise<DiscardChoice>;
}

export function settleConfirmDialog(choice: DialogChoice | DiscardChoice) {
  confirmDialog.open = false;
  const resolve = confirmDialog.resolve;
  confirmDialog.resolve = null;
  resolve?.(choice);
}
