import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type DropDecision =
  | { action: "wrap-left" | "wrap-right"; targetPos: number; targetElement: Element }
  | { action: "default" };

export interface ComputeDropTargetParams {
  view: EditorView;
  clientX: number;
  clientY: number;
}

const LEFT_THRESHOLD = 0.25;
const RIGHT_THRESHOLD = 0.75;

/**
 * ドラッグ中のカーソル位置が画像ブロックの左/右 25% 内にあるかを判定する。
 * 範囲外または画像ブロック上でない場合は "default" を返す。
 */
export function computeDropTarget(params: Readonly<ComputeDropTargetParams>): DropDecision {
  const { view, clientX, clientY } = params;
  const coords = view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) return { action: "default" };

  const domAtPos = view.domAtPos(coords.pos);
  const nodeAtPos = domAtPos.node as Node | null;
  let targetElement: Element | null = null;
  if (nodeAtPos instanceof Element) {
    targetElement = nodeAtPos.closest("[data-image-block]");
  } else if (nodeAtPos?.parentElement) {
    targetElement = nodeAtPos.parentElement.closest("[data-image-block]");
  }
  if (!targetElement) return { action: "default" };

  const rect = targetElement.getBoundingClientRect();
  if (rect.width === 0) return { action: "default" };
  const xRatio = (clientX - rect.left) / rect.width;
  if (xRatio <= LEFT_THRESHOLD) {
    return { action: "wrap-left", targetPos: coords.pos, targetElement };
  }
  if (xRatio >= RIGHT_THRESHOLD) {
    return { action: "wrap-right", targetPos: coords.pos, targetElement };
  }
  return { action: "default" };
}

/**
 * ドラッグされたソース image と、ドロップ先の判定結果から transaction を構築して適用する。
 * - wrap-left / wrap-right: ターゲット画像と source で新規 imageRow を作成
 * - ターゲットが既に imageRow 内にある場合: 左右挿入
 * - default: 何もしない（呼び出し側で別途処理）
 */
export function applyDropAction(
  view: EditorView,
  source: Readonly<{ node: ProseMirrorNode; pos: number }>,
  decision: DropDecision,
): boolean {
  if (decision.action === "default") return false;

  const { state } = view;
  const targetPos = decision.targetPos;

  // ターゲット位置の解決
  const $target = state.doc.resolve(targetPos);
  // $target が image を指している場合とその親を扱う
  let targetImageNode: ProseMirrorNode | null = null;
  let targetImagePos = -1;
  let parentIsImageRow = false;

  // 直下が image の場合
  for (let depth = $target.depth; depth >= 0; depth--) {
    const node = $target.node(depth);
    if (node.type.name === "image") {
      targetImageNode = node;
      targetImagePos = $target.before(depth);
      if (depth > 0) {
        const parent = $target.node(depth - 1);
        parentIsImageRow = parent.type.name === "imageRow";
      }
      break;
    }
    // image の直前（before）に位置している場合
    const maybeChild = node.maybeChild($target.indexAfter(depth));
    if (maybeChild?.type.name === "image") {
      targetImageNode = maybeChild;
      targetImagePos = $target.posAtIndex($target.indexAfter(depth), depth);
      parentIsImageRow = node.type.name === "imageRow";
      break;
    }
  }
  if (!targetImageNode || targetImagePos < 0) return false;

  const tr = state.tr;

  // 挿入位置の決定（source 削除前の座標系で計算）
  const insertLeft = decision.action === "wrap-left";
  const sourceCopy = source.node;

  if (parentIsImageRow) {
    // 既存 imageRow 内に左右挿入
    const insertPos = insertLeft ? targetImagePos : targetImagePos + targetImageNode.nodeSize;
    // source を削除
    tr.delete(source.pos, source.pos + sourceCopy.nodeSize);
    // source 削除で insertPos がずれる可能性を調整
    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, sourceCopy);
  } else {
    // 新規 imageRow を作成してターゲットを置換
    const imageRowType = state.schema.nodes.imageRow;
    if (!imageRowType) return false;
    const children = insertLeft ? [sourceCopy, targetImageNode] : [targetImageNode, sourceCopy];
    const newRow = imageRowType.create(null, children);
    // source を先に削除
    tr.delete(source.pos, source.pos + sourceCopy.nodeSize);
    // 削除後のターゲット位置
    const mappedTargetPos = tr.mapping.map(targetImagePos);
    tr.replaceWith(mappedTargetPos, mappedTargetPos + targetImageNode.nodeSize, newRow);
  }
  tr.setMeta("imageRowDrop", true);
  view.dispatch(tr);
  return true;
}

