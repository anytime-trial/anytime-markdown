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
