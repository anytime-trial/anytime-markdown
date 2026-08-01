import type { AlignedSlot } from "./blockDiffComputation";

/** スクロール要素内でのトップレベルブロックの位置・高さ */
export interface BlockOffset {
  /** トップレベルブロック index（doc 順） */
  index: number;
  /** スクロール要素内での上端（scrollTop 基準の絶対 px） */
  top: number;
  /** ブロックの表示高さ px */
  height: number;
}

/** AlignedSlot[] から各 side のブロック index → slot index 逆引きマップを作る */
export function buildSlotMaps(slots: AlignedSlot[]): {
  aToSlot: Map<number, number>;
  bToSlot: Map<number, number>;
} {
  const aToSlot = new Map<number, number>();
  const bToSlot = new Map<number, number>();
  slots.forEach((slot, i) => {
    if (slot.a !== null) aToSlot.set(slot.a, i);
    if (slot.b !== null) bToSlot.set(slot.b, i);
  });
  return { aToSlot, bToSlot };
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** offset 列（index 昇順）から index → BlockOffset を引くマップ */
function byIndex(map: BlockOffset[]): Map<number, BlockOffset> {
  const m = new Map<number, BlockOffset>();
  for (const o of map) m.set(o.index, o);
  return m;
}

/** scrollTop を含む（top <= scrollTop の最後の）ブロックを二分探索で返す */
function findContainingBlock(map: BlockOffset[], scrollTop: number): BlockOffset {
  let lo = 0;
  let hi = map.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid].top <= scrollTop) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return map[found];
}

interface ComputeParams {
  leaderScrollTop: number;
  /** index 昇順・top 昇順 */
  leaderMap: BlockOffset[];
  followerMap: BlockOffset[];
  slots: AlignedSlot[];
  leaderSide: "a" | "b";
  followerMaxScroll: number;
}

/**
 * リードペインの scrollTop から追従ペインの scrollTop を算出する純粋関数。
 *
 * 1. リードの可視先頭ブロックを二分探索で特定し、ブロック内の位置 fraction を求める。
 * 2. slot で対応ブロックを引く。対応があれば follower.top + fraction * follower.height。
 * 3. 対応なし（挿入/削除のみ slot）は直近の対応済みブロックへアンカーし、未対応区間は
 *    1:1 ピクセル送りでフォールバックする。
 * 4. 追従側 maxScroll で clamp する。
 */
export function computeFollowerScrollTop(params: ComputeParams): number {
  const { leaderScrollTop, leaderMap, followerMap, slots, leaderSide, followerMaxScroll } = params;
  if (slots.length === 0 || leaderMap.length === 0 || followerMap.length === 0) return 0;

  const { aToSlot, bToSlot } = buildSlotMaps(slots);
  const leaderToSlot = leaderSide === "a" ? aToSlot : bToSlot;
  const followerByIndex = byIndex(followerMap);
  const leaderByIndex = byIndex(leaderMap);

  const leaderBlock = findContainingBlock(leaderMap, leaderScrollTop);
  const fraction = leaderBlock.height > 0 ? (leaderScrollTop - leaderBlock.top) / leaderBlock.height : 0;

  const slotIndex = leaderToSlot.get(leaderBlock.index);
  const slot = slotIndex !== undefined ? slots[slotIndex] : undefined;
  const counterpartIndex = slot ? (leaderSide === "a" ? slot.b : slot.a) : null;

  let followerTop: number;
  if (counterpartIndex !== null && counterpartIndex !== undefined) {
    const followerBlock = followerByIndex.get(counterpartIndex);
    followerTop = followerBlock ? followerBlock.top + fraction * followerBlock.height : leaderScrollTop;
  } else {
    // 未対応ブロック: 直近で左右両方を持つ slot をアンカーに 1:1 ピクセル送り
    followerTop = resolveUnpairedFollowerTop({
      slots,
      slotIndex,
      leaderSide,
      leaderScrollTop,
      leaderByIndex,
      followerByIndex,
    });
  }

  return clamp(followerTop, 0, followerMaxScroll);
}

function resolveUnpairedFollowerTop(args: {
  slots: AlignedSlot[];
  slotIndex: number | undefined;
  leaderSide: "a" | "b";
  leaderScrollTop: number;
  leaderByIndex: Map<number, BlockOffset>;
  followerByIndex: Map<number, BlockOffset>;
}): number {
  const { slots, slotIndex, leaderSide, leaderScrollTop, leaderByIndex, followerByIndex } = args;
  const start = slotIndex !== undefined ? slotIndex - 1 : slots.length - 1;
  for (let i = start; i >= 0; i--) {
    const s = slots[i];
    const leaderIdx = leaderSide === "a" ? s.a : s.b;
    const followerIdx = leaderSide === "a" ? s.b : s.a;
    if (leaderIdx === null || followerIdx === null) continue;
    const anchorLeader = leaderByIndex.get(leaderIdx);
    const anchorFollower = followerByIndex.get(followerIdx);
    if (!anchorLeader || !anchorFollower) continue;
    const leaderEnd = anchorLeader.top + anchorLeader.height;
    const followerEnd = anchorFollower.top + anchorFollower.height;
    return followerEnd + (leaderScrollTop - leaderEnd);
  }
  // 上方にアンカーが無い（先頭が未対応ブロック）→ 1:1 でそのまま
  return leaderScrollTop;
}
