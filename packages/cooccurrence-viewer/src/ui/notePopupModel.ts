import { readCooccurrenceNote, readLink, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { NotePopupState } from '../types';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { directionSymbol } from './linkListModel';

/**
 * ホバーの対象からポップアップの中身を組み立てる（設計書 §3.1）。
 *
 * Why not mount の中で組み立てるか: 「隣の語のメモを出す」取り違えは、対象と本文の対応を
 * 外から読めないと検査できない。対応を決める場所を純関数へ出し、観測点（`getNotePopupState`）が
 * 返す値と同じものをテストが直接作れるようにする。
 *
 * メモが無い対象でも state を返す。応答の有無をメモの有無で変えると、利用者は「反応しない＝
 * ホバーが効いていない」と読み、メモの不在を確かめられない。
 */
export function nodePopupState(file: CooccurrenceFile, nodeIndex: number, t: CooccurrenceT): NotePopupState | null {
  const node = file.spec.nodes[nodeIndex];
  if (node === undefined) return null;
  const cooccurrenceCount = file.spec.links.reduce((count, link) => {
    const view = readLink(link);
    return view.source === nodeIndex || view.target === nodeIndex ? count + 1 : count;
  }, 0);
  return {
    kind: 'node',
    index: nodeIndex,
    title: node.label,
    details: [
      t('note.frequency', { value: node.frequency }),
      t('note.cooccurrences', { value: cooccurrenceCount }),
    ],
    ...noteOf(file, 'nodes', nodeIndex),
  };
}

export function linkPopupState(file: CooccurrenceFile, linkIndex: number, t: CooccurrenceT): NotePopupState | null {
  const link = file.spec.links[linkIndex];
  if (link === undefined) return null;
  const view = readLink(link);
  const source = file.spec.nodes[view.source]?.label ?? '';
  const target = file.spec.nodes[view.target]?.label ?? '';
  return {
    kind: 'link',
    index: linkIndex,
    title: `${source} ${directionSymbol(view.direction)} ${target}`,
    details: [t('note.strength', { value: view.strength })],
    ...noteOf(file, 'links', linkIndex),
  };
}

export function clusterPopupState(
  file: CooccurrenceFile,
  clusterIndex: number,
  t: CooccurrenceT,
): NotePopupState | null {
  const cluster = file.spec.clusters?.[clusterIndex];
  if (cluster === undefined) return null;
  return {
    kind: 'cluster',
    index: clusterIndex,
    title: cluster.label,
    details: [t('note.clusterMembers', { value: cluster.members.length })],
    ...noteOf(file, 'clusters', clusterIndex),
  };
}

/**
 * メモを持たないときは `note` を持たせない（`note: undefined` を書かない）。
 *
 * ポップアップ側は `note === undefined` で本文の行そのものを出さないため、常に鍵を持たせると
 * 「空のメモ欄が出る」か「有無の判定が 2 箇所に分かれる」のどちらかになる。
 */
function noteOf(
  file: CooccurrenceFile,
  target: 'nodes' | 'links' | 'clusters',
  index: number,
): { note?: string } {
  const note = readCooccurrenceNote(file.spec, target, index);
  return note === undefined ? {} : { note };
}

/** ポップアップを置く位置を決めるための入力。すべて `container` の左上を原点とする。 */
export interface NotePopupPlacement {
  anchor: { x: number; y: number };
  size: { width: number; height: number };
  bounds: { width: number; height: number };
  /** 対象からの逃がし幅。カーソルの直下に出すと、ポインタ自身が本文の先頭を覆う。 */
  offset: number;
  /** 表示領域の縁との最小の間隔。 */
  margin: number;
}

/**
 * ポップアップを表示領域の内側へ収める（設計書 §3.1）。
 *
 * はみ出す側では反対側へ折り返し、折り返してもなお入らない（ポップアップのほうが領域より
 * 大きい）場合は縁に寄せる。
 *
 * Why not DOM のハンドラへ直接書くか: 上下左右 4 方向 ×「折り返す／折り返しても入らない」の
 * 組み合わせは取り違えやすく、DOM の中に埋めると jsdom では要素の寸法が 0 になるため検査
 * できない。実際、canvas 描画から DOM へ移したときに上限のクランプが落ち、図の右下端の語で
 * ポップアップが切れる退行が入った（マージ前レビューで検出）。境界を純関数へ出して固定する。
 */
export function placeNotePopup(placement: NotePopupPlacement): { left: number; top: number } {
  const { anchor, size, bounds, offset, margin } = placement;
  return {
    left: clampToBounds(anchor.x, size.width, bounds.width, offset, margin),
    top: clampToBounds(anchor.y, size.height, bounds.height, offset, margin),
  };
}

function clampToBounds(
  anchor: number,
  size: number,
  bound: number,
  offset: number,
  margin: number,
): number {
  const after = anchor + offset;
  const flipped = after + size > bound - margin ? anchor - offset - size : after;
  // 下限を先に決めてから上限で切る。順序を逆にすると、領域より大きいポップアップで
  // 「下端に合わせた結果、上端が切れて先頭が読めない」ほうを選んでしまう。
  const max = Math.max(margin, bound - margin - size);
  return Math.min(max, Math.max(margin, flipped));
}
