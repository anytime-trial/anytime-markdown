/**
 * 升目（グリッド）の操作。人物はここにしか置けない。
 *
 * 升目は列と行の番号で表し、px では表さない。刻みを変えると升目の大きさも位置も変わるが、
 * 番号は変わらない — 「どの升目に置いたか」は刻みと独立した情報だから。
 *
 * 移植元は anytime-travel の `src/map/genealogy-layout.ts` のうち升目操作の部分。
 */

import { MAX_PLACEMENTS_PER_DIAGRAM } from './document';
import type { ChartNode } from './layout';
import {
  cellKey,
  cellPosition,
  columnPitch,
  DIAGRAM_MARGIN as MARGIN,
  rowPitch,
} from './spacing';
import type { DiagramPlacement, DiagramSpacing } from './types';

/** 升目。**保存される配置そのもの**（`DiagramPlacement`）でもある。 */
export type GridCell = DiagramPlacement;

/** 升目の広がり。この外へは置けない。 */
export interface GridExtent {
  readonly columns: number;
  readonly rows: number;
}

/** 升目の軸。列と行で同じ操作（挿入・削除）を書くために、綴りを 1 か所へ寄せる。 */
export type GridAxis = 'column' | 'row';

/**
 * 図が持つ升目の広がり。自動配置が使う範囲に**列と行を 1 つずつ足す**。
 *
 * 足すのは、いちばん右の列・いちばん下の行に居る人物を「隣へ少しずらす」余地を残すため。
 * 足さないと、その人物は動かせる先が 1 つも無い状態になる。
 */
export function gridExtent(nodes: readonly ChartNode[]): GridExtent {
  return {
    columns: Math.max(0, ...nodes.map((node) => node.column)) + 2,
    rows: Math.max(0, ...nodes.map((node) => node.row)) + 2,
  };
}

/**
 * 塗る升目の総数の天井。
 *
 * 天井が要るのは、**升目の番号が配置差分から直に来る**ため — 画面は広がりの中にしか置けないが、
 * ファイルを直に書けば刻みの下限との組み合わせで正当な保存として通り、塗りが数百万升になる。
 */
export const MAX_GRID_CELLS = 20_000;

/**
 * 塗る升目の広がり。**配置差分が指す升目まで含める**が、天井を超えたら自動配置の範囲で引き直す。
 *
 * 含めるのは、差分で外縁の外へ出た人物をキーボードでも動かせるようにするため。戻すのは、
 * 壊れた差分 1 件で塗りが数百万升へ膨らむのを止めるため。
 */
export function paintableExtent(nodes: readonly ChartNode[], automatic: readonly ChartNode[]): GridExtent {
  const placed = gridExtent(nodes);
  return placed.columns * placed.rows <= MAX_GRID_CELLS ? placed : gridExtent(automatic);
}

/**
 * 空いた升目の塗り。1 本の path にまとめる。
 *
 * 升目は数百枚を超えるので、rect を並べるとドラッグの 1 フレームごとに同じ枚数を差分計算する
 * ことになる。path なら属性 1 つの差し替えで済む。**呼ぶのは編集中だけ**。
 */
export function freeCellsPath(
  spacing: DiagramSpacing,
  extent: GridExtent,
  occupied: ReadonlySet<string>,
): string {
  const parts: string[] = [];
  for (let column = 0; column < extent.columns; column += 1) {
    for (let row = 0; row < extent.rows; row += 1) {
      if (occupied.has(cellKey({ column, row }))) continue;
      const { x, y } = cellPosition(spacing, { column, row });
      parts.push(`M ${x} ${y} h ${spacing.nodeWidth} v ${spacing.nodeHeight} h -${spacing.nodeWidth} Z`);
    }
  }
  return parts.join(' ');
}

/** 図の座標に最も近い升目。枠の外へは出さない。 */
export function nearestCell(
  spacing: DiagramSpacing,
  extent: GridExtent,
  point: { readonly x: number; readonly y: number },
): GridCell {
  const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit - 1, value));
  return {
    column: clamp(Math.round((point.x - MARGIN) / columnPitch(spacing)), extent.columns),
    row: clamp(Math.round((point.y - MARGIN) / rowPitch(spacing)), extent.rows),
  };
}

