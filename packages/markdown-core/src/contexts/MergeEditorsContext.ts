import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

interface MergeEditorsValue {
  rightEditor: Editor | null;
  leftEditor: Editor | null;
  /** メインエディタがレビュー/readonly モードかどうか */
  isReviewMode?: boolean;
}

/** モジュールレベルのストア（TipTap NodeView ポータルからもアクセス可能） */
let _mergeEditors: MergeEditorsValue | null = null;

export function setMergeEditors(value: MergeEditorsValue | null) {
  _mergeEditors = value;
}

export function getMergeEditors(): MergeEditorsValue | null {
  return _mergeEditors;
}

/**
 * 対応するダイアグラムブロックのコードを取得する。
 * ドキュメント内の同種（mermaid/plantuml）ブロックのインデックスでマッチングする。
 */
export function findCounterpartCode(
  thisEditor: Editor,
  otherEditor: Editor | null,
  language: string,
  thisCode: string,
): string | null {
  if (!otherEditor) return null;

  // thisEditor 内で同じ language のコードブロックを列挙し、thisCode のインデックスを特定
  let thisIndex = -1;
  let count = 0;
  thisEditor.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock" && node.attrs.language === language) {
      if (node.textContent === thisCode && thisIndex === -1) {
        thisIndex = count;
      }
      count++;
    }
  });

  if (thisIndex === -1) return null;

  // otherEditor 内で同じインデックスのブロックを取得
  let otherCount = 0;
  let otherCode: string | null = null;
  otherEditor.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock" && node.attrs.language === language) {
      if (otherCount === thisIndex && otherCode === null) {
        otherCode = node.textContent;
      }
      otherCount++;
    }
  });

  return otherCode;
}

/**
 * エディタ内の同言語コードブロックのインデックスを取得する。
 */
export function getCodeBlockIndex(editor: Editor, language: string, code: string): number {
  let index = -1;
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "codeBlock" && node.attrs.language === language) {
      if (node.textContent === code && index === -1) {
        index = count;
      }
      count++;
    }
  });
  return index;
}

/**
 * インデックスで指定したコードブロックの位置とサイズを取得する。
 */
export function findCodeBlockByIndex(
  editor: Editor,
  language: string,
  index: number,
): { pos: number; size: number } | null {
  let count = 0;
  let result: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock" && node.attrs.language === language) {
      if (count === index && result === null) {
        result = { pos, size: node.content.size };
      }
      count++;
    }
  });
  return result;
}

/**
 * 対応するテーブルノードの HTML を取得する。
 * テーブルノードのインデックスでマッチングし、DOMSerializer で HTML に変換。
 */
export function findCounterpartTableHtml(
  thisEditor: Editor,
  otherEditor: Editor | null,
  thisPos: number,
): string | null {
  if (!otherEditor) return null;

  // thisEditor 内のテーブルインデックスを特定
  let thisIndex = -1;
  let count = 0;
  thisEditor.state.doc.descendants((node, pos) => {
    if (node.type.name === "table") {
      if (pos === thisPos && thisIndex === -1) {
        thisIndex = count;
      }
      count++;
    }
  });
  if (thisIndex === -1) return null;

  // otherEditor 内の同インデックスのテーブルを取得し HTML に変換
  let otherCount = 0;
  let html: string | null = null;
  const serializer = DOMSerializer.fromSchema(otherEditor.schema);
  otherEditor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      if (otherCount === thisIndex && html === null) {
        const dom = serializer.serializeNode(node);
        const div = document.createElement("div");
        div.appendChild(dom);
        // Remove inline style/width attributes to let CSS take control
        div.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
        div.querySelectorAll("[width]").forEach((el) => el.removeAttribute("width"));
        html = div.innerHTML;
      }
      otherCount++;
    }
  });
  return html;
}

/**
 * 対応するコードブロックの位置とサイズを取得する。
 * マージ時にトランザクションでブロック内容を置換するために使用。
 */
export function findCounterpartCodePos(
  thisEditor: Editor,
  otherEditor: Editor | null,
  language: string,
  thisCode: string,
): { pos: number; size: number } | null {
  if (!otherEditor) return null;
  const thisIndex = getCodeBlockIndex(thisEditor, language, thisCode);
  if (thisIndex === -1) return null;
  return findCodeBlockByIndex(otherEditor, language, thisIndex);
}
