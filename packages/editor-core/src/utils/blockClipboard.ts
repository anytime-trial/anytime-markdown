/**
 * ブロック要素のクリップボード操作共通ユーティリティ。
 * useEditorConfig.ts（Ctrl+C/X）と EditorContextMenu.tsx（右クリック）で共用。
 */
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";

/** クリップボード操作の対象となるブロックノードタイプ */
export const BLOCK_NODE_TYPES = new Set(["codeBlock", "table", "gifBlock", "image"]);

/** コンテキストメニュー経由でコピーしたブロックノードの保持 */
let _copiedBlockNode: PMNode | null = null;

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
export function findBlockNode(editor: Editor): BlockInfo | null {
  const { $from, from } = editor.state.selection;

  // 1. 祖先ノードをチェック
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (BLOCK_NODE_TYPES.has(node.type.name)) {
      const pos = $from.before(d);
      return { node, pos, text: editor.state.doc.textBetween(pos, pos + node.nodeSize, "\n") };
    }
  }

  // 2. カーソル位置のノード（NodeView の外にカーソルがある場合）
  const nodeAt = editor.state.doc.nodeAt(from);
  if (nodeAt && BLOCK_NODE_TYPES.has(nodeAt.type.name)) {
    return { node: nodeAt, pos: from, text: editor.state.doc.textBetween(from, from + nodeAt.nodeSize, "\n") };
  }

  // 3. カーソルの直前のノード
  if (from > 0) {
    const $pos = editor.state.doc.resolve(from);
    const before = $pos.nodeBefore;
    if (before && BLOCK_NODE_TYPES.has(before.type.name)) {
      const pos = from - before.nodeSize;
      return { node: before, pos, text: editor.state.doc.textBetween(pos, from, "\n") };
    }
  }

  // 4. トップレベルノードをチェック
  if ($from.depth >= 1) {
    const topNode = $from.node(1);
    if (BLOCK_NODE_TYPES.has(topNode.type.name)) {
      const pos = $from.before(1);
      return { node: topNode, pos, text: editor.state.doc.textBetween(pos, pos + topNode.nodeSize, "\n") };
    }
  }

  return null;
}

/**
 * ブロックノードを HTML としてシリアライズし、クリップボードに設定する。
 * data-pm-slice 属性を付与して ProseMirror がペースト時にブロック構造を復元できるようにする。
 */
export function copyBlockToClipboard(view: EditorView, block: BlockInfo, clipboardData: DataTransfer): void {
  clipboardData.setData("text/plain", block.text);

  const domSerializer = DOMSerializer.fromSchema(view.state.schema);
  const htmlFragment = domSerializer.serializeNode(block.node);
  const wrapper = document.createElement("div");
  wrapper.appendChild(htmlFragment);
  wrapper.firstElementChild?.setAttribute("data-pm-slice", "0 0 []");
  clipboardData.setData("text/html", wrapper.innerHTML);

  setCopiedBlockNode(block.node);
}

/**
 * DOM イベントの copy/cut ハンドラ。
 * ブロック要素全体またはコードブロック内テキスト選択をクリップボードにコピーする。
 */
export function handleBlockClipboardEvent(view: EditorView, event: ClipboardEvent, isCut: boolean): boolean {
  if (!event.clipboardData) return false;
  const { $from, $to, from, to } = view.state.selection;

  // テキスト選択がある場合: コードブロック内のテキストコピー
  if (from !== to && $from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
    event.clipboardData.setData("text/plain", view.state.doc.textBetween(from, to));
    event.preventDefault();
    setCopiedBlockNode(null);
    if (isCut) view.dispatch(view.state.tr.deleteSelection());
    return true;
  }

  // ブロックノード全体のコピー/カット
  const depth = $from.depth;
  for (let d = depth; d >= 1; d--) {
    const node = $from.node(d);
    if (BLOCK_NODE_TYPES.has(node.type.name)) {
      const pos = $from.before(d);
      const text = view.state.doc.textBetween(pos, pos + node.nodeSize, "\n");
      copyBlockToClipboard(view, { node, pos, text }, event.clipboardData);
      event.preventDefault();
      if (isCut) {
        view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      }
      return true;
    }
  }
  return false;
}
