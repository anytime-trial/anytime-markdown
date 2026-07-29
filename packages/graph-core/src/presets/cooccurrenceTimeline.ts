/**
 * 時間軸（設計書 §2.2・§3.6）。
 *
 * スライスは語と共起の集合を持たず、`spec.nodes` と `spec.links` を添字で指す。両者は全期間の
 * 和集合であり、スライスは「そのうちどれが、どの値で存在したか」だけを持つ。レイヤー間の点線は
 * 「同じ語」を結ぶ線であり、同一性が添字で決まっていれば自明に引ける。スライスごとに語の集合を
 * 持たせると、この対応づけが失われ、語名での再照合という新たな仕様が要る。
 *
 * 値はメモ（`cooccurrenceNotes`）と同じ疎な `[添字, 値]` の配列に置く。「その配列に現れない
 * 対象は、そのスライスに存在しない」という規則が 1 種類で済み、削除時の添字の付け替えも同じ形で
 * 書ける。不在を 0 という値で表さないのは、「値が 0 の語」と「存在しない語」が同じ表現になり、
 * 検証が値の意味に依存しはじめるためである。
 *
 * 本モジュールは `cooccurrenceFile` から import されるため、逆向きの import を持たない
 * （spec の型ではなく、時間軸だけを持つ構造的な型を受ける）。
 */

/** スライスごとの値 1 件。対象の添字と値。 */
export type CooccurrenceSliceEntry = [index: number, value: number];

/** スライス別の値を持てる対象の種別。値は `spec` の同名フィールドに対応する。 */
export type CooccurrenceSliceTarget = 'nodes' | 'links';

export const COOCCURRENCE_SLICE_TARGETS: readonly CooccurrenceSliceTarget[] = ['nodes', 'links'];

/** 1 つの時点・期間。配列の順序が時間順で、添字がスライスの識別子。 */
export interface CooccurrenceSlice {
  label: string;
  /** ISO 8601 の日付。省略できる（順序だけで時間を表す図のため）。 */
  at?: string;
}

export interface CooccurrenceTimeline {
  slices: CooccurrenceSlice[];
  /** slices と同じ順序・同じ長さ。添字は `spec.nodes` を指す。 */
  nodes: CooccurrenceSliceEntry[][];
  /** slices と同じ順序・同じ長さ。添字は `spec.links` を指す。 */
  links: CooccurrenceSliceEntry[][];
}

/**
 * スライス上の 1 つの値を指す。
 *
 * Why not `(target, slice, index)` の 3 引数か: `slice` と `index` はどちらも整数であり、
 * 取り違えても型は通る。取り違えは「別のスライスの別の語の値を読む」形でしか現れない。
 */
export interface CooccurrenceSliceRef {
  target: CooccurrenceSliceTarget;
  slice: number;
  index: number;
}

/**
 * スライス数の上限（設計書 §2.3）。レイヤーを 24 枚並べた時点で、1 枚あたりの表示面積が
 * 語を読める大きさを下回る。
 */
export const COOCCURRENCE_SLICE_MAX = 24;

/**
 * 全スライスの延べエントリ数の上限（設計書 §2.3）。
 *
 * Why not スライス数だけを制限するか: 1,000 語 × 3,000 共起の図に 12 スライスを与え、全てが
 * 全スライスに存在すれば延べ 48,000 エントリ（約 528KB）になり、スライス数の上限は素通りする。
 * 制限すべきなのは枚数ではなく、書き込まれる値の総数である。
 */
export const COOCCURRENCE_SLICE_ENTRY_MAX = 8000;

/** 時間軸を持つ最小限の構造。`CooccurrenceFile['spec']` はこれを満たす。 */
export interface WithCooccurrenceTimeline {
  timeline?: CooccurrenceTimeline;
}

/**
 * 全体値の丸めと突合に使う桁数。
 *
 * 強度は小数であり、合計は浮動小数の誤差を持つ（0.9 + 0.4 = 1.3000000000000003）。丸めずに
 * 書き出すと、書き出すたびに末尾の桁が揺れるファイルになる。
 */
