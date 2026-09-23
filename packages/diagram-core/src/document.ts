/**
 * `*.diagram.json` の読み書きと、保存の入口での検証。
 *
 * 読み取りは**寛容**（壊れた 1 件で図全体を捨てない）、保存の検証は**厳格**（送り主の意図しない
 * 升目へ黙って動かさない）。移植元は anytime-travel の `shared/genealogy.ts`。
 */

import { assertNever } from './exhaustive';
import {
  cellFromPoint,
  cellKey,
  cellLimit,
  columnPitch,
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_SPACING_RANGE,
  isDefaultDiagramSpacing,
  isPlaceableCoordinate,
  readDiagramSpacing,
  rowPitch,
} from './spacing';
import { MAX_CONNECTORS_PER_DIAGRAM } from './connectors';
// 輪の検出は並べ替えと同じ走査なので、実装は `layout.ts` に 1 つだけ置く（読み取りと描画で
// 別々の判定を持つと、片方だけが輪を通す）。
import { findDiagramCycle } from './layout';
import {
  DEFAULT_DIAGRAM_DIRECTION,
  DIAGRAM_DIRECTIONS,
  DIAGRAM_ENDPOINTS,
  DIAGRAM_LINE_COLORS,
  DIAGRAM_LINE_ROUTES,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_RELATIONS,
  DIAGRAM_SHAPES,
  type DiagramAnchor,
  type DiagramConnector,
  type DiagramDirection,
  type DiagramDocument,
  type DiagramEndpoint,
  type DiagramFamily,
  type DiagramGroupAxis,
  type DiagramLayout,
  type DiagramLineColor,
  type DiagramLineLook,
  type DiagramLineRoute,
  type DiagramLineStyle,
  type DiagramPlacement,
  type DiagramRelation,
  type DiagramShape,
  type DiagramSpacing,
  DEFAULT_DIAGRAM_SHAPE,
  EMPTY_DIAGRAM_LAYOUT,
} from './types';

type Warn = (message: string) => void;

/**
 * 1 つの図に持てる配置差分の上限。人物 162 名（移植元の古事記系図）の数倍を上限とし、
 * 名前を変えた後に残る古い差分が際限なく積もるのを止める。
 */
export const MAX_PLACEMENTS_PER_DIAGRAM = 1000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item): item is string => typeof item === 'string' && item !== '')) return undefined;
  return value;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isObject(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return undefined;
    result[key] = item;
  }
  return result;
}

function isRelation(value: unknown): value is DiagramRelation {
  return typeof value === 'string' && (DIAGRAM_RELATIONS as readonly string[]).includes(value);
}

function isLineStyle(value: unknown): value is DiagramLineStyle {
  return typeof value === 'string' && (DIAGRAM_LINE_STYLES as readonly string[]).includes(value);
}

function isEndpoint(value: unknown): value is DiagramEndpoint {
  return typeof value === 'string' && (DIAGRAM_ENDPOINTS as readonly string[]).includes(value);
}

function isLineColor(value: unknown): value is DiagramLineColor {
  return typeof value === 'string' && (DIAGRAM_LINE_COLORS as readonly string[]).includes(value);
}

function isLineRoute(value: unknown): value is DiagramLineRoute {
  return typeof value === 'string' && (DIAGRAM_LINE_ROUTES as readonly string[]).includes(value);
}

/**
 * 線の端。**文字列は要素、`{ line: "c1" }` は別の線の中点。**
 *
 * 文字列だけだった頃のファイルをそのまま読むために、要素は文字列のままにする。読めない値は
 * `undefined` を返し、呼ぶ側が図ごと断る（線は図の中身なので 1 件でも落とさない）。
 */
export function readDiagramAnchor(value: unknown): DiagramAnchor | undefined {
  if (typeof value === 'string' && value !== '') return { kind: 'element', name: value };
  if (isObject(value) && typeof value.line === 'string' && value.line !== '') {
    return { kind: 'line', line: value.line };
  }
  if (isObject(value)) {
    const parents = stringArray(value.family);
    if (parents !== undefined && parents.length > 0) return { kind: 'family', parents };
  }
  return undefined;
}

/** 端の書き出し。要素は**文字列のまま**書く（項目を足しても既存のファイルの形が変わらない）。 */
function writeAnchor(
  anchor: DiagramAnchor,
): string | { readonly line: string } | { readonly family: readonly string[] } {
  switch (anchor.kind) {
    case 'element': return anchor.name;
    case 'line': return { line: anchor.line };
    case 'family': return { family: anchor.parents };
    default: return assertNever(anchor, 'writeAnchor');
  }
}

function isShape(value: unknown): value is DiagramShape {
  return typeof value === 'string' && (DIAGRAM_SHAPES as readonly string[]).includes(value);
}

/**
 * 書き出す形。要素名の順に並べ、**既定（四角）は落とす**。
 *
 * 並べるのは差分の差分（git diff）を読めるようにするため（配置差分と同じ）。落とすのを読み取り側
 * だけに置かない — 図を組み立てるのは画面と MCP でもあり、読み取りを通らずに書かれた既定の行が
 * そのままファイルへ出る（実際に MCP の検査で出た）。**不変条件は書き出す側で守る。**
 */
function sortedShapes(shapes: Readonly<Record<string, DiagramShape>>): Record<string, DiagramShape> {
  const sorted: Record<string, DiagramShape> = {};
  for (const name of Object.keys(shapes).sort()) {
    const shape = shapes[name]!;
    if (shape !== DEFAULT_DIAGRAM_SHAPE) sorted[name] = shape;
  }
  return sorted;
}

/**
 * 線の見た目 1 件。**書いてあるなら 4 項目すべてが要る。**
 *
 * 足りない項目を既定で埋めない。埋めると、綴り違いの項目名が「指定したのに効かない設定」として
 * 静かに残る（上書きの有無そのものが見た目の意味を持つので、部分的な上書きを許すと
 * 「既定に戻した」と「書き忘れた」が区別できなくなる）。
 */
function readLineLook(value: unknown, onWarn: Warn): DiagramLineLook | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || !isLineStyle(value.line) || !isLineColor(value.color)
    || !isEndpoint(value.start) || !isEndpoint(value.end)) {
    onWarn(`[diagram] look は line（${DIAGRAM_LINE_STYLES.join(' | ')}）/ color（${DIAGRAM_LINE_COLORS.join(' | ')}）`
      + ` / start・end（${DIAGRAM_ENDPOINTS.join(' | ')}）の 4 項目が必要です`);
    return null;
  }
  // 経路だけは**無くてもよい**。経路を持たなかった頃に保存した図を、項目を足した日に読めなく
  // しない（色を後から足したときと同じ扱い）。書いてある値が読めないときは断る。
  if (value.route !== undefined && !isLineRoute(value.route)) {
    onWarn(`[diagram] look.route は ${DIAGRAM_LINE_ROUTES.join(' | ')} のどれかです`);
    return null;
  }
  return {
    line: value.line,
    color: value.color,
    route: value.route ?? 'orthogonal',
    start: value.start,
    end: value.end,
  };
}

