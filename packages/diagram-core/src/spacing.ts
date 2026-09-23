/**
 * 刻みと升目の計算。図を描く側と保存を検証する側が**同じ 1 つの実装**を読む。
 *
 * 分かれていると、画面で見た図と保存された図が食い違ったまま気づけない。移植元は
 * anytime-travel の `shared/genealogy.ts` のうち座標計算の部分。
 */

import type { DiagramPlacement, DiagramSpacing } from './types';

/** 図の左上の余白。列 0・行 0 の升目の座標。 */
export const DIAGRAM_MARGIN = 30;

/** 刻みの既定。自動配置が長く使ってきた値で、差分を持たない図はこれで描かれる。 */
export const DEFAULT_DIAGRAM_SPACING: DiagramSpacing = {
  columnGap: 186,
  nodeWidth: 194,
  rowGap: 68,
  nodeHeight: 112,
};

/**
 * 刻みの範囲。画面の取っ手の端でもあり、保存の可否でもある（同じ値を両方が読む）。
 *
 * 下限を 0 にしないのは、すき間 0 では箱どうしが接して親子線の折れ曲がりが隠れ、系統を追えなくなるため。
 * 箱の幅の下限は人物名が 1 行で収まる最小、高さの下限は名前と群の札の 2 行が残る最小。
 */
export const DIAGRAM_SPACING_RANGE = {
  columnGap: { min: 24, max: 480 },
  nodeWidth: { min: 120, max: 360 },
  rowGap: { min: 16, max: 400 },
  nodeHeight: { min: 72, max: 260 },
  // `satisfies` で刻みの項目と 1 対 1 に縛る。`as const` だけだと「範囲にだけ在る鍵」を止められず、
  // 綴り違いの項目が画面の取っ手へ混ざる（札も値も持たない取っ手が 1 つ増える）。
} as const satisfies Record<keyof DiagramSpacing, { readonly min: number; readonly max: number }>;

/** 列の間隔＝箱の幅＋すき間。 */
export const columnPitch = (spacing: DiagramSpacing): number => spacing.nodeWidth + spacing.columnGap;
/** 行の間隔＝箱の高さ＋すき間。縦も横と同じ組み立てにする。 */
export const rowPitch = (spacing: DiagramSpacing): number => spacing.nodeHeight + spacing.rowGap;

/** 升目の左上の座標。描く側と検証する側が同じ計算を読む。 */
export function cellPosition(
  spacing: DiagramSpacing,
  cell: DiagramPlacement,
): { readonly x: number; readonly y: number } {
  return {
    x: DIAGRAM_MARGIN + cell.column * columnPitch(spacing),
    y: DIAGRAM_MARGIN + cell.row * rowPitch(spacing),
  };
}

/** 座標に最も近い升目（枠の外は 0 で止める）。px で保存された古い差分を読み戻すのにも使う。 */
export function cellFromPoint(
  spacing: DiagramSpacing,
  point: { readonly x: number; readonly y: number },
): DiagramPlacement {
  return {
    column: Math.max(0, Math.round((point.x - DIAGRAM_MARGIN) / columnPitch(spacing))),
    row: Math.max(0, Math.round((point.y - DIAGRAM_MARGIN) / rowPitch(spacing))),
  };
}

/** 升目の鍵。占有の集合へ入れる形を 1 か所に決める（列と行の綴りを持ち回らない）。 */
export const cellKey = (cell: DiagramPlacement): string => `${cell.column},${cell.row}`;

/** 座標の上限。図の広さ（人物 160 名規模で約 11,000 × 4,300）に対し十分な余裕を取る。 */
export const COORDINATE_LIMIT = 200_000;

/**
 * 升目の番号の上限は**刻みから導く**。
 *
 * 描かれる座標は 番号 × 間隔 で決まるので、番号だけを固定の数で縛ると刻みの上限と掛け算で効く。
 * 間隔で割れば、刻みの範囲を広げた日も描かれる座標の上限は変わらない。
 */
export function cellLimit(pitch: number): number {
  return Math.floor(COORDINATE_LIMIT / pitch);
}

/** 図に描ける座標か。NaN・Infinity・桁外れを弾く（描けない値は保存もさせない）。 */
export function isPlaceableCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= COORDINATE_LIMIT;
}

/**
 * 既定と同じ刻みか。同じなら保存しない（差分は「既定と違うところ」だけを持つ）。
 *
 * **項目を並べ直さず、既定そのものを回す。** 手で並べると、刻みに項目を足した日にこの判定だけが
 * 古い項目数のまま通り、取っ手が効かない沈黙した破れになる。
 */
export function isDefaultDiagramSpacing(spacing: DiagramSpacing | undefined): boolean {
  return (
    spacing === undefined
    || (Object.keys(DEFAULT_DIAGRAM_SPACING) as (keyof DiagramSpacing)[]).every(
      (key) => spacing[key] === DEFAULT_DIAGRAM_SPACING[key],
    )
  );
}

/**
 * 刻みの読み取り。**書いていない項目は既定で埋め、書いてある項目は範囲で断る**。
 *
 * 2 つを分けるのは、「無い」と「不正」が別の事象だから。項目を足した日に、古い保存値が丸ごと
 * 読めなくなると、誰も触っていないのに保存できない状態になる。一方で範囲の外の値を既定で
 * 埋めると、画面で見た図と保存された図が食い違ったまま気づけない。
 */