function distance(spacing: DiagramSpacing, cell: GridCell, point: { readonly x: number; readonly y: number }): number {
  const position = cellPosition(spacing, cell);
  return Math.hypot(position.x - point.x, position.y - point.y);
}

/** 升目 `centre` から Chebyshev 距離 `radius` の周（枠の内側に収まるものだけ）。 */
function ring(centre: GridCell, radius: number, extent: GridExtent): readonly GridCell[] {
  const cells: GridCell[] = [];
  const inside = (cell: GridCell) => cell.column >= 0 && cell.row >= 0
    && cell.column < extent.columns && cell.row < extent.rows;
  for (let column = centre.column - radius; column <= centre.column + radius; column += 1) {
    for (const row of [centre.row - radius, centre.row + radius]) {
      if (inside({ column, row })) cells.push({ column, row });
    }
  }
  for (let row = centre.row - radius + 1; row <= centre.row + radius - 1; row += 1) {
    for (const column of [centre.column - radius, centre.column + radius]) {
      if (inside({ column, row })) cells.push({ column, row });
    }
  }
  return cells;
}

/**
 * 図の座標に最も近い**空いた**升目。
 *
 * 埋まった升目へ落とすと人物が重なり、下になったほうを二度と掴めなくなる。近い順に外側へ
 * 探し、見つからなければ元の位置（`fallback`）へ返す — 置けないときに図の隅へ飛ばさない。
 */
export function nearestFreeCell(
  spacing: DiagramSpacing,
  extent: GridExtent,
  occupied: ReadonlySet<string>,
  point: { readonly x: number; readonly y: number },
  fallback: GridCell,
): GridCell {
  const target = nearestCell(spacing, extent, point);
  if (!occupied.has(cellKey(target))) return target;
  // 環（同じ Chebyshev 距離の枠）を 1 つずつ外へ広げる。内側はすでに見ているので周だけを回す。
  for (let radius = 1; radius < Math.max(extent.columns, extent.rows); radius += 1) {
    const candidates = ring(target, radius, extent).filter((cell) => !occupied.has(cellKey(cell)));
    if (candidates.length === 0) continue;
    // 同じ距離で並んだときの決着を固定する（列・行の順）。環の生成順に任せると、列と行の
    // 間隔の大小が入れ替わっただけで選ばれる升目が変わる。
    return candidates.sort((left, right) => distance(spacing, left, point) - distance(spacing, right, point)
      || left.column - right.column || left.row - right.row)[0]!;
  }
  return fallback;
}

/**
 * 升目の差。「何列・何行動かすか」で、行き先そのものではない。
 *
 * 複数の人物をまとめて動かすときに要る。行き先を 1 人ずつ決めると、埋まった升目を避けた人だけが
 * 別の向きへ逃げて**選んだ並びが崩れる**。差なら全員に同じものを当てられる。
 */
export interface GridShift {
  readonly columns: number;
  readonly rows: number;
}

/** 動かさない差。「置けなかった」を表すのにも使う（動けないときは動かさない）。 */
export const NO_SHIFT: GridShift = { columns: 0, rows: 0 };
export const isNoShift = (shift: GridShift): boolean => shift.columns === 0 && shift.rows === 0;
export const shiftCell = (cell: GridCell, shift: GridShift): GridCell =>
  ({ column: cell.column + shift.columns, row: cell.row + shift.rows });

/**
 * その差を当てた行き先が**全員ぶん**置けるか。
 *
 * `occupied` からは動かす本人たちの升目をあらかじめ除いておく（群の中では入れ替わりが起こる）。
 * 1 人でも枠の外・埋まった升目なら偽 — 部分的に動かすと、選んで揃えた並びがその場で崩れる。
 */
function shiftFits(
  extent: GridExtent,
  occupied: ReadonlySet<string>,
  cells: readonly GridCell[],
  shift: GridShift,
): boolean {
  return cells.every((cell) => {
    const to = shiftCell(cell, shift);
    return to.column >= 0 && to.row >= 0 && to.column < extent.columns && to.row < extent.rows
      && !occupied.has(cellKey(to));
  });
}

