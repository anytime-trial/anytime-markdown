import type { AlignSpacer } from "../extensions/blockAlignSpacers";
import type { AlignedSlot } from "../utils/blockDiffComputation";

/** 高さ差がこの px 未満なら無視（微小揺れによるループ・チラつき防止） */
const MIN_GAP_PX = 1;

interface BlockMetrics {
  heights: number[];
  ends: number[];
}

/** 片側の空き集計（pos → 追加する空き高さ）と、直前に確定したブロック終端 */
interface SideGapState {
  gap: Map<number, number>;
  lastEnd: number;
}

/** slot が指す片側ブロックの状況（index が null なら対応ブロック無し） */
interface SideSlotMetrics {
  index: number | null;
  height: number;
  ends: number[];
}

/**
 * 1 slot ぶんの空きを片側へ積む。
 * 対応ブロックがあれば行高との差分をそのブロック終端へ、
 * 無ければ（挿入/削除）直前ブロック終端へ行高ぶんを積む。
 */
function accumulateSideGap(
  side: SideGapState,
  metrics: SideSlotMetrics,
  rowH: number,
): void {
  if (metrics.index !== null) {
    const end = metrics.ends[metrics.index];
    const gap = rowH - metrics.height;
    if (gap >= MIN_GAP_PX) side.gap.set(end, (side.gap.get(end) ?? 0) + gap);
    side.lastEnd = end;
  } else if (rowH >= MIN_GAP_PX) {
    side.gap.set(side.lastEnd, (side.gap.get(side.lastEnd) ?? 0) + rowH);
  }
}

/** 空き集計を pos 昇順のスペーサー配列へ変換する（高さ 0 は捨てる） */
function toSpacers(m: Map<number, number>): AlignSpacer[] {
  return [...m.entries()]
    .map(([pos, height]) => ({ pos, height: Math.round(height) }))
    .filter((s) => s.height > 0)
    .sort((x, y) => x.pos - y.pos);
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
  const aSide: SideGapState = { gap: new Map<number, number>(), lastEnd: 0 };
  const bSide: SideGapState = { gap: new Map<number, number>(), lastEnd: 0 };

  for (const slot of slots) {
    const ah = slot.a !== null ? a.heights[slot.a] ?? 0 : 0;
    const bh = slot.b !== null ? b.heights[slot.b] ?? 0 : 0;
    const rowH = Math.max(ah, bh);

    accumulateSideGap(aSide, { index: slot.a, height: ah, ends: a.ends }, rowH);
    accumulateSideGap(bSide, { index: slot.b, height: bh, ends: b.ends }, rowH);
  }

  return { aSpacers: toSpacers(aSide.gap), bSpacers: toSpacers(bSide.gap) };
}