export function readDiagramSpacing(value: unknown): DiagramSpacing | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  // 組み立てを 1 件ずつ書くのは、項目を足した日にこの戻り値の形で `tsc` が止まるため
  // （鍵を回して組むと型が緩み、足した項目を読まないまま素通りする）。
  const read = (key: keyof DiagramSpacing): number | null =>
    (source[key] === undefined
      ? DEFAULT_DIAGRAM_SPACING[key]
      : spacingValue(source[key], DIAGRAM_SPACING_RANGE[key]));
  const columnGap = read('columnGap');
  const nodeWidth = read('nodeWidth');
  const rowGap = read('rowGap');
  const nodeHeight = read('nodeHeight');
  if (columnGap === null || nodeWidth === null || rowGap === null || nodeHeight === null) return null;
  return { columnGap, nodeWidth, rowGap, nodeHeight };
}

/** 刻みの 1 項目。整数へ丸め、範囲の外は読めなかったものとして扱う（描けない値は保存させない）。 */
function spacingValue(value: unknown, range: { readonly min: number; readonly max: number }): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded < range.min || rounded > range.max ? null : rounded;
}

/** すき間の軸。列と行で同じ組み立てを使うための名前。 */
export type GapAxis = 'column' | 'row';

/**
 * 最初のすき間の帯（掴める場所）。**箱の縁からすき間ぶん**を返す。
 *
 * どのすき間も同じ幅なので、どれを掴ませてもよい。**最初の 1 つ**に決めるのは、指の動きが
 * すき間の差と 1 対 1 になるため（2 つ目のすき間を掴むと、手前のすき間も一緒に広がるので
 * 取っ手が指の 2 倍動く。箱の大きさの取っ手が列 + 1 倍で動くのと同じ理屈）。
 */
export function gapBand(
  spacing: DiagramSpacing,
  axis: GapAxis,
): { readonly start: number; readonly size: number } {
  return axis === 'column'
    ? { start: DIAGRAM_MARGIN + spacing.nodeWidth, size: spacing.columnGap }
    : { start: DIAGRAM_MARGIN + spacing.nodeHeight, size: spacing.rowGap };
}

/**
 * すき間を増減した刻み。**触れていない軸と箱の大きさには手を付けない。**
 *
 * 丸めと範囲の当て方は箱の大きさ（`resizedSpacing`）と同じにする。片方だけ端数を許すと、
 * 同じ図の中で升目の座標が整数の軸と端数の軸に分かれる。
 */
export function spacedGaps(
  start: DiagramSpacing,
  delta: { readonly column?: number; readonly row?: number },
): DiagramSpacing {
  const clamp = (value: number, range: { readonly min: number; readonly max: number }): number =>
    Math.max(range.min, Math.min(range.max, Math.round(value)));
  return {
    ...start,
    columnGap: delta.column === undefined
      ? start.columnGap
      : clamp(start.columnGap + delta.column, DIAGRAM_SPACING_RANGE.columnGap),
    rowGap: delta.row === undefined
      ? start.rowGap
      : clamp(start.rowGap + delta.row, DIAGRAM_SPACING_RANGE.rowGap),
  };
}

/**
 * 引いた量だけ変えた箱の大きさ。範囲の外は端で止め、整数へ丸める。
 *
 * 引いた量は**掴んだ瞬間の大きさからの差**で受ける。いまの大きさへ 1 フレームぶんの差を足し続けると、
 * 範囲の端で止まった後に指を戻したとき、止まっていた間の差が消えて箱が指から離れる。
 *
 * すき間（`columnGap` / `rowGap`）は動かさない。箱と一緒に伸ばすと、幅を変えただけで列の間隔が
 * 二重に広がる（列の間隔＝箱の幅＋すき間）。
 */
export function resizedSpacing(
  start: DiagramSpacing,
  delta: { readonly x: number; readonly y: number },
  axes: { readonly width: boolean; readonly height: boolean },
): DiagramSpacing {
  const clamp = (value: number, range: { readonly min: number; readonly max: number }): number =>
    Math.max(range.min, Math.min(range.max, Math.round(value)));
  return {
    ...start,
    nodeWidth: axes.width ? clamp(start.nodeWidth + delta.x, DIAGRAM_SPACING_RANGE.nodeWidth) : start.nodeWidth,
    nodeHeight: axes.height ? clamp(start.nodeHeight + delta.y, DIAGRAM_SPACING_RANGE.nodeHeight) : start.nodeHeight,
  };
}

/**
 * 列 `index` の**手前の切れ目**の x（図の座標）。空の列を入れるアイコンをここへ置く。
 *
 * 切れ目はすき間の中央。ただし左端（`index` 0）の手前にはすき間が無く、中央を取ると図の外の
 * 負の座標になる — そこへ置いたアイコンは初期表示で画面の外に出て、押せない。
 */
export function columnBoundaryX(spacing: DiagramSpacing, index: number): number {
  return Math.max(DIAGRAM_MARGIN / 2, DIAGRAM_MARGIN + index * columnPitch(spacing) - spacing.columnGap / 2);
}

/** 行 `index` の手前の切れ目の y。列と同じ組み立て。 */
export function rowBoundaryY(spacing: DiagramSpacing, index: number): number {
  return Math.max(DIAGRAM_MARGIN / 2, DIAGRAM_MARGIN + index * rowPitch(spacing) - spacing.rowGap / 2);
}