/**
 * 線に添える字。**空白だけなら無かったことにする**（既定と同じ状態を項目として残さない）。
 *
 * 書いてあるのに文字列でなければ**断る**（読み捨てない）。読み捨てると、開いて保存し直すたびに
 * 字が 1 本ずつ消え、いつ消えたのかを後から辿れない（形の読み取りと同じ扱い）。
 */
function readLineLabel(value: unknown, onWarn: Warn): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    onWarn('[diagram] label は文字列です');
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** 升目の番号として読めるか。負・小数・桁外れは弾く。 */
function isCellNumber(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit;
}

/**
 * 保存済みの配置 1 件を升目として読む。
 *
 * **px で保存された古い差分（升目という概念が無かった頃）も受ける。** その図の刻みで最も近い
 * 升目へ寄せる — 読めないものとして落とすと、升目化の前に整えた配置がまるごと消える。
 */
function readPlacement(value: unknown, spacing: DiagramSpacing): DiagramPlacement | null {
  if (!isObject(value)) return null;
  if (isCellNumber(value.column, cellLimit(columnPitch(spacing))) && isCellNumber(value.row, cellLimit(rowPitch(spacing)))) {
    return { column: value.column, row: value.row };
  }
  if (isPlaceableCoordinate(value.x) && isPlaceableCoordinate(value.y)) {
    return cellFromPoint(spacing, { x: value.x, y: value.y });
  }
  return null;
}

/** 升目 2 つの縦横の隔たり（斜めを遠いものとして数える）。 */
const manhattan = (cell: DiagramPlacement, from: DiagramPlacement): number =>
  Math.abs(cell.column - from.column) + Math.abs(cell.row - from.row);

/**
 * すでに埋まっている升目を避けた置き場。
 *
 * px で保存された古い差分は連続値なので、**半升以内に並んでいた 2 人は必ず同じ升目へ落ちる**。
 * 1 件ずつ独立に変換すると、読み込んだ瞬間に人物が重なり、下になったほうを二度と掴めない
 * — 升目にした目的そのものが崩れる。環を外へ広げて最初の空きへ寄せる。
 */
function freeCellNear(
  cell: DiagramPlacement,
  taken: ReadonlySet<string>,
  spacing: DiagramSpacing,
): DiagramPlacement {
  if (!taken.has(cellKey(cell))) return cell;
  const limit = { column: cellLimit(columnPitch(spacing)), row: cellLimit(rowPitch(spacing)) };
  for (let radius = 1; radius <= MAX_PLACEMENTS_PER_DIAGRAM; radius += 1) {
    const candidates = freeCellsOnRing(cell, radius, taken, limit);
    if (candidates.length === 0) continue;
    // 寄せ先は**下・右を先に**選ぶ。左上を優先すると、詰まっている図の中心側（原点寄り）へ
    // 人物が押し込まれ、玉突きで別の升目まで動かすことになる。
    return candidates.sort((left, right) => manhattan(left, cell) - manhattan(right, cell)
      || (right.row - cell.row) - (left.row - cell.row)
      || (right.column - cell.column) - (left.column - cell.column))[0]!;
  }
  return cell;
}

/** `cell` から Chebyshev 距離 `radius` の周のうち、枠の中で空いている升目。 */
function freeCellsOnRing(
  cell: DiagramPlacement,
  radius: number,
  taken: ReadonlySet<string>,
  limit: { readonly column: number; readonly row: number },
): DiagramPlacement[] {
  const candidates: DiagramPlacement[] = [];
  for (let column = cell.column - radius; column <= cell.column + radius; column += 1) {
    for (let row = cell.row - radius; row <= cell.row + radius; row += 1) {
      const onRing = Math.max(Math.abs(column - cell.column), Math.abs(row - cell.row)) === radius;
      // 上限も下限と対称に見る。見ないと、読み出しの寄せ先だけが保存の入口で断られる
      // 番号（`cellLimit` の外）を作り、読んだ図をそのまま保存し直せなくなる。
      const inside = column >= 0 && row >= 0 && column <= limit.column && row <= limit.row;
      if (onRing && inside && !taken.has(cellKey({ column, row }))) candidates.push({ column, row });
    }
  }
  return candidates;
}

/**
 * 配置の対応を升目として読む。**名前の順に回し、重なった升目は空きへ寄せる。**
 *
 * 順序を名前で固定するのは、同じ入力から同じ結果を出すため（オブジェクトの鍵の順に任せると、
 * どちらの人物が元の升目に残るかが保存の書き方で変わる）。
 */
function readPlacementMap(
  value: Readonly<Record<string, unknown>>,
  spacing: DiagramSpacing,
  onFail: (name: string) => 'skip' | 'stop',
): Record<string, DiagramPlacement> | null {
  const placements: Record<string, DiagramPlacement> = {};
  const taken = new Set<string>();
  for (const name of Object.keys(value).sort()) {
    const cell = readPlacement(value[name], spacing);
    if (cell === null) {
      if (onFail(name) === 'stop') return null;
      continue;
    }
    const placed = freeCellNear(cell, taken, spacing);
    taken.add(cellKey(placed));
    placements[name] = placed;
  }
  return placements;
}

/**
 * 保存の中身が空か。配置が 1 件も無く刻みも既定なら、その図は差分を持たない。
 *
 * 画面（「自動配置に戻す」を押せるか）と保存（差分を落とすか）が同じ判定を読む。割ると、
 * 押せないボタンの向こうで差分だけが消える組み合わせが生まれる。
 */
export function isEmptyLayout(layout: DiagramLayout): boolean {
  return Object.keys(layout.placements).length === 0 && isDefaultDiagramSpacing(layout.spacing)
    && (layout.direction ?? DEFAULT_DIAGRAM_DIRECTION) === DEFAULT_DIAGRAM_DIRECTION;
}