/**
 * 望んだ差が置けるならそれを、置けないなら**動かさない**。
 *
 * 置けない差の近くを探して代わりの差を採らない。群のドラッグは指を動かすたびに走り、行き先を
 * 1 つずらして動いた次のフレームでは望んだ差が引き直される — 代わりの差を採ると、指を止めていても
 * 群が 2 つの升目の間を往復する。置けるところまで指を運べば群ごと収まる。
 */
export function fittingShift(
  extent: GridExtent,
  occupied: ReadonlySet<string>,
  cells: readonly GridCell[],
  desired: GridShift,
): GridShift {
  if (cells.length === 0) return NO_SHIFT;
  return shiftFits(extent, occupied, cells, desired) ? desired : NO_SHIFT;
}

/**
 * 升目の数で動かしたときの差。**押した向きを保つ**。
 *
 * 行き先が埋まっていたらその向きへ 1 升ずつ進み、枠に当たって届かなかったぶんは手前へ戻りながら
 * 探す（跳んだ先が枠の外というだけで動かさないと、端の手前に空きがあるのに「キーが効かない」
 * ように見える）。群のときは**全員が置ける距離**だけを採る。
 */
export function nudgeShift(
  extent: GridExtent,
  occupied: ReadonlySet<string>,
  cells: readonly GridCell[],
  step: { readonly columns: number; readonly rows: number },
): GridShift {
  const direction = { columns: Math.sign(step.columns), rows: Math.sign(step.rows) };
  if (cells.length === 0 || (direction.columns === 0 && direction.rows === 0)) return NO_SHIFT;
  const jump = Math.max(Math.abs(step.columns), Math.abs(step.rows));
  const shiftAt = (value: number): GridShift => ({ columns: direction.columns * value, rows: direction.rows * value });
  const inside = (shift: GridShift) => cells.every((cell) => {
    const to = shiftCell(cell, shift);
    return to.column >= 0 && to.row >= 0 && to.column < extent.columns && to.row < extent.rows;
  });
  const candidates: GridShift[] = [];
  for (let value = jump; inside(shiftAt(value)); value += 1) candidates.push(shiftAt(value));
  for (let value = jump - 1; value >= 1; value -= 1) {
    if (inside(shiftAt(value))) candidates.push(shiftAt(value));
  }
  return candidates.find((shift) => cells.every((cell) => !occupied.has(cellKey(shiftCell(cell, shift))))) ?? NO_SHIFT;
}

/**
 * 升目の数で動かした先。**押した向きを保つ**。
 *
 * 探し方は群（`nudgeShift`）と 1 つにする。別々に書くと、向きの保ち方を片方だけ直した日に
 * 1 人のときと複数のときでキーの効き方が食い違う。
 */
export function nudgeCell(
  extent: GridExtent,
  occupied: ReadonlySet<string>,
  from: GridCell,
  step: { readonly columns: number; readonly rows: number },
): GridCell {
  return shiftCell(from, nudgeShift(extent, occupied, [from], step));
}

/**
 * 列 `index` の**手前の切れ目**の x（図の座標）。空の列を入れるアイコンをここへ置く。
 *
 * 切れ目はすき間の中央。ただし左端（`index` 0）の手前にはすき間が無く、中央を取ると図の外の
 * 負の座標になる — そこへ置いたアイコンは初期表示で画面の外に出て、押せない。
 */
export function columnBoundaryX(spacing: DiagramSpacing, index: number): number {
  return Math.max(MARGIN / 2, MARGIN + index * columnPitch(spacing) - spacing.columnGap / 2);
}

/** 行 `index` の手前の切れ目の y。列と同じ組み立て。 */
export function rowBoundaryY(spacing: DiagramSpacing, index: number): number {
  return Math.max(MARGIN / 2, MARGIN + index * rowPitch(spacing) - spacing.rowGap / 2);
}

/** 列 `index` の中央の x。**その列を詰める**アイコンをここへ置く（切れ目のアイコンと重ならない）。 */
export function columnCentreX(spacing: DiagramSpacing, index: number): number {
  return MARGIN + index * columnPitch(spacing) + spacing.nodeWidth / 2;
}

