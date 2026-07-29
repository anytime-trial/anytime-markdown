/**
 * 語・共起・クラスタに添えるメモ（設計書 §2.1・§2.2）。
 *
 * メモは要素の中へ埋め込まず、対象を添字で指す疎な配列に置く。共起はサイズ予算のため
 * タプルであり、第 5 要素という置き場所は「向きを省略した 3 要素の共起にはメモを付けられない」
 * という不整合を生む。3 種類の要素で持ち方が分かれると、検証・添字の付け替え・有無の判定が
 * 要素ごとに 3 通りへ分かれる。
 *
 * 本モジュールは `cooccurrenceFile` から import されるため、逆向きの import を持たない
 * （spec の型ではなく、メモだけを持つ構造的な型を受ける）。
 */

/** メモ 1 件。対象の添字と本文。 */
export type CooccurrenceNoteEntry = [index: number, text: string];

/** メモを付けられる対象の種別。値は `spec` の同名フィールドに対応する。 */
export type CooccurrenceNoteTarget = 'nodes' | 'links' | 'clusters';

export const COOCCURRENCE_NOTE_TARGETS: readonly CooccurrenceNoteTarget[] = ['nodes', 'links', 'clusters'];

export interface CooccurrenceNotes {
  nodes?: CooccurrenceNoteEntry[];
  links?: CooccurrenceNoteEntry[];
  clusters?: CooccurrenceNoteEntry[];
}

/**
 * メモ 1 件の上限（文字数。設計書 §2.3）。
 *
 * 上限が無いとメモだけでサイズ予算を超えるファイルを作れてしまい、予算が守っているもの
 * （読み込み時間とホストが扱えるドキュメントサイズ）が意味を失う。
 */
export const COOCCURRENCE_NOTE_MAX_LENGTH = 2000;

/** メモを持つ最小限の構造。`CooccurrenceFile['spec']` はこれを満たす。 */
export interface WithCooccurrenceNotes {
  notes?: CooccurrenceNotes;
}

export function readCooccurrenceNote(
  spec: WithCooccurrenceNotes,
  target: CooccurrenceNoteTarget,
  index: number,
): string | undefined {
  return spec.notes?.[target]?.find((entry) => entry[0] === index)?.[1];
}

/**
 * メモを持つ対象の添字。図の印と一覧の印が同じ根拠を見るための入口。
 */
export function noteBearingIndexes(
  spec: WithCooccurrenceNotes,
  target: CooccurrenceNoteTarget,
): ReadonlySet<number> {
  return new Set((spec.notes?.[target] ?? []).map((entry) => entry[0]));
}

export function hasAnyCooccurrenceNote(spec: WithCooccurrenceNotes): boolean {
  return COOCCURRENCE_NOTE_TARGETS.some((target) => (spec.notes?.[target]?.length ?? 0) > 0);
}

/**
 * 空になった配列とオブジェクトを落とす。
 *
 * メモを 1 件も持たないファイルでは `spec.notes` 自体を書かない（設計書 §2.2）。空の器を
 * 残すと、メモを一度でも付けて消したファイルだけが `"notes":{}` を持つことになり、
 * 版数の導出と往復一致の判定が「内容は同じなのに表現が違う」状態で揺れる。
 */
function compactNotes(notes: CooccurrenceNotes): CooccurrenceNotes | undefined {
  const compacted: CooccurrenceNotes = {};
  for (const target of COOCCURRENCE_NOTE_TARGETS) {
    const entries = notes[target];
    if (entries !== undefined && entries.length > 0) compacted[target] = entries;
  }
  return COOCCURRENCE_NOTE_TARGETS.some((target) => compacted[target] !== undefined) ? compacted : undefined;
}

export function cloneCooccurrenceNotes(notes: CooccurrenceNotes | undefined): CooccurrenceNotes | undefined {
  if (notes === undefined) return undefined;
  const cloned: CooccurrenceNotes = {};
  for (const target of COOCCURRENCE_NOTE_TARGETS) {
    const entries = notes[target];
    if (entries !== undefined) cloned[target] = entries.map((entry) => [entry[0], entry[1]]);
  }
  return compactNotes(cloned);
}

/**
 * メモを設定した `notes` を返す（引数は変更しない）。本文の検証は呼び出し側が行う。
 */
export function withCooccurrenceNote(
  notes: CooccurrenceNotes | undefined,
  target: CooccurrenceNoteTarget,
  index: number,
  text: string,
): CooccurrenceNotes {
  const cloned = cloneCooccurrenceNotes(notes) ?? {};
  const entries = (cloned[target] ?? []).filter((entry) => entry[0] !== index);
  entries.push([index, text]);
  entries.sort((a, b) => a[0] - b[0]);
  cloned[target] = entries;
  return cloned;
}

export function withoutCooccurrenceNote(
  notes: CooccurrenceNotes | undefined,
  target: CooccurrenceNoteTarget,
  index: number,
): CooccurrenceNotes | undefined {
  const cloned = cloneCooccurrenceNotes(notes);
  if (cloned === undefined) return undefined;
  const entries = cloned[target];
  if (entries === undefined) return cloned;
  cloned[target] = entries.filter((entry) => entry[0] !== index);
  return compactNotes(cloned);
}

/**
 * 対象の削除に伴ってメモの添字を付け替える。
 *
 * `remap` が `undefined` を返した対象のメモは落とす（対象の無いメモを残さない。設計書 §3.3）。
 * 付け替えを忘れると、型もテストも通ったまま「別の要素のメモが表示される」形でしか現れない。
 */
export function remapCooccurrenceNotes(
  notes: CooccurrenceNotes | undefined,
  target: CooccurrenceNoteTarget,
  remap: (index: number) => number | undefined,
): CooccurrenceNotes | undefined {
  const cloned = cloneCooccurrenceNotes(notes);
  if (cloned === undefined) return undefined;
  const entries = cloned[target];
  if (entries === undefined) return cloned;
  cloned[target] = entries.flatMap((entry) => {
    const mapped = remap(entry[0]);
    return mapped === undefined ? [] : [[mapped, entry[1]] as CooccurrenceNoteEntry];
  });
  cloned[target].sort((a, b) => a[0] - b[0]);
  return compactNotes(cloned);
}