const DROP_CURSOR_CLASS = "image-row-drop-cursor-vertical";

function removeDropCursors(view: EditorView): void {
  const parent = view.dom.parentElement;
  if (!parent) return;
  parent.querySelectorAll(`.${DROP_CURSOR_CLASS}`).forEach((el) => el.remove());
}

function renderDropCursor(view: EditorView, decision: DropDecision): void {
  removeDropCursors(view);
  if (decision.action !== "wrap-left" && decision.action !== "wrap-right") return;
  const parent = view.dom.parentElement;
  if (!parent) return;
  const rect = decision.targetElement.getBoundingClientRect();
  const parentRect = view.dom.getBoundingClientRect();
  const cursorEl = document.createElement("div");
  cursorEl.className = DROP_CURSOR_CLASS;
  cursorEl.style.top = `${rect.top - parentRect.top}px`;
  cursorEl.style.height = `${rect.height}px`;
  cursorEl.style.left =
    decision.action === "wrap-left"
      ? `${rect.left - parentRect.left - 2}px`
      : `${rect.right - parentRect.left}px`;
  parent.appendChild(cursorEl);
}

export const imageRowDropPluginKey = new PluginKey("imageRowDrop");

export const imageRowDropPlugin = new Plugin({
  key: imageRowDropPluginKey,
  props: {
    handleDrop(view, event) {
      const dragEvent = event as DragEvent;
      const decision = computeDropTarget({
        view,
        clientX: dragEvent.clientX,
        clientY: dragEvent.clientY,
      });
      if (decision.action === "default") return false;
      // ドラッグ中のノード情報を取得（ProseMirror 内部のドラッグ）
      const slice = view.dragging?.slice;
      if (!slice || slice.content.childCount !== 1) return false;
      const sourceNode = slice.content.firstChild;
      if (!sourceNode || sourceNode.type.name !== "image") return false;
      // ソース位置を dragging から取る必要があるが、標準 EditorView.dragging は位置を持たない。
      // そのため、schema.nodes.image を検索して元の位置を推定する必要があるが、
      // ここでは view.someProp("handleDOMEvents") で先に dragstart を捕捉して位置を保存する必要がある。
      // 現時点の最小実装として、source と同一 attrs を持つ最初の image を元位置として扱う。
      const target: { node: ProseMirrorNode; pos: number } | null = (() => {
        let found: { node: ProseMirrorNode; pos: number } | null = null;
        view.state.doc.descendants((node, pos) => {
          if (found) return false;
          if (node.type.name === "image" && node.attrs.src === sourceNode.attrs.src) {
            found = { node, pos };
          }
        });
        return found;
      })();
      if (!target) return false;
      event.preventDefault();
      removeDropCursors(view);
      return applyDropAction(view, target, decision);
    },
    handleDOMEvents: {
      dragover(view, event) {
        const dragEvent = event as DragEvent;
        const decision = computeDropTarget({
          view,
          clientX: dragEvent.clientX,
          clientY: dragEvent.clientY,
        });
        renderDropCursor(view, decision);
        return false;
      },
      dragleave(view) {
        removeDropCursors(view);
        return false;
      },
      drop(view) {
        removeDropCursors(view);
        return false;
      },
    },
  },
});