function isDirection(value: unknown): value is DiagramDirection {
  return typeof value === 'string' && (DIAGRAM_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * 配置・刻み・向きから差分を組む。**既定と同じ刻みと向きは持たない**（読み取り・検証・書き出しの
 * 3 か所が同じ 1 つを読む）。
 *
 * 3 か所で別々に組むと、項目を足した日に 1 か所だけが既定を焼き付け、「触っていないのに保存すると
 * 差分が出る」図ができる。
 */
function composeLayout(
  placements: Readonly<Record<string, DiagramPlacement>>,
  spacing: DiagramSpacing | null | undefined,
  direction: DiagramDirection | null | undefined,
): DiagramLayout {
  return {
    placements,
    ...(spacing === null || spacing === undefined || isDefaultDiagramSpacing(spacing) ? {} : { spacing }),
    ...(direction === null || direction === undefined || direction === DEFAULT_DIAGRAM_DIRECTION ? {} : { direction }),
  };
}

/**
 * 図に描ける要素の名前。**家族に現れる人物と、家族に属さない要素（`nodes`）の和**。
 *
 * 和で取るので、家族に出る名前が `nodes` にも書いてあっても 1 つに畳まれる（図に同じ札が
 * 2 枚並ばない）。ここに無い名前は図の外側で、配置差分も接続線も掛からない。
 */
export function diagramPeople(
  families: readonly DiagramFamily[],
  nodes: readonly string[] = [],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const family of families) {
    for (const name of family.parents) names.add(name);
    for (const name of family.children) names.add(name);
  }
  for (const name of nodes) names.add(name);
  return names;
}

/** その図の刻み（読めないときは既定）。配置を升目へ読むのに要る。 */
function spacingOf(layout: unknown): DiagramSpacing {
  const stored = isObject(layout) ? layout.spacing : undefined;
  return (stored === undefined ? null : readDiagramSpacing(stored)) ?? DEFAULT_DIAGRAM_SPACING;
}

/**
 * 配置差分の読み取り（寛容）。読めない 1 件は**黙って落とさず警告して**落とす。
 *
 * 名前を直すと差分が孤立するが、その 1 件のために保存済みの差分すべては捨てない。
 */
export function readDiagramLayout(value: unknown, onWarn: Warn = () => {}): DiagramLayout {
  if (!isObject(value)) return EMPTY_DIAGRAM_LAYOUT;
  const spacingForCells = spacingOf(value);
  const placements = isObject(value.placements)
    ? readPlacementMap(value.placements, spacingForCells, (name) => {
      onWarn(`[diagram] layout.placements.${name} の升目を読めないため落としました`);
      return 'skip';
    }) ?? {}
    : {};
  const stored = value.spacing;
  const spacing = stored === undefined ? null : readDiagramSpacing(stored);
  if (stored !== undefined && spacing === null) onWarn('[diagram] layout.spacing を読めないため既定で描きます');
  const direction = value.direction;
  if (direction !== undefined && !isDirection(direction)) {
    onWarn(`[diagram] layout.direction は ${DIAGRAM_DIRECTIONS.join(' | ')} のどれかです。既定（${DEFAULT_DIAGRAM_DIRECTION}）で描きます`);
  }
  return composeLayout(placements, spacing, isDirection(direction) ? direction : null);
}

/** 分類の軸の一覧。1 件でも読めなければ図ごと読まない（軸が欠けた札が黙って並ばないように）。 */
function readGroupAxes(value: unknown, onWarn: Warn): DiagramGroupAxis[] | null {
  if (!Array.isArray(value)) {
    onWarn('[diagram] groups: 配列が必要です');
    return null;
  }
  const groups: DiagramGroupAxis[] = [];
  for (const axis of value) {
    const values = stringRecord(isObject(axis) ? axis.values : undefined);
    if (!isObject(axis) || typeof axis.id !== 'string' || typeof axis.label !== 'string' || values === undefined) {
      onWarn('[diagram] groups の要素は id / label / values（文字列の対応）が必要です');
      return null;
    }
    groups.push({ id: axis.id, label: axis.label, values });
  }
  return groups;
}

/**
 * 家族の一覧。
 *
 * **空を断らない。** かつては「人物は家族から導く」ため空＝描ける人物が 0 人だったが、
 * 家族に属さない要素（`nodes`）を持てるようになった以上、家族が 0 件でも図は成り立つ
 * （要素だけを並べて手で線を引く図）。「要素が 1 つも無い」の判定は両方を見た後に行う。
 */
function readFamilies(value: unknown, onWarn: Warn): DiagramFamily[] | null {
  if (!Array.isArray(value)) {
    onWarn('[diagram] families: 配列が必要です');
    return null;
  }
  const families: DiagramFamily[] = [];
  for (const family of value) {
    const parents = stringArray(isObject(family) ? family.parents : undefined);
    const children = stringArray(isObject(family) ? family.children : undefined);
    const familyGroups = stringRecord(isObject(family) ? family.groups : undefined);
    if (parents === undefined || parents.length === 0 || children === undefined || familyGroups === undefined
      || !isObject(family) || !isRelation(family.kind)) {
      onWarn('[diagram] families の要素は parents（1 件以上）/ children / kind / groups が必要です');
      return null;
    }
    const look = readLineLook(family.look, onWarn);
    if (look === null) return null;
    const label = readLineLabel(family.label, onWarn);
    if (label === null) return null;
    families.push({
      parents,
      children,
      kind: family.kind,
      groups: familyGroups,
      ...(look === undefined ? {} : { look }),
      ...(label === undefined ? {} : { label }),
    });
  }
  return families;
}

/**
 * 要素ごとの形。**1 件でも読めなければ図ごと読まない**（接続線と同じ扱い）。

 * 読めない 1 件を落として開く形にしない。落とすと、開いて保存し直すたびに形が 1 つずつ四角へ
 * 戻り、いつ戻ったのかを後から辿れない。
 *
 * 既定（四角）の項目は**読み捨てる**。書いてあっても意味は変わらないが、残すと「持たない決まり」
 * が読み取りを一周するたびに崩れ、触っていない図の差分に四角の行が湧く。
 */
function readShapes(value: unknown, onWarn: Warn): Record<string, DiagramShape> | null {
  if (value === undefined) return {};
  if (!isObject(value)) {
    onWarn('[diagram] shapes: 要素名から形への対応が必要です');
    return null;
  }
  const shapes: Record<string, DiagramShape> = {};
  for (const [name, shape] of Object.entries(value)) {
    if (!isShape(shape)) {
      onWarn(`[diagram] shapes.${name} は ${DIAGRAM_SHAPES.join(' | ')} のどれかです`);
      return null;
    }
    if (shape !== DEFAULT_DIAGRAM_SHAPE) shapes[name] = shape;
  }
  return shapes;
}

/**
 * 手で引いた接続線の一覧。**1 件でも読めなければ図ごと読まない**（家族と同じ扱い）。
 *
 * 読めない 1 件を落として開く形にしない。落とすと、開いて保存し直すたびに線が 1 本ずつ静かに
 * 消え、いつ消えたのかを後から辿れない（警告はログに 1 行出るだけで、保存は成功する）。
 * 配置差分を寛容に読むのは、あれが「図の中身」ではなく自動配置への上書きだからで、線は中身。
 */
function readConnectors(value: unknown, onWarn: Warn): DiagramConnector[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    onWarn('[diagram] connectors: 配列が必要です');
    return null;
  }
  if (value.length > MAX_CONNECTORS_PER_DIAGRAM) {
    onWarn(`[diagram] connectors: ${MAX_CONNECTORS_PER_DIAGRAM} 本までです`);
    return null;
  }
  const connectors: DiagramConnector[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isObject(item) || typeof item.id !== 'string' || item.id === ''
      || !isLineStyle(item.line) || !isEndpoint(item.start) || !isEndpoint(item.end)) {
      onWarn('[diagram] connectors の要素は id（空でない文字列）/ from・to（要素名か { line: id }）'
        + ` / line（${DIAGRAM_LINE_STYLES.join(' | ')}）/ start・end（${DIAGRAM_ENDPOINTS.join(' | ')}）が必要です`);
      return null;
    }
    // 色だけは**無くてもよい**。色を持たなかった頃に保存した線を、項目を足した日に読めなく
    // しない（他の項目と違い、既定が一意に決まる）。書いてある値が読めないときは断る。
    const from = readDiagramAnchor(item.from);
    const to = readDiagramAnchor(item.to);
    if (from === undefined || to === undefined) {
      onWarn('[diagram] connectors の from・to は要素名（文字列）か { line: 線の id } です');
      return null;
    }
    // 色と経路だけは**無くてもよい**。どちらも既定が一意に決まるので、その項目を持たなかった頃に
    // 保存した線を、項目を足した日に読めなくしない。書いてある値が読めないときは断る。
    if (item.color !== undefined && !isLineColor(item.color)) {
      onWarn(`[diagram] connectors.color は ${DIAGRAM_LINE_COLORS.join(' | ')} のどれかです`);
      return null;
    }
    if (item.route !== undefined && !isLineRoute(item.route)) {
      onWarn(`[diagram] connectors.route は ${DIAGRAM_LINE_ROUTES.join(' | ')} のどれかです`);
      return null;
    }
    if (seen.has(item.id)) {
      onWarn(`[diagram] connectors: id が重複しています（${item.id}）`);
      return null;
    }
    const label = readLineLabel(item.label, onWarn);
    if (label === null) return null;
    seen.add(item.id);
    connectors.push({
      id: item.id,
      from,
      to,
      line: item.line,
      color: item.color ?? 'default',
      route: item.route ?? 'straight',
      start: item.start,
      end: item.end,
      ...(label === undefined ? {} : { label }),
    });
  }
  return connectors;
}

