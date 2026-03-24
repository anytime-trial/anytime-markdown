import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

import type { HeadingItem } from "../types";

/**
 * heading ノードが管轄するセクション範囲 (from..to) を返す。
 * "セクション" = 対象 heading から、同レベル以下の次の heading の直前まで。
 */
export function getSectionRange(
  doc: PMNode,
  headingPos: number,
  headingLevel: number
): { from: number; to: number } {
  let from = -1;
  let to = doc.content.size;
  let passed = false;

  doc.forEach((node, offset) => {
    if (offset === headingPos) {
      from = offset;
      passed = true;
      return;
    }
    if (passed && from !== -1 && to === doc.content.size) {
      if (node.type.name === "heading" && (node.attrs.level as number) <= headingLevel) {
        to = offset;
      }
    }
  });

  if (from === -1) from = headingPos;
  return { from, to };
}

/**
 * headings 配列の fromIdx → toIdx へセクションを移動する。
 * 単一 Transaction で実行し undo/redo 対応。
 * toIdx === -1 は末尾移動を示す。
 */
export function moveHeadingSection(
  editor: Editor,
  headings: HeadingItem[],
  fromIdx: number,
  toIdx: number
): void {
  // heading のみ抽出
  const headingOnly = headings.filter((h) => h.kind === "heading");
  const srcItem = headingOnly[fromIdx];
  if (!srcItem) return;

  const { state } = editor;
  const { doc, tr } = state;

  const src = getSectionRange(doc, srcItem.pos, srcItem.level);
  const srcSlice = doc.slice(src.from, src.to);

  let targetPos: number;
  if (toIdx === -1) {
    // 末尾
    targetPos = doc.content.size;
  } else {
    const tgtItem = headingOnly[toIdx];
    if (!tgtItem) return;
    targetPos = tgtItem.pos;
  }

  if (targetPos >= src.from && targetPos <= src.to) return; // 同一セクション内

  if (targetPos < src.from) {
    // 前方移動: insert first, then delete (positions shift)
    tr.insert(targetPos, srcSlice.content);
    const shift = srcSlice.content.size;
    tr.delete(src.from + shift, src.to + shift);
  } else {
    // 後方移動: delete first, then insert
    tr.delete(src.from, src.to);
    const shift = src.to - src.from;
    tr.insert(targetPos - shift, srcSlice.content);
  }

  editor.view.dispatch(tr);
}
