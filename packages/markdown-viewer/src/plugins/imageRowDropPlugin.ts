import type { Node as ProseMirrorNode } from "@anytime-markdown/markdown-pm/model";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { EditorView } from "@anytime-markdown/markdown-pm/view";

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

interface ResolvedDropTarget {
  node: ProseMirrorNode;
  pos: number;
  parentIsImageRow: boolean;
}

function resolveTargetImage(
  $target: ReturnType<EditorView["state"]["doc"]["resolve"]>,
): ResolvedDropTarget | null {
  for (let depth = $target.depth; depth >= 0; depth--) {
    const node = $target.node(depth);
    if (node.type.name === "image") {
      const parentIsImageRow =
        depth > 0 && $target.node(depth - 1).type.name === "imageRow";
      return { node, pos: $target.before(depth), parentIsImageRow };
    }
    const maybeChild = node.maybeChild($target.indexAfter(depth));
    if (maybeChild?.type.name === "image") {
      return {
        node: maybeChild,
        pos: $target.posAtIndex($target.indexAfter(depth), depth),
        parentIsImageRow: node.type.name === "imageRow",
      };
    }
  }
  return null;
}

function insertIntoImageRow(
  tr: ReturnType<EditorView["state"]["tr"]["delete"]>,
  source: Readonly<{ node: ProseMirrorNode; pos: number }>,
  target: ResolvedDropTarget,
  insertLeft: boolean,
): void {
  const insertPos = insertLeft ? target.pos : target.pos + target.node.nodeSize;
  tr.delete(source.pos, source.pos + source.node.nodeSize);
  tr.insert(tr.mapping.map(insertPos), source.node);
}

function wrapInNewImageRow(
  view: EditorView,
  tr: ReturnType<EditorView["state"]["tr"]["delete"]>,
  source: Readonly<{ node: ProseMirrorNode; pos: number }>,
  target: ResolvedDropTarget,
  insertLeft: boolean,
): boolean {
  const imageRowType = view.state.schema.nodes.imageRow;
  if (!imageRowType) return false;
  const children = insertLeft
    ? [source.node, target.node]
    : [target.node, source.node];
  const newRow = imageRowType.create(null, children);
  tr.delete(source.pos, source.pos + source.node.nodeSize);
  const mappedTargetPos = tr.mapping.map(target.pos);
  tr.replaceWith(mappedTargetPos, mappedTargetPos + target.node.nodeSize, newRow);
  return true;
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

  const target = resolveTargetImage(view.state.doc.resolve(decision.targetPos));
  if (!target) return false;

  const tr = view.state.tr;
  const insertLeft = decision.action === "wrap-left";

  if (target.parentIsImageRow) {
    insertIntoImageRow(tr, source, target, insertLeft);
  } else if (!wrapInNewImageRow(view, tr, source, target, insertLeft)) {
    return false;
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

// dragstart 時のドラッグ元 ProseMirror 位置。handleDrop で正確なソースノードを特定するために使う。
// 同一 src の画像が複数存在しても誤ったノードを掴まないようにするための状態。
let dragSourcePos: number | null = null;

/**
 * 保存した dragSourcePos から実際にドラッグされた image ノードを解決する。
 * pos が無効、もしくは src が一致しない場合は null を返し、呼び出し側のフォールバックに委ねる。
 */
function resolveSourceFromDragPos(
  view: EditorView,
  expectedSrc: unknown,
): { node: ProseMirrorNode; pos: number } | null {
  if (dragSourcePos == null) return null;
  if (dragSourcePos < 0 || dragSourcePos > view.state.doc.content.size) return null;
  try {
    const resolved = resolveTargetImage(view.state.doc.resolve(dragSourcePos));
    if (resolved && resolved.node.attrs.src === expectedSrc) {
      return { node: resolved.node, pos: resolved.pos };
    }
  } catch {
    // 位置が古い等で resolve に失敗した場合はフォールバックへ
    return null;
  }
  return null;
}

export const imageRowDropPlugin = new Plugin({
  key: imageRowDropPluginKey,
  props: {
    handleDrop(view, event) {
      const dragEvent = event;
      const decision = computeDropTarget({
        view,
        clientX: dragEvent.clientX,
        clientY: dragEvent.clientY,
      });
      if (decision.action === "default") return false;
      // ドラッグ中のノード情報を取得（ProseMirror 内部のドラッグ）
      const slice = view.dragging?.slice;
      if (slice?.content.childCount !== 1) return false;
      const sourceNode = slice.content.firstChild;
      if (sourceNode?.type.name !== "image") return false;
      // dragstart で保存した位置から正確なソースノードを特定する。
      // 解決できない場合のみ、同一 src を持つ最初の image を元位置とするフォールバックに委ねる
      // （同一 src 画像が複数あると誤ノードを掴むため、あくまで最終手段）。
      const target: { node: ProseMirrorNode; pos: number } | null =
        resolveSourceFromDragPos(view, sourceNode.attrs.src) ??
        (() => {
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
      const applied = applyDropAction(view, target, decision);
      dragSourcePos = null;
      return applied;
    },
    handleDOMEvents: {
      dragstart(view, event) {
        // ドラッグ開始位置の ProseMirror 位置を保存し、handleDrop で正確なソースを特定する
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        dragSourcePos = pos?.pos ?? null;
        return false;
      },
      dragover(view, event) {
        const dragEvent = event;
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
        dragSourcePos = null;
        return false;
      },
    },
  },
});