/** 版が違う図の断り文句。読み取りと下書きの検証の**両方**が同じ文面を出す。 */
const WRONG_VERSION = '[diagram] 図の形式が想定と違います（version=1 のオブジェクトが必要）';

/**
 * 図の読み取り。
 *
 * 壊れたデータで画面を落とさない。`null` を返し、理由を `onWarn` へ渡す。
 */
export function parseDiagramDocument(value: unknown, onWarn: Warn = () => {}): DiagramDocument | null {
  if (!isObject(value) || value.version !== 1) {
    onWarn(WRONG_VERSION);
    return null;
  }
  const { title, lead, note, legend } = value;
  if (typeof title !== 'string' || typeof lead !== 'string' || typeof note !== 'string' || typeof legend !== 'string') {
    onWarn('[diagram] title / lead / note / legend は文字列が必要です');
    return null;
  }
  const groups = readGroupAxes(value.groups, onWarn);
  const families = readFamilies(value.families, onWarn);
  const connectors = readConnectors(value.connectors, onWarn);
  const shapes = readShapes(value.shapes, onWarn);
  if (groups === null || families === null || connectors === null || shapes === null) return null;
  const nodes = value.nodes === undefined ? [] : stringArray(value.nodes);
  if (nodes === undefined) {
    onWarn('[diagram] nodes: 空でない文字列の配列が必要です');
    return null;
  }
  const annotations = value.annotations === undefined ? {} : stringRecord(value.annotations);
  if (annotations === undefined) {
    onWarn('[diagram] annotations: 文字列の対応が必要です');
    return null;
  }
  // 「描ける要素が 1 つも無い」の判定は家族と要素を**両方読んだ後**に 1 度だけ行う。家族の側だけで
  // 断っていた頃の判定を残すと、要素だけで成り立つ図（手で並べて線を引く図）が開けない。
  if (diagramPeople(families, nodes).size === 0) {
    onWarn('[diagram] 図に描ける要素がありません（families か nodes のどちらかが要ります）');
    return null;
  }
  /*
    親子が輪を作る図は**ここで断る**。世代を決める並べ替え（`layoutDiagram`）は輪に出会うと
    例外を投げるが、それが起きるのは描く時点で、そこには受け止める場所が無い — 図が出ないだけ
    でなく宿主へ例外が抜けていた。読み取りの側で断れば、他の壊れた項目と同じく理由が出る。

    保存の入口（`validateDiagramDocument`）はこの読み取りを通すので、**次に開けない図を書けない**
    ことも同時に決まる（保存の目的は「次に開けること」）。
  */
  const cycle = findDiagramCycle(families);
  if (cycle !== null) {
    onWarn(`[diagram] families が輪を作っています（${cycle.join(' → ')}）。親子の向きをたどると同じ要素へ戻ります`);
    return null;
  }
  return {
    version: 1,
    title,
    lead,
    note,
    legend,
    groups,
    families,
    nodes: [...new Set(nodes)],
    shapes,
    connectors,
    annotations,
    layout: readDiagramLayout(value.layout, onWarn),
  };
}