const TOTAL_PRECISION = 1e6;

export function roundCooccurrenceTotal(value: number): number {
  return Math.round(value * TOTAL_PRECISION) / TOTAL_PRECISION;
}

export function hasCooccurrenceTimeline(spec: WithCooccurrenceTimeline): boolean {
  return (spec.timeline?.slices.length ?? 0) > 0;
}

export function cooccurrenceSliceCount(spec: WithCooccurrenceTimeline): number {
  return spec.timeline?.slices.length ?? 0;
}

export function readCooccurrenceSliceValue(
  spec: WithCooccurrenceTimeline,
  ref: CooccurrenceSliceRef,
): number | undefined {
  return spec.timeline?.[ref.target][ref.slice]?.find((entry) => entry[0] === ref.index)?.[1];
}

/** そのスライスに存在する対象の添字。描画がレイヤーごとの表示対象を決める入口。 */
export function sliceBearingIndexes(
  spec: WithCooccurrenceTimeline,
  target: CooccurrenceSliceTarget,
  sliceIndex: number,
): ReadonlySet<number> {
  return new Set((spec.timeline?.[target][sliceIndex] ?? []).map((entry) => entry[0]));
}

/** 全スライスの語と共起のエントリ数の合計（サイズ予算の基準。設計書 §2.3）。 */
export function cooccurrenceSliceEntryCount(timeline: CooccurrenceTimeline | undefined): number {
  if (timeline === undefined) return 0;
  let count = 0;
  for (const target of COOCCURRENCE_SLICE_TARGETS) {
    for (const entries of timeline[target]) count += entries.length;
  }
  return count;
}

/** ある対象の全体値。スライス値の合計（設計書 §2.2）。 */
export function totalCooccurrenceSliceValue(
  timeline: CooccurrenceTimeline,
  target: CooccurrenceSliceTarget,
  index: number,
): number {
  let total = 0;
  for (const entries of timeline[target]) {
    for (const entry of entries) {
      if (entry[0] === index) total += entry[1];
    }
  }
  return roundCooccurrenceTotal(total);
}

function copySlice(slice: CooccurrenceSlice): CooccurrenceSlice {
  return slice.at === undefined ? { label: slice.label } : { label: slice.label, at: slice.at };
}

function copyEntries(entries: readonly CooccurrenceSliceEntry[]): CooccurrenceSliceEntry[] {
  return entries.map((entry): CooccurrenceSliceEntry => [entry[0], entry[1]]);
}

function copyTimeline(timeline: CooccurrenceTimeline): CooccurrenceTimeline {
  return {
    slices: timeline.slices.map(copySlice),
    nodes: timeline.nodes.map(copyEntries),
    links: timeline.links.map(copyEntries),
  };
}

/**
 * 複製する。スライスを 1 つも持たなければ `undefined` を返す。
 *
 * 空の器（`"timeline":{"slices":[],...}`）を残さないのは、メモと同じ理由による。一度スライスを
 * 作って消したファイルだけが空の器を持つことになり、版数の導出と往復一致の判定が「内容は同じなのに
 * 表現が違う」状態で揺れる（設計書 §2.2）。
 */
export function cloneCooccurrenceTimeline(
  timeline: CooccurrenceTimeline | undefined,
): CooccurrenceTimeline | undefined {
  if (timeline === undefined || timeline.slices.length === 0) return undefined;
  return copyTimeline(timeline);
}

export function withCooccurrenceSliceValue(
  timeline: CooccurrenceTimeline,
  ref: CooccurrenceSliceRef,
  value: number,
): CooccurrenceTimeline {
  const next = copyTimeline(timeline);
  const entries = (next[ref.target][ref.slice] ?? []).filter((entry) => entry[0] !== ref.index);
  entries.push([ref.index, value]);
  entries.sort((a, b) => a[0] - b[0]);
  next[ref.target][ref.slice] = entries;
  return next;
}

