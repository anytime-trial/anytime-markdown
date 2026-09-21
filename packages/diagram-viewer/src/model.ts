/**
 * 図を描くのに要る値の導出。DOM を触らないので、node 環境の検査から直接測れる。
 *
 * 自動配置（人物数ぶんの並べ替え）と、刻み・差分の適用（人物数ぶんの写像）を**分けて**受ける。
 * ドラッグは指を動かすたびに走るので、並べ替えまでやり直すと図が追随しない。
 *
 * 移植元は anytime-travel の `src/screens/Genealogy.tsx` の `useMemo` 群。
 */

import {
  DEFAULT_DIAGRAM_SPACING,
  EMPTY_DIAGRAM_LAYOUT,
  MAX_PLACEMENTS_PER_DIAGRAM,
  applyDiagramPlacements,
  applyDiagramSpacing,
  cellKey,
  cellLimit,
  columnPitch,
  familyConnector,
  freeCellsPath,
  gridBounds,
  layoutDiagram,
  paintableExtent,
  rowPitch,
  type AutomaticChart,
  type ChartNode,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramLayout,
  type DiagramSpacing,
  type GridCell,
  type GridExtent,
  type PlacedChart,
} from '@anytime-markdown/diagram-core';

export interface FamilyConnector {
  readonly family: DiagramFamily;
  readonly junction: { readonly x: number; readonly y: number };
  readonly marriage: string | null;
  readonly descent: string | null;
  readonly points: readonly { readonly x: number; readonly y: number; readonly kind: string }[];
}

/**
 * 行・列を丸ごとずらせる図か、と**人物の居る列・行**。図の縁のアイコンを描くのに要る。
 *
 * 挿入・削除の可否は本来 `gridLineEdits` が位置ごとに決めるが、縁のアイコンは列と行の数だけ
 * 並ぶ。位置ごとに人物数ぶんの差分を組み立てると、ドラッグの 1 フレームごとにそれを全部やり直す
 * ことになる。そこで**どの位置でも成り立つ条件**だけをここで 1 度測り、位置ごとの本当の判定は
 * 押した瞬間に `gridLineEdits` が行う。
 */
export interface GridLines {
  readonly columns: ReadonlySet<number>;
  readonly rows: ReadonlySet<number>;
  /** いちばん後ろの人物が居る列・行。これより先に ＋ を出しても 1 升も動かない。 */
  readonly last: GridCell;
  readonly shiftable: boolean;
}

export interface DiagramModel {
  readonly chart: PlacedChart;
  readonly byName: ReadonlyMap<string, ChartNode>;
  readonly spacing: DiagramSpacing;
  readonly placements: Readonly<Record<string, { readonly column: number; readonly row: number }>>;
  readonly connectors: readonly FamilyConnector[];
  readonly extent: GridExtent;
  /** 図の枠の大きさ。編集中は升目の広がりを下回らない。 */
  readonly surface: { readonly width: number; readonly height: number };
  /** いま人物が載っている升目 → その人物。空いている升目だけを塗るための母集合。 */
  readonly occupants: ReadonlyMap<string, string>;
  readonly occupied: ReadonlySet<string>;
  /** 空いた升目の塗り。編集中だけ組み立てる。 */
  readonly freeCells: string;
  /** 箱の大きさを掴める人物（左上の 1 人）。 */
  readonly resizeAnchor: string;
  readonly lines: GridLines;
  /** 保存済みと下書きが違うか。 */
  readonly changed: boolean;
}

/**
 * 自動配置の記憶。`document` が同じなら並べ替えをやり直さない。
 *
 * 記憶を持たないと、指を動かすたびに人物数ぶんの並べ替えが走る。
 */
export function createAutomaticCache(): (document: DiagramDocument) => AutomaticChart {
  let key: DiagramDocument | null = null;
  let value: AutomaticChart | null = null;
  return (document) => {
    if (key === document && value !== null) return value;
    key = document;
    value = layoutDiagram(document.families);
    return value;
  };
}

export interface DeriveOptions {
  readonly document: DiagramDocument;
  /** 編集中の下書き。`null` は編集していない状態。 */
  readonly draft: DiagramLayout | null;
  readonly automatic: AutomaticChart;
}

