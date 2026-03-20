/**
 * ブロック要素のクリップボード操作共通ユーティリティ。
 * useEditorConfig.ts（Ctrl+C/X）と EditorContextMenu.tsx（右クリック）で共用。
 */
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** クリップボード操作の対象となるブロックノードタイプ */
export const BLOCK_NODE_TYPES = new Set(["codeBlock", "table", "gifBlock", "image"]);

/** コンテキストメニュー経由でコピーしたブロックノードの保持 */
let _copiedBlockNode: PMNode | null = null;

/** keydown ハンドラで copy/cut 処理済みフラグ（VS Code WebView の二重処理防止） */
let _handledByKeydown = false;

export function setHandledByKeydown(value: boolean): void {
  _handledByKeydown = value;
}

export function getCopiedBlockNode(): PMNode | null {
  return _copiedBlockNode;
}

export function setCopiedBlockNode(node: PMNode | null): void {
  _copiedBlockNode = node;
}

export interface BlockInfo {
  node: PMNode;
  pos: number;
  text: string;
}

/**
 * カーソル位置周辺のブロックノードを探す。
 * 4パターンで探索: 祖先 → カーソル位置 → 直前ノード → トップレベル
 */
export function findBlockNode(state: EditorState): BlockInfo | null {
  const { $from, from } = state.selection;

  // 1. 祖先ノードをチェック
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (BLOCK_NODE_TYPES.has(node.type.name)) {
      const pos = $from.before(d);
      return { node, pos, text: state.doc.textBetween(pos, pos + node.nodeSize, "\n") };
    }
  }

  // 2. カーソル位置のノード（NodeView の外にカーソルがある場合）
  const nodeAt = state.doc.nodeAt(from);
  if (nodeAt && BLOCK_NODE_TYPES.has(nodeAt.type.name)) {
    return { node: nodeAt, pos: from, text: state.doc.textBetween(from, from + nodeAt.nodeSize, "\n") };
  }

  // 3. カーソルの直前のノード
  if (from > 0) {
    const $pos = state.doc.resolve(from);
    const before = $pos.nodeBefore;
    if (before && BLOCK_NODE_TYPES.has(before.type.name)) {
      const pos = from - before.nodeSize;
      return { node: before, pos, text: state.doc.textBetween(pos, from, "\n") };
    }
  }

  // 4. トップレベルノードをチェック
  if ($from.depth >= 1) {
    const topNode = $from.node(1);
    if (BLOCK_NODE_TYPES.has(topNode.type.name)) {
      const pos = $from.before(1);
      return { node: topNode, pos, text: state.doc.textBetween(pos, pos + topNode.nodeSize, "\n") };
    }
  }

  return null;
}

/**
 * コピー/カット共通処理。
 * テキスト選択があれば選択テキスト、なければブロックノード全体を対象とし、
 * クリップボード書き込みはコールバックに委譲する。
 */
export function performBlockCopy(
  view: EditorView,
  isCut: boolean,
  writeClipboard: (text: string, block: BlockInfo | null) => void,
): boolean {
  const { from, to } = view.state.selection;

  if (from !== to) {
    const text = view.state.doc.textBetween(from, to, "\n");
    setCopiedBlockNode(null);
    writeClipboard(text, null);
    if (isCut) view.dispatch(view.state.tr.deleteSelection());
    return true;
  }

  const block = findBlockNode(view.state);
  if (block) {
    setCopiedBlockNode(block.node);
    writeClipboard(block.text, block);
    if (isCut) view.dispatch(view.state.tr.delete(block.pos, block.pos + block.node.nodeSize));
    return true;
  }
  return false;
}

/** カーソルがブロックノード内にあるか判定する */
function isInsideBlockNode(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 1; d--) {
    if (BLOCK_NODE_TYPES.has($from.node(d).type.name)) return true;
  }
  return false;
}

/**
 * DOM イベントの copy/cut ハンドラ（Ctrl+C/X 用）。
 * performBlockCopy を使い、ClipboardEvent にテキスト/HTML を書き込む。
 * ブロックノード外のテキスト選択は ProseMirror のデフォルト処理に委譲する。
 */
export function handleBlockClipboardEvent(view: EditorView, event: ClipboardEvent, isCut: boolean): boolean {
  // keydown ハンドラで処理済み（VS Code WebView の二重処理防止）
  if (_handledByKeydown) {
    _handledByKeydown = false;
    return true;
  }
  // VS Code WebView では clipboardData が null — keydown ハンドラで処理済みのため skip
  if (!event.clipboardData) return false;

  // ブロックノード外のテキスト選択は ProseMirror に委譲
  const { from, to } = view.state.selection;
  if (from !== to && !isInsideBlockNode(view.state)) return false;

  const clipboardData = event.clipboardData;
  const result = performBlockCopy(view, isCut, (text, block) => {
    clipboardData.setData("text/plain", text);
    if (block) {
      const domSerializer = DOMSerializer.fromSchema(view.state.schema);
      const htmlFragment = domSerializer.serializeNode(block.node);
      const wrapper = document.createElement("div");
      wrapper.appendChild(htmlFragment);
      wrapper.firstElementChild?.setAttribute("data-pm-slice", "0 0 []");
      clipboardData.setData("text/html", wrapper.innerHTML);
    }
  });
  if (result) event.preventDefault();
  return result;
}
