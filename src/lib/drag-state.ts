import { ref } from "vue";

// 拖动排序的共享状态。HTML5 拖动期间读不到 dataTransfer 内容，
// 因此落点是否合法由这里的当前拖动对象决定。
export const DRAG_MIME = "application/x-promptdock";

export interface DragPayload {
  kind: "prompt" | "folder";
  // 提示词 ID 或文件夹键
  id: string;
  // 拖动起点的分区键：置顶区或文件夹名
  sectionKey: string;
}

export type DropPosition = "before" | "after";

export type DropTarget =
  | { kind: "prompt-row"; sectionKey: string; promptId: string; position: DropPosition }
  | { kind: "folder-header"; sectionKey: string; position: DropPosition }
  | { kind: "folder-end"; sectionKey: string };

export const dragPayload = ref<DragPayload | null>(null);
let frame = 0;
let pointer: { x: number; y: number } | null = null;

function track(event: DragEvent) {
  pointer = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(scrollAtEdge);
}

function scrollAtEdge() {
  frame = 0;
  if (!pointer || !dragPayload.value) return;
  const { x, y } = pointer;
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!element?.closest("[data-manager-navigation]")) return;
  while (element) {
    const rect = element.getBoundingClientRect();
    const parentNav = element.closest("[data-manager-navigation]")?.getBoundingClientRect();
    const top = Math.max(rect.top, parentNav?.top ?? rect.top);
    const bottom = Math.min(rect.bottom, parentNav?.bottom ?? rect.bottom);
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
      const delta = y < top + 28 ? -8 : y > bottom - 28 ? 8 : 0;
      if (delta && (delta < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1)) {
        element.scrollTop += delta;
        break;
      }
    }
    if (element.hasAttribute("data-manager-navigation")) break;
    element = element.parentElement;
  }
  frame = requestAnimationFrame(scrollAtEdge);
}

function cancelOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape") endDrag();
}

export function beginDrag(payload: DragPayload) {
  endDrag();
  dragPayload.value = payload;
  document.addEventListener("dragover", track, true);
  document.addEventListener("drop", endDrag);
  document.addEventListener("dragend", endDrag);
  document.addEventListener("keydown", cancelOnEscape, true);
}

export function endDrag() {
  dragPayload.value = null;
  pointer = null;
  cancelAnimationFrame(frame);
  frame = 0;
  document.removeEventListener("dragover", track, true);
  document.removeEventListener("drop", endDrag);
  document.removeEventListener("dragend", endDrag);
  document.removeEventListener("keydown", cancelOnEscape, true);
}