export function deriveModel({ document, draft, automatic }: DeriveOptions): DiagramModel {
  const saved = document.layout ?? EMPTY_DIAGRAM_LAYOUT;
  const editing = draft !== null;
  const source = draft ?? saved;
  const placements = source.placements;
  const spacing = source.spacing ?? DEFAULT_DIAGRAM_SPACING;
  const chart = applyDiagramPlacements(applyDiagramSpacing(automatic, spacing), { placements, spacing });
  const byName = new Map(chart.nodes.map((node) => [node.name, node]));

  let anchor: ChartNode | undefined;
  for (const node of chart.nodes) {
    if (anchor === undefined || node.column < anchor.column
      || (node.column === anchor.column && node.row < anchor.row)) anchor = node;
  }

  const laneByColumn = new Map<number, number>();
  const connectors: FamilyConnector[] = document.families.map((family) => {
    const parentColumn = Math.min(...family.parents.map((parent) => byName.get(parent)!.x));
    const lane = laneByColumn.get(parentColumn) ?? 0;
    laneByColumn.set(parentColumn, lane + 1);
    return { ...familyConnector(family, byName, { lane, spacing }), family };
  });

  const extent = paintableExtent(chart.nodes, [...chart.automatic.values()]);
  const surface = editing
    ? (() => {
      const bounds = gridBounds(spacing, extent);
      return { width: Math.max(chart.width, bounds.width), height: Math.max(chart.height, bounds.height) };
    })()
    : { width: chart.width, height: chart.height };

  // 集合でなく対応にするのは、**同じ升目に 2 人来たとき**に 1 件へ畳まないため。畳むと、掴んだ
  // 人物の升目を除くだけでもう 1 人の居る升目が空きに見え、そこへ重ねられてしまう。
  const occupants = new Map<string, string>();
  for (const node of chart.nodes) {
    const key = cellKey({ column: node.column, row: node.row });
    if (!occupants.has(key)) occupants.set(key, node.name);
  }
  const occupied = new Set(occupants.keys());

  return {
    chart,
    byName,
    spacing,
    placements,
    connectors,
    extent,
    surface,
    occupants,
    occupied,
    freeCells: editing ? freeCellsPath(spacing, extent, occupied) : '',
    resizeAnchor: anchor?.name ?? '',
    lines: deriveGridLines(chart, placements, byName, spacing),
    changed: draft !== null && layoutKey(draft) !== layoutKey(saved),
  };
}

function deriveGridLines(
  chart: PlacedChart,
  placements: Readonly<Record<string, { readonly column: number; readonly row: number }>>,
  byName: ReadonlyMap<string, ChartNode>,
  spacing: DiagramSpacing,
): GridLines {
  const columns = new Set<number>();
  const rows = new Set<number>();
  const cells: GridCell[] = chart.nodes.map((node) => ({ column: node.column, row: node.row }));
  // 図に出ない古い差分（人物名を直した後に残ったもの）も数える。保存はされるので、
  // 「空に見える行」を詰めると升目が重なる。
  for (const [name, cell] of Object.entries(placements)) if (!byName.has(name)) cells.push(cell);
  const taken = new Set<string>();
  let overlapping = false;
  let last: GridCell = { column: 0, row: 0 };
  for (const cell of cells) {
    columns.add(cell.column);
    rows.add(cell.row);
    if (taken.has(cellKey(cell))) overlapping = true;
    taken.add(cellKey(cell));
    last = { column: Math.max(last.column, cell.column), row: Math.max(last.row, cell.row) };
  }
  const shiftable = !overlapping
    && cells.length <= MAX_PLACEMENTS_PER_DIAGRAM
    && last.column + 1 <= cellLimit(columnPitch(spacing))
    && last.row + 1 <= cellLimit(rowPitch(spacing));
  return { columns, rows, last, shiftable };
}

/**
 * 比較のための文字列。鍵を並べ替えるのは、オブジェクトの鍵の順だけで「変わった」と言わないため。
 *
 * 刻みも同じ鍵に含める。含め忘れると、間隔だけを変えた下書きが「変更なし」と判定され、保存が
 * 押せないまま編集を終うと確認もなく捨てられる。
 */
export function layoutKey(layout: DiagramLayout): string {
  const placements = layout.placements;
  const sorted = Object.keys(placements).sort()
    .map((name) => [name, placements[name]!.column, placements[name]!.row] as const);
  return JSON.stringify([sorted, layout.spacing ?? null]);
}

/**
 * 人物の札に添える群の名前。宣言順で最初の軸から順に並べる。
 *
 * 同じ組み合わせは 1 つに畳む（同じ巻・章段に何度も出る人物の札が同じ語で埋まらないように）。
 */
export function groupLabelsOf(document: DiagramDocument, name: string): readonly string[] {
  const appearances = document.families.filter((f) => f.parents.includes(name) || f.children.includes(name));
  return [...new Set(appearances
    .map((family) => document.groups
      .map((axis) => axis.values[family.groups[axis.id] ?? ''] ?? '')
      .filter((label) => label !== '')
      .join(' · '))
    .filter((label) => label !== ''))];
}

/** その人物の親（生成元）。読み上げ用の補足に使う。 */
export function parentsOf(document: DiagramDocument, name: string): readonly string[] {
  return [...new Set(document.families.filter((f) => f.children.includes(name)).flatMap((f) => f.parents))];
}
