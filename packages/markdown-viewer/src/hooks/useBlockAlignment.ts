import type { Editor } from "@anytime-markdown/markdown-react";
import { useEffect } from "react";

import type { AlignSpacer } from "../extensions/blockAlignSpacers";
import type { AlignedSlot } from "../utils/blockDiffComputation";
import { computeBlockAlignment } from "../utils/blockDiffComputation";

/** 高さ差がこの px 未満なら無視（微小揺れによるループ・チラつき防止） */
const MIN_GAP_PX = 1;

interface BlockMetrics {
  heights: number[];
  ends: number[];
}

/**
 * アライン slot と左右ブロックの高さ・終端位置から、各 side のスペーサーを算出する純粋関数。
 * 対応行の高さを max に揃えるため、低い側に不足分の空きを入れる。
 * 片側にしかないブロック（挿入/削除）は、反対側の直前ブロック終端にその行高ぶんの空きを入れる。
 */
export function computeAlignSpacers(
  slots: AlignedSlot[],
  a: BlockMetrics,
  b: BlockMetrics,
): { aSpacers: AlignSpacer[]; bSpacers: AlignSpacer[] } {
  const aGap = new Map<number, number>();
  const bGap = new Map<number, number>();
  let lastAEnd = 0;
  let lastBEnd = 0;

  for (const slot of slots) {
    const ah = slot.a !== null ? a.heights[slot.a] ?? 0 : 0;
    const bh = slot.b !== null ? b.heights[slot.b] ?? 0 : 0;
    const rowH = Math.max(ah, bh);

    if (slot.a !== null) {
      const end = a.ends[slot.a];
      const gap = rowH - ah;
      if (gap >= MIN_GAP_PX) aGap.set(end, (aGap.get(end) ?? 0) + gap);
      lastAEnd = end;
    } else if (rowH >= MIN_GAP_PX) {
      aGap.set(lastAEnd, (aGap.get(lastAEnd) ?? 0) + rowH);
    }

    if (slot.b !== null) {
      const end = b.ends[slot.b];
      const gap = rowH - bh;
      if (gap >= MIN_GAP_PX) bGap.set(end, (bGap.get(end) ?? 0) + gap);
      lastBEnd = end;
    } else if (rowH >= MIN_GAP_PX) {
      bGap.set(lastBEnd, (bGap.get(lastBEnd) ?? 0) + rowH);
    }
  }

  const toSpacers = (m: Map<number, number>): AlignSpacer[] =>
    [...m.entries()]
      .map(([pos, height]) => ({ pos, height: Math.round(height) }))
      .filter((s) => s.height > 0)
      .sort((x, y) => x.pos - y.pos);

  return { aSpacers: toSpacers(aGap), bSpacers: toSpacers(bGap) };
}

function measureBlocks(editor: Editor): BlockMetrics {
  const heights: number[] = [];
  const ends: number[] = [];
  editor.state.doc.forEach((node, pos) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    heights.push(dom?.offsetHeight ?? 0);
    ends.push(pos + node.nodeSize);
  });
  return { heights, ends };
}

function serialize(spacers: AlignSpacer[]): string {
  return spacers.map((s) => `${s.pos}:${s.height}`).join(",");
}

/**
 * WYSIWYG 比較で左右の対応ブロックの上端を揃える。
 * レンダリング後に左右ブロック高さを計測し、低い側にスペーサーを挿入する。
 * DOM 計測 → state 更新の循環は、変更検知ガード・適用中フラグ・rAF で防ぐ
 * （content ブロックのみ計測するためスペーサー追加では再トリガしない）。
 */
export function useBlockAlignment(
  sourceMode: boolean,
  rightEditor: Editor | null | undefined,
  leftEditor: Editor | null | undefined,
  enabled: boolean,
): void {
  useEffect(() => {
    const disabled = sourceMode || !enabled || !rightEditor || !leftEditor;
    if (disabled) {
      requestAnimationFrame(() => {
        if (rightEditor && !rightEditor.isDestroyed) rightEditor.commands.setAlignSpacers([]);
        if (leftEditor && !leftEditor.isDestroyed) leftEditor.commands.setAlignSpacers([]);
      });
      return;
    }

    let applying = false;
    let prevA = "";
    let prevB = "";
    let rafId = 0;

    const recompute = () => {
      if (applying || rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      // docA = rightEditor, docB = leftEditor（computeBlockDiff と同じ並び）
      const slots = computeBlockAlignment(rightEditor.state.doc, leftEditor.state.doc);
      const { aSpacers, bSpacers } = computeAlignSpacers(slots, measureBlocks(rightEditor), measureBlocks(leftEditor));
      const sigA = serialize(aSpacers);
      const sigB = serialize(bSpacers);
      if (sigA === prevA && sigB === prevB) return; // 変化なし → 再 dispatch しない（収束）
      prevA = sigA;
      prevB = sigB;
      applying = true;
      rightEditor.commands.setAlignSpacers(aSpacers);
      leftEditor.commands.setAlignSpacers(bSpacers);
      applying = false;
    };

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    };

    schedule();
    rightEditor.on("update", schedule);
    leftEditor.on("update", schedule);

    const ro = new ResizeObserver(schedule);
    ro.observe(rightEditor.view.dom);
    ro.observe(leftEditor.view.dom);

    return () => {
      cancelAnimationFrame(rafId);
      rightEditor.off("update", schedule);
      leftEditor.off("update", schedule);
      ro.disconnect();
      requestAnimationFrame(() => {
        if (!rightEditor.isDestroyed) rightEditor.commands.setAlignSpacers([]);
        if (!leftEditor.isDestroyed) leftEditor.commands.setAlignSpacers([]);
      });
    };
  }, [sourceMode, rightEditor, leftEditor, enabled]);
}