/** JSON 文字列からの読み取り。解釈できない文字列も `null` へ倒す（画面を落とさない）。 */
export function parseDiagramFile(raw: string, onWarn: Warn = () => {}): DiagramDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    onWarn(`[diagram] 図を解釈できません: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  return parseDiagramDocument(parsed, onWarn);
}

/**
 * 保存の土台としての読み取り。**読めない値を空へ倒さない**（読めたら同じ結果を返す）。
 *
 * 寛容版は壊れた値を空の差分として返す。それを土台にして書き戻すと、保存済みの配置が
 * 1 回の保存で消える（警告がログに 1 行出るだけ）。閲覧だけが寛容でよい。
 */
export function parseDiagramFileStrict(raw: string): DiagramDocument {
  const problems: string[] = [];
  const document = parseDiagramFile(raw, (message) => problems.push(message));
  if (document === null) {
    throw new Error(problems[0] ?? '[diagram] 図を読めません');
  }
  return document;
}

/**
 * 保存要求の検証。
 *
 * 断るのは描けない升目・上限超え・範囲外の刻み・読めない向き・**同じ升目の重なり**の 5 つ。
 * **人物名の実在は照合しない** — 図に描かれない名前は害が無く（`layoutDiagram` は人物の一覧を
 * 回して当てる）、照合を入れると人物名を直した瞬間に保存できない状態になる。
 */
export function validateDiagramLayout(
  value: unknown,
): { readonly ok: true; readonly layout: DiagramLayout } | { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['layout: オブジェクトが必要です'] };
  const placements = value.placements;
  if (!isObject(placements)) return { ok: false, errors: ['layout.placements: オブジェクトが必要です'] };
  if (Object.keys(placements).length > MAX_PLACEMENTS_PER_DIAGRAM) {
    return { ok: false, errors: [`layout.placements: ${MAX_PLACEMENTS_PER_DIAGRAM} 件までです`] };
  }
  const spacingForCells = spacingOf(value);
  const normalized: Record<string, DiagramPlacement> = {};
  const taken = new Map<string, string>();
  for (const [name, placement] of Object.entries(placements)) {
    const cell = readPlacement(placement, spacingForCells);
    if (cell === null) {
      errors.push(`layout.placements.${name}: column は 0〜${cellLimit(columnPitch(spacingForCells))}、`
        + `row は 0〜${cellLimit(rowPitch(spacingForCells))} の整数が必要です（px の x と y も受けます）`);
      continue;
    }
    // 入口では重なりを**断る**（読み出しのように寄せない）。送り主の意図しない升目へ黙って
    // 動かさず、どの 2 人かを告げて返す。
    const key = cellKey(cell);
    const already = taken.get(key);
    if (already !== undefined) {
      errors.push(`layout.placements.${name}: ${already} と同じ升目（${cell.column}, ${cell.row}）です`);
      continue;
    }
    taken.set(key, name);
    normalized[name] = cell;
  }
  const stored = value.spacing;
  const spacing = stored === undefined ? null : readDiagramSpacing(stored);
  if (stored !== undefined && spacing === null) {
    // 範囲は宣言そのものから書き出す。項目を足したときに文面へ写し忘れると、断られた側は
    // どの項目が範囲外なのか分からないまま拒否を受け取る。
    const ranges = (Object.keys(DIAGRAM_SPACING_RANGE) as (keyof DiagramSpacing)[])
      .map((key) => `${key} は ${DIAGRAM_SPACING_RANGE[key].min}〜${DIAGRAM_SPACING_RANGE[key].max}`)
      .join('、');
    errors.push(`layout.spacing: ${ranges} の数値が必要です（書かない項目は既定で埋めます）`);
  }
  const direction = value.direction;
  if (direction !== undefined && !isDirection(direction)) {
    errors.push(`layout.direction: ${DIAGRAM_DIRECTIONS.join(' | ')} のどれかが必要です`);
  }
  if (errors.length > 0) return { ok: false, errors };
  // 既定と同じ刻み・向きは持たない。持つと「既定を変えたのに古い既定が焼き付いた図」が残る。
  return { ok: true, layout: composeLayout(normalized, spacing, isDirection(direction) ? direction : null) };
}


/**
 * 保存する形。鍵を並べ替えて書くのは、差分の差分（git diff）を読めるようにするため。
 *
 * 配置が空で刻みも既定なら `layout` そのものを書かない（触っていない図に空の入れ物を残さない）。
 */
export function serializeDiagramDocument(document: DiagramDocument): string {
  const placements: Record<string, DiagramPlacement> = {};
  for (const name of Object.keys(document.layout.placements).sort()) {
    placements[name] = document.layout.placements[name]!;
  }
  // 刻みを先に取り出す。`!` で潰すと、`isDefaultDiagramSpacing` が undefined を「既定ではない」側へ
  // 変わった日に `spacing: undefined` を書き出す形へ静かに壊れる。
  // 形は先に整える（既定を落とした結果が空なら、項目そのものを書かない）。
  const shapes = sortedShapes(document.shapes);
  const layout = composeLayout(placements, document.layout.spacing, document.layout.direction);
  return `${JSON.stringify({
    version: 1,
    title: document.title,
    lead: document.lead,
    note: document.note,
    legend: document.legend,
    groups: document.groups,
    families: document.families,
    // 空の項目は書かない（触っていない図に空の入れ物を増やさない）。読み取りは項目が無ければ
    // 空として受けるので、要素も接続線も持たない既存のファイルは形が変わらない。
    ...(document.nodes.length === 0 ? {} : { nodes: [...document.nodes].sort() }),
    ...(isEmptyShapes(shapes) ? {} : { shapes }),
    ...(document.connectors.length === 0
      ? {}
      : { connectors: [...document.connectors]
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .map((connector) => ({
          ...connector,
          from: writeAnchor(connector.from),
          to: writeAnchor(connector.to),
        })) }),
    annotations: document.annotations,
    ...(isEmptyLayout(layout) ? {} : { layout }),
  }, null, 2)}\n`;
}

const isEmptyShapes = (shapes: Readonly<Record<string, DiagramShape>>): boolean =>
  Object.keys(shapes).length === 0;

/** 新規作成の雛形。要素 1 つだけの図から始める（＋ で足し、線は手で引く）。 */
export function createEmptyDiagramDocument(title: string, firstElement = '要素 1'): DiagramDocument {
  return {
    version: 1,
    title,
    lead: '',
    note: '',
    legend: '実線は親子、点線は生成、破線は婚姻を表します。',
    groups: [],
    families: [],
    nodes: [firstElement],
    shapes: {},
    connectors: [],
    annotations: {},
    layout: EMPTY_DIAGRAM_LAYOUT,
  };
}

/**
 * 図に既に在る名前と重ならない名前。`要素 1`・`要素 2`… と数字だけを繰り上げる。
 *
 * 追加のたびに一意な名前を作るのは、**名前が要素の同一性そのもの**だから。同じ名前を 2 つ置くと、
 * 配置差分も接続線も注記もどちらを指しているか決められない。
 */
export function nextElementName(taken: ReadonlySet<string>, prefix = '要素'): string {
  for (let index = 1; index <= taken.size + 1; index += 1) {
    const candidate = `${prefix} ${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 上の走査は必ず空きを見つける（候補が要素数 + 1 個ある）。ここへ来るのは prefix 付きの名前が
  // 外から増えた場合だけなので、時刻で衝突を避ける。
  return `${prefix} ${Date.now()}`;
}

/** 図の中で使われていない接続線の id。`c1`・`c2`… と数字だけを繰り上げる。 */
export function nextConnectorId(connectors: readonly DiagramConnector[]): string {
  const taken = new Set(connectors.map((connector) => connector.id));
  for (let index = 1; index <= taken.size + 1; index += 1) {
    if (!taken.has(`c${index}`)) return `c${index}`;
  }
  return `c${Date.now()}`;
}

/**
 * 要素を 1 つ取り除いた結果。何がついでに変わったかを**数えて返す**。
 *
 * 家族に出る人物を消すと、その人が居た家族と、そこから引かれていた線も消える。押した人が
 * 「1 つ消したつもりが図の一部が変わった」と後から気づくのを避けるため、呼ぶ側が伝えられる
 * 材料をここで揃える。
 */
export interface DiagramElementRemoval {
  readonly document: DiagramDocument;
  /** 取り除けたか。図に居ない名前なら偽で、`document` は元のまま。 */
  readonly removed: boolean;
  /** 消えた家族の件数（その人が親のすべて、または形を保てなくなったもの）。 */
  readonly droppedFamilies: number;
  /** 家族が消えたことで、名前だけの要素として図に残した人物。 */
  readonly rescued: readonly string[];
}

/** 描くものを何も持たない家族か。親が 1 人だけで子が居なければ、線も札の関係も生まない。 */
const drawsNothing = (family: DiagramFamily): boolean =>
  family.children.length === 0 && family.parents.length < 2;

/** その線が要素 `name` に取り付いているか。線の中点を指す端は要素名を持たない。 */
function touchesElement(connector: DiagramConnector, name: string): boolean {
  const at = (anchor: DiagramAnchor) => anchor.kind === 'element' && anchor.name === name;
  return at(connector.from) || at(connector.to);
}

/**
 * 結び目を持つ家族の鍵（親の名前を並べたもの）。**子の居ない家族は数えない。**
 *
 * 子が居なければ降りる線が無く、結び目も描かれない。描かれない点を指した線は端が迷子になる。
 */
function junctionKeys(families: readonly DiagramFamily[]): Set<string> {
  const keys = new Set<string>();
  for (const family of families) {
    if (family.children.length > 0) keys.add(family.parents.join(SEPARATOR));
  }
  return keys;
}

/**
 * その線が、結び目の残っていない家族を指しているか。
 *
 * **家族が消えたときだけでなく、子を全員失って結び目が消えたときも真**になる。前者だけを見ると、
 * 「親は残ったまま子だけ消した」図で線がファイルに残り続け、後で同じ親へ子を足した日に
 * 覚えの無い線が復活する（要素を取り除いたときに接続線を落とすのと同じ理由）。
 */
function pointsAtLostJunction(connector: DiagramConnector, alive: ReadonlySet<string>): boolean {
  const lost = (anchor: DiagramAnchor) => anchor.kind === 'family'
    && !alive.has(anchor.parents.join(SEPARATOR));
  return lost(connector.from) || lost(connector.to);
}

/** 家族の鍵を組むときの区切り。名前に現れない文字を使う（`anchorKey` と同じ約束）。 */
const SEPARATOR = '\u0000';

/** 要素を指す端だけ名前を付け替える。線を指す端は線の id なので、要素の改名では動かない。 */
function swapAnchor(anchor: DiagramAnchor, swap: (name: string) => string): DiagramAnchor {
  switch (anchor.kind) {
    case 'element': return { kind: 'element', name: swap(anchor.name) };
    // 家族を指す端は親の名前で指しているので、親が改名されたら一緒に付け替える。
    case 'family': return { kind: 'family', parents: anchor.parents.map(swap) };
    case 'line': return anchor;
    default: return assertNever(anchor, 'swapAnchor');
  }
}

/**
 * 線を消した後の一覧。**消した線の中点にぶら下がっていた線も、推移的に消す。**
 *
 * 残さない。残すと端の見つからない線が図に積もり、描画側は黙って描かないので
 * 「ファイルには在るが永久に見えない線」になる（次に同じ id が振られた日に復活する）。
 *
 * 深さで打ち切らず、消える線が増えなくなるまで回す。線どうしが輪を作っていても、輪の中の線は
 * どれも「消える」側にしか動かないので必ず止まる。
 */
export function removeDiagramConnectors(
  connectors: readonly DiagramConnector[],
  ids: readonly string[],
): DiagramConnector[] {
  const doomed = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const connector of connectors) {
      if (doomed.has(connector.id)) continue;
      const hangsOn = (anchor: DiagramAnchor) => anchor.kind === 'line' && doomed.has(anchor.line);
      if (hangsOn(connector.from) || hangsOn(connector.to)) {
        doomed.add(connector.id);
        grew = true;
      }
    }
  }
  return connectors.filter((connector) => !doomed.has(connector.id));
}

