import type { Editor } from "@tiptap/react";

interface MergeEditorsValue {
  leftEditor: Editor | null;
  rightEditor: Editor | null;
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
