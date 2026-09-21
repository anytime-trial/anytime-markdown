import type { ChartNode } from '../layout';
import type { DiagramDocument, DiagramPlacement } from '../types';
import { cellKey } from '../spacing';
import type { GridCell } from '../grid';

/** 検査用の節。升目の番号だけを使う関数を測るので、px は 0 のままでよい。 */
export const node = (name: string, column: number, row: number): ChartNode => ({ name, column, row, x: 0, y: 0 });

export const cellOf = (item: { readonly column: number; readonly row: number }): GridCell =>
  ({ column: item.column, row: item.row });

export const occupancy = (...cells: readonly GridCell[]): ReadonlySet<string> => new Set(cells.map(cellKey));

/** 自動配置の升目。挿入・削除は「動かした先が自動配置と同じなら固定を解く」ためにこれを読む。 */
export const homes = (nodes: readonly ChartNode[]): ReadonlyMap<string, GridCell> =>
  new Map(nodes.map((item) => [item.name, cellOf(item)]));

/** 配置差分を当てた節の一覧。挿入 → 削除で元の升目へ戻るかを測るのに要る。 */
export const applied = (
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
): readonly ChartNode[] => nodes.map((item) => ({ ...item, ...(placements[item.name] ?? {}) }));

/**
 * 検査用の系図。3 世代・配偶あり・生成（片親）あり・独立した系統ありを最小で満たす。
 *
 * 移植元（古事記 162 名）の代わりに置く。件数の凍結ではなく**規則**を測るので、規則ごとに
 * 効く最小の形が要る — 大きなデータで測ると、どの規則が効いて座標が決まったのか分からない。
 */
export const SAMPLE: DiagramDocument = {
  version: 1,
  title: '検査用の系図',
  lead: '導入文',
  note: '末尾の注記',
  legend: '実線は親子、点線は生成、破線は婚姻。',
  groups: [
    { id: 'volume', label: '巻', values: { one: '上巻', two: '中巻' } },
  ],
  families: [
    { parents: ['祖父', '祖母'], children: ['父', '叔父'], kind: 'birth', groups: { volume: 'one' } },
    { parents: ['父', '母'], children: ['子', '妹'], kind: 'birth', groups: { volume: 'two' } },
    { parents: ['独神'], children: ['化生'], kind: 'creation', groups: { volume: 'one' } },
  ],
  nodes: [],
  shapes: {},
  connectors: [],
  annotations: { 独神: '独りで成った神' },
  layout: { placements: {} },
};