/**
 * 要素を 1 つ取り除いた図。**家族に出る人物も消せる。**
 *
 * その人を家族の親・子から外し、外した結果**何も描かなくなった家族は落とす**。落とした家族に
 * しか出てこなかった人物は、`nodes`（単独の要素）へ**拾い直す** — 拾わないと、1 人消したつもりで
 * その家族の相手まで図から消える。位置（配置差分）は触らないので、残った札はその場に留まる。
 *
 * 併せて**その要素に取り付いた接続線・注記・配置差分・形も落とす**。残すと、図に出ない名前を指す
 * 線と差分と形が積もり、次に同じ名前で要素を足したときに覚えの無い線や形が復活する。
 *
 * 家族の結び目を指していた線も、**その結び目が消えたなら**一緒に落とす（家族ごと消えた場合と、
 * 子を全員失って降りる線が無くなった場合の両方）。
 */
export function removeDiagramElement(document: DiagramDocument, name: string): DiagramElementRemoval {
  const before = diagramPeople(document.families, document.nodes);
  if (!before.has(name)) {
    return { document, removed: false, droppedFamilies: 0, rescued: [] };
  }
  const families = document.families
    .map((family) => ({
      ...family,
      parents: family.parents.filter((item) => item !== name),
      children: family.children.filter((item) => item !== name),
    }))
    // 親が 1 人も居ない家族は形として成り立たない（読み取りが断る）。何も描かない家族も落とす。
    .filter((family) => family.parents.length > 0 && !drawsNothing(family));
  const nodes = document.nodes.filter((item) => item !== name);
  // 家族が消えたせいで図から居なくなる人物を拾い直す。**消した本人は拾わない**。
  const after = diagramPeople(families, nodes);
  const rescued = [...before].filter((person) => person !== name && !after.has(person)).sort();
  const annotations = { ...document.annotations };
  delete annotations[name];
  const shapes = { ...document.shapes };
  delete shapes[name];
  const placements = { ...document.layout.placements };
  delete placements[name];
  return {
    document: {
      ...document,
      families,
      nodes: [...nodes, ...rescued],
      shapes,
      connectors: removeDiagramConnectors(
        document.connectors,
        document.connectors
          // 取り除いた要素に取り付いていた線と、**結び目を失った家族**を指していた線の両方が起点。
          .filter((connector) => touchesElement(connector, name)
            || pointsAtLostJunction(connector, junctionKeys(families)))
          .map((connector) => connector.id),
      ),
      annotations,
      layout: { ...document.layout, placements },
    },
    removed: true,
    droppedFamilies: document.families.length - families.length,
    rescued,
  };
}

/**
 * 家族 1 件の群の値を書き換えた図。**軸 1 本だけを差し替える。**
 *
 * 宣言（`groups`）に無い軸・無い値は受けない。受けると、どの札にも出ない値がファイルへ入り、
 * 次に開いた人には「札に出ないのに差分には在る」状態になる（画面の選び口は宣言から作るので、
 * そこから選び直すこともできない）。
 *
 * 空の値は軸ごと落とす（読めない値を残さない。注記・形と同じ決まり）。
 *
 * **家族 1 件が単位**であることに注意する。同じ家族に出る他の人物の札も一緒に変わる — 群は
 * 人物ではなく「その家族がどの巻・どの話に出てくるか」を指しているため。
 */
