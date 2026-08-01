import type { AlignSpacer } from "../extensions/blockAlignSpacers";
import type { AlignedSlot } from "../utils/blockDiffComputation";

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