/** 行 `index` の中央の y。 */
export function rowCentreY(spacing: DiagramSpacing, index: number): number {
  return MARGIN + index * rowPitch(spacing) + spacing.nodeHeight / 2;
}

/**
 * 縁のアイコンの大きさ（px）。スタイルシートの `width` / `height` と同じ値。
 *
 * ここに置くのは、**隣と重なるかどうかを画面の距離で測る**のにこの値が要るため。CSS 側にだけ
 * 持たせると、大きさを変えた日に間引きの閾値だけが古い値のまま残る。
 */
export const GUTTER_ICON_PX = 20;

/**
 * 縁に描く切れ目の番号。**画面に入るものだけ**を返し、隣と重なる倍率では 1 つも返さない。
 *
 * 枠の外のものを描かないのは、`overflow: hidden` が**描画を切るだけでタブ順からは外さない**ため。
 * 重なる倍率で 1 つも出さないのは、重なった所では後から描いたほうが押下を取り、**狙った切れ目とは
 * 別の位置へ挿入される**ため。
 */
export function visibleGutterIndices(options: {
  /** 置きうる本数（0 から `count - 1` まで）。 */
  readonly count: number;
  /** 番号 → 図の座標。 */
  readonly at: (index: number) => number;
  /** 図の平行移動と倍率。 */
  readonly offset: number;
  readonly scale: number;
  /** 枠の幅・高さ（px）。**0 は未計測**を表し、そのときは絞らない。 */
  readonly frame: number;
  /** 隣の切れ目との図の座標の間隔。 */
  readonly pitch: number;
}): readonly number[] {
  const { count, at, offset, scale, frame, pitch } = options;
  if (pitch * scale < GUTTER_ICON_PX) return [];
  const all = Array.from({ length: Math.max(0, count) }, (_, index) => index);
  if (frame <= 0) return all;
  return all.filter((index) => {
    const screen = offset + at(index) * scale;
    return screen >= -GUTTER_ICON_PX && screen <= frame + GUTTER_ICON_PX;
  });
}

/**
 * 空いた升目に置く ＋ の大きさ（px）。スタイルシートの `width` / `height` と同じ値。
 *
 * 縁の ＋（`GUTTER_ICON_PX`）より大きい。升目の**真ん中**に置くので隣と競合せず、狙いやすさを
 * 優先できる。縁のほうは切れ目ごとに並ぶので、大きくすると隣と重なる倍率が上がる。
 */
export const CELL_ADD_ICON_PX = 28;

/**
 * 空いた升目に ＋ を描くために要る、**画面に映る升目**。
 *
 * 全部の升目に置かない。升目は数千枚まで増えうるうえ、枠の外の要素は `overflow: hidden` が
 * **描画を切るだけでタブ順からは外さない**（縁のアイコンと同じ理由）。
 *
 * 升目の画面上の大きさが ＋ の 2 倍を下回る倍率では 1 つも返さない。全体表示（14%）では升目が
 * 数十 px まで縮み、＋ が升目からはみ出して**隣の升目の ＋ と重なる** — 重なった所では後から
 * 描いたほうが押下を取り、押したつもりと違う升目へ要素が増える（増えた要素は取り消しが利かない）。
 */