export function setDiagramFamilyGroup(
  document: DiagramDocument,
  familyIndex: number,
  axisId: string,
  value: string,
): DiagramDocument {
  const family = document.families[familyIndex];
  if (family === undefined) return document;
  const axis = document.groups.find((item) => item.id === axisId);
  if (axis === undefined) return document;
  if (value !== '' && axis.values[value] === undefined) return document;
  const groups = { ...family.groups };
  if (value === '') delete groups[axisId];
  else groups[axisId] = value;
  return {
    ...document,
    families: document.families.map((item, at) => (at === familyIndex ? { ...item, groups } : item)),
  };
}

/**
 * 図の中で使われていない軸の id。`g1`・`g2`… と数字だけを繰り上げる。
 *
 * 表示名（「巻」など）を id にしない。id は家族の持つ値の鍵なので、名前を直した瞬間に
 * 全家族の値が指し先を失う（接続線が端の名前ではなく id を持つのと同じ理由）。
 */
export function nextDiagramGroupAxisId(groups: readonly DiagramGroupAxis[]): string {
  const taken = new Set(groups.map((axis) => axis.id));
  for (let index = 1; index <= taken.size + 1; index += 1) {
    if (!taken.has(`g${index}`)) return `g${index}`;
  }
  return `g${Date.now()}`;
}

/** その軸で使われていない選択肢の鍵。`v1`・`v2`… と数字だけを繰り上げる（軸の id と同じ理由）。 */
export function nextDiagramGroupValue(axis: DiagramGroupAxis): string {
  const taken = new Set(Object.keys(axis.values));
  for (let index = 1; index <= taken.size + 1; index += 1) {
    if (!taken.has(`v${index}`)) return `v${index}`;
  }
  return `v${Date.now()}`;
}

/**
 * 軸を 1 本足した図。**表示名が空なら何もしない。**
 *
 * 空の名前を許すと、選び口に名前の無い行ができる。どの軸なのか画面から読めない値を、
 * 家族に付けられる状態にしない。
 */
export function addDiagramGroupAxis(document: DiagramDocument, label: string): DiagramDocument {
  const trimmed = label.trim();
  if (trimmed === '') return document;
  const axis: DiagramGroupAxis = { id: nextDiagramGroupAxisId(document.groups), label: trimmed, values: {} };
  return { ...document, groups: [...document.groups, axis] };
}

/** 軸の表示名を書き換えた図。**空なら何もしない**（`addDiagramGroupAxis` と同じ理由）。 */
export function renameDiagramGroupAxis(
  document: DiagramDocument,
  axisId: string,
  label: string,
): DiagramDocument {
  const trimmed = label.trim();
  if (trimmed === '') return document;
  if (!document.groups.some((axis) => axis.id === axisId)) return document;
  return {
    ...document,
    groups: document.groups.map((axis) => (axis.id === axisId ? { ...axis, label: trimmed } : axis)),
  };
}

/**
 * 軸を 1 本取り除いた図。**その軸を使っていた家族の値もまとめて落とす。**
 *
 * 宣言だけを消して家族の値を残さない。残すと、どの軸のものか読めない値がファイルに積もり、
 * 同じ id で軸を作り直した日に覚えの無い群が復活する（注記を空にしたら項目ごと落とすのと同じ）。
 */
export function removeDiagramGroupAxis(document: DiagramDocument, axisId: string): DiagramDocument {
  if (!document.groups.some((axis) => axis.id === axisId)) return document;
  return {
    ...document,
    groups: document.groups.filter((axis) => axis.id !== axisId),
    families: document.families.map((family) => dropGroupKeys(family, (id) => id === axisId)),
  };
}

/** 選択肢を 1 つ足した図。**表示名が空なら何もしない。** */
export function addDiagramGroupValue(
  document: DiagramDocument,
  axisId: string,
  label: string,
): DiagramDocument {
  const trimmed = label.trim();
  const axis = document.groups.find((item) => item.id === axisId);
  if (trimmed === '' || axis === undefined) return document;
  const value = nextDiagramGroupValue(axis);
  return {
    ...document,
    groups: document.groups.map((item) => (item.id === axisId
      ? { ...item, values: { ...item.values, [value]: trimmed } }
      : item)),
  };
}

/** 選択肢の表示名を書き換えた図。鍵は変えないので、その値を持つ家族はそのまま残る。 */
export function renameDiagramGroupValue(
  document: DiagramDocument,
  axisId: string,
  value: string,
  label: string,
): DiagramDocument {
  const trimmed = label.trim();
  const axis = document.groups.find((item) => item.id === axisId);
  if (trimmed === '' || axis === undefined || axis.values[value] === undefined) return document;
  return {
    ...document,
    groups: document.groups.map((item) => (item.id === axisId
      ? { ...item, values: { ...item.values, [value]: trimmed } }
      : item)),
  };
}

/**
 * 選択肢を 1 つ取り除いた図。**その値を選んでいた家族からも落とす**（軸の取り除きと同じ）。
 */
export function removeDiagramGroupValue(
  document: DiagramDocument,
  axisId: string,
  value: string,
): DiagramDocument {
  const axis = document.groups.find((item) => item.id === axisId);
  if (axis === undefined || axis.values[value] === undefined) return document;
  const { [value]: _dropped, ...values } = axis.values;
  return {
    ...document,
    groups: document.groups.map((item) => (item.id === axisId ? { ...item, values } : item)),
    families: document.families.map((family) =>
      dropGroupKeys(family, (id) => id === axisId && family.groups[id] === value)),
  };
}

/** 条件に当たる軸の値を落とした家族。落ちるものが無ければ**同じ家族をそのまま返す**（無駄に作り直さない）。 */
function dropGroupKeys(family: DiagramFamily, drop: (axisId: string) => boolean): DiagramFamily {
  const keys = Object.keys(family.groups).filter((id) => drop(id));
  if (keys.length === 0) return family;
  const groups = { ...family.groups };
  for (const key of keys) delete groups[key];
  return { ...family, groups };
}

/**
 * 線に添える字を書き換えた図。**空にしたら項目ごと落とす**（注記と同じ決まり）。
 *
 * 家族の線と手で引いた線を**1 つの口**で受ける。画面は両方を同じ形（`DiagramAnchor`）で
 * 持っており、口を 2 つに分けると片方へ手を入れた日にもう片方が取り残される。
 *
 * 要素を指す端は何もしない。要素の字は名札（`renameDiagramElement`）と注記が受け持つ。
 */
export function setDiagramLineLabel(
  document: DiagramDocument,
  anchor: DiagramAnchor,
  text: string,
): DiagramDocument {
  const trimmed = text.trim();
  if (anchor.kind === 'line') {
    if (!document.connectors.some((connector) => connector.id === anchor.line)) return document;
    return {
      ...document,
      connectors: document.connectors.map((connector) =>
        (connector.id === anchor.line ? withLabel(connector, trimmed) : connector)),
    };
  }
  if (anchor.kind === 'family') {
    // 同じ親の組が 2 件あるときは**先に書いてあるほう**を直す（`familyAnchor` の約束）。
    const key = [...anchor.parents].join(SEPARATOR);
    const index = document.families.findIndex((family) => [...family.parents].join(SEPARATOR) === key);
    if (index < 0) return document;
    return {
      ...document,
      families: document.families.map((family, at) => (at === index ? withLabel(family, trimmed) : family)),
    };
  }
  return document;
}