export function withoutCooccurrenceSliceValue(
  timeline: CooccurrenceTimeline,
  ref: CooccurrenceSliceRef,
): CooccurrenceTimeline {
  const next = copyTimeline(timeline);
  const entries = next[ref.target][ref.slice];
  if (entries === undefined) return next;
  next[ref.target][ref.slice] = entries.filter((entry) => entry[0] !== ref.index);
  return next;
}

/**
 * 対象の削除に伴ってスライスの添字を付け替える。
 *
 * `remap` が `undefined` を返した対象のエントリは落とす。付け替えを忘れると、型もテストも通った
 * まま「別の語の値がそのレイヤーに出る」形でしか現れない（設計書 §3.3）。
 */
export function remapCooccurrenceTimeline(
  timeline: CooccurrenceTimeline | undefined,
  target: CooccurrenceSliceTarget,
  remap: (index: number) => number | undefined,
): CooccurrenceTimeline | undefined {
  const next = cloneCooccurrenceTimeline(timeline);
  if (next === undefined) return undefined;
  next[target] = next[target].map((entries) =>
    entries
      .flatMap((entry) => {
        const mapped = remap(entry[0]);
        return mapped === undefined ? [] : [[mapped, entry[1]] as CooccurrenceSliceEntry];
      })
      .sort((a, b) => a[0] - b[0]),
  );
  return next;
}

/** スライスを末尾へ足す。`seeded` はそのスライスの初期エントリ。 */
export function appendCooccurrenceSlice(
  timeline: CooccurrenceTimeline | undefined,
  slice: CooccurrenceSlice,
  seeded: { nodes: CooccurrenceSliceEntry[]; links: CooccurrenceSliceEntry[] },
): CooccurrenceTimeline {
  const base = timeline === undefined ? { slices: [], nodes: [], links: [] } : copyTimeline(timeline);
  base.slices.push(copySlice(slice));
  base.nodes.push(copyEntries(seeded.nodes));
  base.links.push(copyEntries(seeded.links));
  return base;
}

/** スライスを 1 枚落とす。最後の 1 枚を落とすと時間軸そのものが消える。 */
export function dropCooccurrenceSlice(
  timeline: CooccurrenceTimeline,
  sliceIndex: number,
): CooccurrenceTimeline | undefined {
  const next: CooccurrenceTimeline = {
    slices: timeline.slices.filter((_, index) => index !== sliceIndex).map(copySlice),
    nodes: timeline.nodes.filter((_, index) => index !== sliceIndex).map(copyEntries),
    links: timeline.links.filter((_, index) => index !== sliceIndex).map(copyEntries),
  };
  return next.slices.length === 0 ? undefined : next;
}

/** スライスのラベルと日付を差し替える。値は動かさない。 */
export function renamedCooccurrenceSlice(
  timeline: CooccurrenceTimeline,
  sliceIndex: number,
  slice: CooccurrenceSlice,
): CooccurrenceTimeline {
  const next = copyTimeline(timeline);
  next.slices[sliceIndex] = copySlice(slice);
  return next;
}

/** スライスを並べ替える。スライスと値を同時に動かす。 */
export function reorderCooccurrenceSlice(
  timeline: CooccurrenceTimeline,
  from: number,
  to: number,
): CooccurrenceTimeline {
  const next = copyTimeline(timeline);
  const move = <T>(items: T[]): T[] => {
    const moved = [...items];
    const [taken] = moved.splice(from, 1);
    moved.splice(to, 0, taken);
    return moved;
  };
  return { slices: move(next.slices), nodes: move(next.nodes), links: move(next.links) };
}

/**
 * ISO 8601 の日付として解釈する。解釈できなければ `undefined`。
 *
 * Why not `Date.parse` だけで判定するか: `Date.parse` は実装依存の緩い形式（`"March 5"` 等）も
 * 受け、環境によって受理と拒否が分かれる。書式を先に固定してから値へ落とす。
 */
export function cooccurrenceSliceDateValue(at: string): number | undefined {
  if (!/^\d{4}(-\d{2}){0,2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(at)) return undefined;
  const value = Date.parse(at);
  return Number.isFinite(value) ? value : undefined;
}