export function visibleCells(options: {
  readonly spacing: DiagramSpacing;
  readonly extent: GridExtent;
  /** 図の平行移動と倍率。 */
  readonly view: { readonly x: number; readonly y: number; readonly scale: number };
  /** 枠の内寸（px）。**幅か高さが 0 なら未計測**で、そのときは 1 つも返さない。 */
  readonly frame: { readonly width: number; readonly height: number };
  /** 置かない升目（人物が載っている升目の鍵）。 */
  readonly occupied: ReadonlySet<string>;
  /** 返す枚数の上限。超えたら空を返す（間引くと「どの升目に出るか」が読めなくなる）。 */
  readonly limit: number;
}): readonly GridCell[] {
  const { spacing, extent, view, frame, occupied, limit } = options;
  if (frame.width <= 0 || frame.height <= 0) return [];
  const column = columnPitch(spacing);
  const row = rowPitch(spacing);
  if (column * view.scale < CELL_ADD_ICON_PX * 2 || row * view.scale < CELL_ADD_ICON_PX * 2) return [];
  /**
   * ＋ は升目の**真ん中**に出るので、真ん中の画面上の位置で映るかを決める。
   *
   * 升目の左上で測ると、左上が枠の外にあるだけの升目（真ん中は見えている）を落とし、画面の縁で
   * ＋ が 1 列ぶん欠ける。番号を総当たりで絞らないのは、升目が数千枚まで増えうるため。
   */
  const range = (pitch: number, half: number, offset: number, size: number, count: number) => {
    const indexAt = (screen: number) => ((screen - offset) / view.scale - MARGIN - half) / pitch;
    return {
      from: Math.max(0, Math.ceil(indexAt(-CELL_ADD_ICON_PX))),
      to: Math.min(count - 1, Math.floor(indexAt(size + CELL_ADD_ICON_PX))),
    };
  };
  const columns = range(column, spacing.nodeWidth / 2, view.x, frame.width, extent.columns);
  const rows = range(row, spacing.nodeHeight / 2, view.y, frame.height, extent.rows);
  const cells: GridCell[] = [];
  for (let index = columns.from; index <= columns.to; index += 1) {
    for (let line = rows.from; line <= rows.to; line += 1) {
      if (occupied.has(cellKey({ column: index, row: line }))) continue;
      if (cells.length >= limit) return [];
      cells.push({ column: index, row: line });
    }
  }
  return cells;
}

/**
 * 挿入・削除に共通の升目のずらし。
 *
 * `automatic`（自動配置の升目）を**必須**で受ける。この操作で動かした人物が自動配置の升目へ
 * 戻ったなら、差分から鍵ごと落として自動配置へ返すため。落とさないと、挿入 → 削除で升目は
 * 元に戻るのに固定だけが残り、1 度の押し間違いで図の片側が全員「手で置いた」扱いになる。
 */
function shiftGridLine(
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
  automatic: ReadonlyMap<string, GridCell>,
  axis: GridAxis,
  delta: (value: number) => number,
): Record<string, DiagramPlacement> {
  const step = (cell: GridCell): number => delta(axis === 'column' ? cell.column : cell.row);
  const move = (cell: GridCell): GridCell => {
    const by = step(cell);
    if (by === 0) return cell;
    return axis === 'column'
      ? { column: cell.column + by, row: cell.row }
      : { column: cell.column, row: cell.row + by };
  };
  /** 動かした先が自動配置の升目と同じなら、差分を持たせない（自動配置へ返す）。 */
  const redundant = (name: string, cell: GridCell): boolean => {
    const home = automatic.get(name);
    return home !== undefined && cellKey(home) === cellKey(cell);
  };
  const next: Record<string, DiagramPlacement> = {};
  // 既存の差分は全件持ち越す（動かない人物の差分まで落とすと、手で整えた配置が挿入で消える）。
  for (const [name, cell] of Object.entries(placements)) {
    const to = move(cell);
    if (step(cell) !== 0 && redundant(name, to)) continue;
    next[name] = to;
  }
  for (const node of nodes) {
    if (node.name in placements) continue;
    const cell: GridCell = { column: node.column, row: node.row };
    if (step(cell) !== 0) next[node.name] = move(cell);
  }
  return next;
}

/**
 * 空の行・列を 1 本挿入した配置差分。`index` から後ろの人物が 1 升ずれる。
 *
 * **ずれる人物だけを升目へ固定する。** ずれない人物まで固定すると、以後データに家族を足しても
 * その人物が自動配置へ追従しなくなる。逆にずれる人物を固定しないと、次の描画で自動配置の升目へ
 * 戻り、空けたはずの行・列がその人物で埋まる。
 */
export function insertGridLine(
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
  axis: GridAxis,
  index: number,
  automatic: ReadonlyMap<string, GridCell>,
): Record<string, DiagramPlacement> {
  return shiftGridLine(nodes, placements, automatic, axis, (value) => (value >= index ? 1 : 0));
}

