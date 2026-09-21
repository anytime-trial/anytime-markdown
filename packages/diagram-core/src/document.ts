/**
 * `*.diagram.json` の読み書きと、保存の入口での検証。
 *
 * 読み取りは**寛容**（壊れた 1 件で図全体を捨てない）、保存の検証は**厳格**（送り主の意図しない
 * 升目へ黙って動かさない）。移植元は anytime-travel の `shared/genealogy.ts`。
 */

import {
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_SPACING_RANGE,
  cellFromPoint,
  cellKey,
  cellLimit,
  columnPitch,
  isDefaultDiagramSpacing,
  isPlaceableCoordinate,
  readDiagramSpacing,
  rowPitch,
} from './spacing';
import {
  DIAGRAM_RELATIONS,
  EMPTY_DIAGRAM_LAYOUT,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramGroupAxis,
  type DiagramLayout,
  type DiagramPlacement,
  type DiagramRelation,
  type DiagramSpacing,
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
    const candidates: DiagramPlacement[] = [];
    for (let column = cell.column - radius; column <= cell.column + radius; column += 1) {
      for (let row = cell.row - radius; row <= cell.row + radius; row += 1) {
        if (Math.max(Math.abs(column - cell.column), Math.abs(row - cell.row)) !== radius) continue;
        // 上限も下限と対称に見る。見ないと、読み出しの寄せ先だけが保存の入口で断られる
        // 番号（`cellLimit` の外）を作り、読んだ図をそのまま保存し直せなくなる。
        if (column < 0 || row < 0 || column > limit.column || row > limit.row) continue;
        if (!taken.has(cellKey({ column, row }))) candidates.push({ column, row });
      }
    }
    if (candidates.length === 0) continue;
    // 寄せ先は**下・右を先に**選ぶ。左上を優先すると、詰まっている図の中心側（原点寄り）へ
    // 人物が押し込まれ、玉突きで別の升目まで動かすことになる。
    return candidates.sort((left, right) => manhattan(left, cell) - manhattan(right, cell)
      || (right.row - cell.row) - (left.row - cell.row)
      || (right.column - cell.column) - (left.column - cell.column))[0]!;
  }
  return cell;
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
  return Object.keys(layout.placements).length === 0 && isDefaultDiagramSpacing(layout.spacing);
}

/** 家族の一覧に現れる人物名。図に描ける人物の正本で、ここに無い名前は図の外側。 */
export function diagramPeople(families: readonly DiagramFamily[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const family of families) {
    for (const name of family.parents) names.add(name);
    for (const name of family.children) names.add(name);
  }
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
  return spacing === null || isDefaultDiagramSpacing(spacing) ? { placements } : { placements, spacing };
}

/**
 * 図の読み取り。
 *
 * 壊れたデータで画面を落とさない。`null` を返し、理由を `onWarn` へ渡す。
 */
export function parseDiagramDocument(value: unknown, onWarn: Warn = () => {}): DiagramDocument | null {
  if (!isObject(value) || value.version !== 1) {
    onWarn('[diagram] 図の形式が想定と違います（version=1 のオブジェクトが必要）');
    return null;
  }
  const { title, lead, note, legend } = value;
  if (typeof title !== 'string' || typeof lead !== 'string' || typeof note !== 'string' || typeof legend !== 'string') {
    onWarn('[diagram] title / lead / note / legend は文字列が必要です');
    return null;
  }
  const groups: DiagramGroupAxis[] = [];
  if (!Array.isArray(value.groups)) {
    onWarn('[diagram] groups: 配列が必要です');
    return null;
  }
  for (const axis of value.groups) {
    const values = stringRecord(isObject(axis) ? axis.values : undefined);
    if (!isObject(axis) || typeof axis.id !== 'string' || typeof axis.label !== 'string' || values === undefined) {
      onWarn('[diagram] groups の要素は id / label / values（文字列の対応）が必要です');
      return null;
    }
    groups.push({ id: axis.id, label: axis.label, values });
  }
  if (!Array.isArray(value.families)) {
    onWarn('[diagram] families: 配列が必要です');
    return null;
  }
  const families: DiagramFamily[] = [];
  for (const family of value.families) {
    const parents = stringArray(isObject(family) ? family.parents : undefined);
    const children = stringArray(isObject(family) ? family.children : undefined);
    const familyGroups = stringRecord(isObject(family) ? family.groups : undefined);
    if (parents === undefined || parents.length === 0 || children === undefined || familyGroups === undefined
      || !isObject(family) || !isRelation(family.kind)) {
      onWarn('[diagram] families の要素は parents（1 件以上）/ children / kind / groups が必要です');
      return null;
    }
    families.push({ parents, children, kind: family.kind, groups: familyGroups });
  }
  if (families.length === 0) {
    onWarn('[diagram] families が空です');
    return null;
  }
  const annotations = value.annotations === undefined ? {} : stringRecord(value.annotations);
  if (annotations === undefined) {
    onWarn('[diagram] annotations: 文字列の対応が必要です');
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
 * 断るのは描けない升目・上限超え・範囲外の刻み・**同じ升目の重なり**の 4 つ。
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
  if (errors.length > 0) return { ok: false, errors };
  // 既定と同じ刻みは持たない。持つと「既定を変えたのに古い既定が焼き付いた図」が残る。
  const layout: DiagramLayout = spacing === null || isDefaultDiagramSpacing(spacing)
    ? { placements: normalized }
    : { placements: normalized, spacing };
  return { ok: true, layout };
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
  const spacing = document.layout.spacing;
  const layout: DiagramLayout = spacing === undefined || isDefaultDiagramSpacing(spacing)
    ? { placements }
    : { placements, spacing };
  return `${JSON.stringify({
    version: 1,
    title: document.title,
    lead: document.lead,
    note: document.note,
    legend: document.legend,
    groups: document.groups,
    families: document.families,
    annotations: document.annotations,
    ...(isEmptyLayout(layout) ? {} : { layout }),
  }, null, 2)}\n`;
}

/** 新規作成の雛形。空の `families` は読み取りが断るので、最小の 1 件を入れて作る。 */
export function createEmptyDiagramDocument(title: string): DiagramDocument {
  return {
    version: 1,
    title,
    lead: '',
    note: '',
    legend: '実線は親子、点線は生成、破線は婚姻を表します。',
    groups: [],
    families: [{ parents: ['親'], children: ['子'], kind: 'birth', groups: {} }],
    annotations: {},
    layout: EMPTY_DIAGRAM_LAYOUT,
  };
}