/** 字を当てた（空なら項目ごと落とした）写し。線の 2 種類で同じ形なので 1 つで受ける。 */
function withLabel<T extends { readonly label?: string }>(line: T, label: string): T {
  if (label === '') {
    const { label: _dropped, ...rest } = line;
    return rest as T;
  }
  return { ...line, label };
}

/**
 * 注記を書き換えた図。**空にしたら項目ごと落とす。**
 *
 * 空文字を持たない。持つと、触っていない図の差分に空の注記が湧き、次に開いた人には
 * 「注記を付けたのか、消し忘れたのか」が読めない（既定と同じ形・見た目を持たないのと同じ決まり）。
 *
 * 図に居ない名前には付けない。付けると、どの札にも出ない注記がファイルに積もり、次に同じ
 * 名前で要素を足したときに覚えの無い注記が復活する。
 */
export function setDiagramAnnotation(
  document: DiagramDocument,
  name: string,
  text: string,
): DiagramDocument {
  if (!diagramPeople(document.families, document.nodes).has(name)) return document;
  const trimmed = text.trim();
  const annotations = { ...document.annotations };
  if (trimmed === '') delete annotations[name];
  else annotations[name] = trimmed;
  return { ...document, annotations };
}

/**
 * 要素の名前を付け替えた図。**名前を鍵にしている場所をまとめて直す。**
 *
 * 1 か所ずつ呼び出し側で直させない。名前は家族・要素・注記・配置差分・接続線・形の 6 か所に現れ、
 * 直し漏れた 1 か所は「図に出ない差分」「端の消えた線」「消えない形」として静かに残る
 * （どれもエラーを出さない）。
 *
 * 付け替え先が既に在る名前なら**何もしない**（`document` をそのまま返す）。畳むと 2 つの要素が
 * 1 つになり、取り消せない。呼び出し側は先に `diagramPeople` で重なりを断る。
 */
export function renameDiagramElement(
  document: DiagramDocument,
  from: string,
  to: string,
): DiagramDocument {
  if (from === to || to === '') return document;
  const people = diagramPeople(document.families, document.nodes);
  if (!people.has(from) || people.has(to)) return document;
  const swap = (name: string): string => (name === from ? to : name);
  const annotations: Record<string, string> = {};
  for (const [name, text] of Object.entries(document.annotations)) annotations[swap(name)] = text;
  const placements: Record<string, DiagramPlacement> = {};
  for (const [name, cell] of Object.entries(document.layout.placements)) placements[swap(name)] = cell;
  const shapes: Record<string, DiagramShape> = {};
  for (const [name, shape] of Object.entries(document.shapes)) shapes[swap(name)] = shape;
  return {
    ...document,
    families: document.families.map((family) => ({
      ...family,
      parents: family.parents.map(swap),
      children: family.children.map(swap),
    })),
    nodes: [...new Set(document.nodes.map(swap))],
    shapes,
    connectors: document.connectors.map((connector) => ({
      ...connector,
      from: swapAnchor(connector.from, swap),
      to: swapAnchor(connector.to, swap),
    })),
    annotations,
    layout: { ...document.layout, placements },
  };
}

/**
 * 図の全体の検証。保存の入口（webview から届いた図）が通す。
 *
 * 画面が組み立てた図をそのまま書かない。webview からのメッセージは信頼できない入力で、
 * ここを通らない形を書くと、次に開いた画面が「読めません」になる。読み取り（寛容）ではなく
 * **読み戻せるか**で判定する — 保存の目的は「次に開けること」だから。
 */
export function validateDiagramDocument(
  value: unknown,
): { readonly ok: true; readonly document: DiagramDocument } | { readonly ok: false; readonly errors: readonly string[] } {
  const problems: string[] = [];
  const document = parseDiagramDocument(value, (message) => problems.push(message));
  if (document === null) return { ok: false, errors: problems.length > 0 ? problems : ['[diagram] 図を読めません'] };
  // 配置差分だけは読み取りが寛容（読めない 1 件を落とす）なので、保存の入口の厳格な検査を
  // 改めて通す。通さないと、重なった升目が「落とされた差分」として静かに消えて保存される。
  const layout = validateDiagramLayout(isObject(value) ? value.layout ?? { placements: {} } : {});
  if (!layout.ok) return { ok: false, errors: layout.errors };
  // **端が図に出ない接続線は断らない。** 配置差分で人物名の実在を照合しないのと同じ理由で、
  // 照合を入れると要素名を直した瞬間に保存できない状態になる（テキスト側で家族を消した図も
  // 開いたまま保存できなくなる）。端の見つからない線は描画側が描かない。
  return { ok: true, document: { ...document, layout: layout.layout } };
}

/**
 * 画面が組み立てた図（下書き）の検証。**書き出す形へ直してから読み直す。**
 *
 * `validateDiagramDocument` はファイルの形（`JSON.parse` した値）を読む。画面が持つ形とは
 * 端（`DiagramAnchor`）の書き方が違い、画面の形をそのまま渡すと「線を 1 本でも引いた図は
 * 保存できない」になる — 端は種別付きの組（`{ kind: 'element' }`）で、ファイルの文字列ではない。
 *
 * 呼び手の側で `JSON.parse(serializeDiagramDocument(...))` と書かない。同じ言い回しを宿主ごとに
 * 書き写すと、書き忘れた 1 か所だけが保存できない画面になる（VS Code 拡張の系図フェンスで実際に
 * そうなった）。書き出す関数と読み直す関数を組にして、ここ 1 か所で持つ。
 *
 * **検査するのは「書いた後に読めるか」であって、渡された値そのものではない。** 書き出しが
 * 正規化する項目（既定と同じ形・空の入れ物）は、断られるのではなく無かったことになる。
 * 信頼できない入力（webview のメッセージ・外から来た JSON）の関所は `unknown` を受ける
 * `validateDiagramDocument` のほうで、こちらは**画面が組み立てた図**にだけ使う。
 *
 * 版だけは往復の前に確かめる。`serializeDiagramDocument` が `version: 1` を固定で書くので、
 * 往復に任せると版違いが静かに 1 へ書き換わる（型を迂回した値がここへ来たことになるので断る）。
 */
export function validateDiagramDraft(
  document: DiagramDocument,
): { readonly ok: true; readonly document: DiagramDocument } | { readonly ok: false; readonly errors: readonly string[] } {
  if (document.version !== 1) return { ok: false, errors: [WRONG_VERSION] };
  return validateDiagramDocument(JSON.parse(serializeDiagramDocument(document)));
}