/**
 * 行・列を 1 本詰めた配置差分。`index` より後ろの人物が 1 升戻る。
 *
 * **その行・列が空いていることは呼ぶ側が確かめる**（`gridLineOccupant`）。人物の居る行を詰めると
 * その人物の上に別の人物が乗り、下になったほうを二度と掴めなくなる。
 */
export function removeGridLine(
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
  axis: GridAxis,
  index: number,
  automatic: ReadonlyMap<string, GridCell>,
): Record<string, DiagramPlacement> {
  return shiftGridLine(nodes, placements, automatic, axis, (value) => (value > index ? -1 : 0));
}

/**
 * その行・列に居る人物の 1 人。誰も居なければ `null`。
 *
 * **図に出ない古い差分も数える。** 人物名を直した後に残った差分は描かれないが保存はされるので、
 * 詰めると保存の入口で升目の重なりとして断られる — 画面には何も起きていないように見えるのに
 * 保存だけが通らない状態になる。
 */
export function gridLineOccupant(
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
  axis: GridAxis,
  index: number,
): string | null {
  const at = (cell: GridCell): boolean => (axis === 'column' ? cell.column : cell.row) === index;
  for (const [name, cell] of Object.entries(placements)) if (at(cell)) return name;
  for (const node of nodes) if (!(node.name in placements) && at({ column: node.column, row: node.row })) return node.name;
  return null;
}

/** その位置の行・列に対してできること。`null` は「今はできない」。 */
export interface GridLineEdits {
  /** `index` の手前へ空の行・列を 1 本差し込んだ配置差分。保存の入口で断られる形になるなら `null`。 */
  readonly insert: Record<string, DiagramPlacement> | null;
  /** `index` の行・列を詰めた配置差分。そこに人物が居る・保存できないなら `null`。 */
  readonly remove: Record<string, DiagramPlacement> | null;
}

/**
 * 挿入・削除の可否と中身を**まとめて**返す。
 *
 * 可否と中身を別々に書かない。条件だけが古い判定のまま残ると、押せるのに保存だけが断られる
 * 状態になる。**挿入と削除で見る条件を揃える**のも同じ理由。
 */
export function gridLineEdits(
  nodes: readonly ChartNode[],
  placements: Readonly<Record<string, DiagramPlacement>>,
  axis: GridAxis,
  index: number,
  limit: { readonly column: number; readonly row: number },
  automatic: ReadonlyMap<string, GridCell>,
): GridLineEdits {
  /**
   * 保存の入口（`validateDiagramLayout`）が受ける形か。
   *
   * 重なりも見る。挿入・削除そのものは新しい重なりを作らないが、**すでに同じ升目に居る 2 人**を
   * 差分へ引き写すと、画面は何も変わらないのに保存だけが断られる。
   */
  const storable = (next: Record<string, DiagramPlacement>): boolean => {
    if (Object.keys(next).length > MAX_PLACEMENTS_PER_DIAGRAM) return false;
    const taken = new Set<string>();
    for (const cell of Object.values(next)) {
      if (cell.column > limit.column || cell.row > limit.row) return false;
      const key = cellKey(cell);
      if (taken.has(key)) return false;
      taken.add(key);
    }
    return true;
  };
  const inserted = insertGridLine(nodes, placements, axis, index, automatic);
  const removed = gridLineOccupant(nodes, placements, axis, index) === null
    ? removeGridLine(nodes, placements, axis, index, automatic)
    : null;
  return {
    insert: storable(inserted) ? inserted : null,
    remove: removed !== null && storable(removed) ? removed : null,
  };
}

/** 升目の広がりが占める大きさ（px）。図の枠はこれを下回らない — 外縁の升目が切り落とされるため。 */
export function gridBounds(
  spacing: DiagramSpacing,
  extent: GridExtent,
): { readonly width: number; readonly height: number } {
  const last = cellPosition(spacing, { column: extent.columns - 1, row: extent.rows - 1 });
  return { width: last.x + spacing.nodeWidth + MARGIN, height: last.y + spacing.nodeHeight + MARGIN };
}
