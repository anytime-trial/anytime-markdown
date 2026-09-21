/**
 * 自動配置と関係線の組み立て。
 *
 * 自動配置（`layoutDiagram`）・刻みの適用（`applyDiagramSpacing`）・配置差分の適用
 * （`applyDiagramPlacements`）を**分けてある**。1 つにすると、差分が変わるたび（＝ドラッグの
 * 1 フレームごと）に人物数ぶんの並べ替えまでやり直すことになる。
 *
 * 移植元は anytime-travel の `src/map/genealogy-layout.ts`。
 */

import {
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_MARGIN as MARGIN,
  cellPosition,
  columnPitch,
  isDefaultDiagramSpacing,
  rowPitch,
} from './spacing';
import type { DiagramFamily, DiagramLayout, DiagramSpacing } from './types';

export interface ChartNode {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /**
   * 世代（列の番号）。x は刻みで変わるが、この番号は変わらない。
   *
   * 刻みを変えるたびに並べ替えをやり直さずに済むよう列の番号を残しておき、
   * `applyDiagramSpacing` が x を引き直す。
   */
  readonly column: number;
  /**
   * 列の中で上から何番目の升目か。
   *
   * 人の並び順ではなく**升目の番号**なので、間を空けた行のぶんだけ飛ぶ。y = 余白 + 行 × 行の間隔。
   */
  readonly row: number;
}

export interface ChartEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'birth' | 'creation' | 'oath' | 'spouse';
}

export interface ConnectorPoint {
  readonly x: number;
  readonly y: number;
  readonly kind: 'parent' | 'child' | 'junction';
}

/** 升目にする前、結び付き 1 本あたりに足していた余白（px）。閾値の導出にだけ残す。 */
const CROWDING_PER_FAMILY = 22;

/**
 * この本数以上の家族に出てくる人物の下は 1 行あける。
 *
 * 結び付きの多い人物は線が集まるので、詰めると親子線が隣の人物の箱に重なって読めない。
 * かつては結び付き数 × 22px を足していたが、升目に載せるため行数へ丸めた。
 */
const CROWDED_DEGREE = Math.ceil(rowPitch(DEFAULT_DIAGRAM_SPACING) / 2 / CROWDING_PER_FAMILY);

/**
 * 家族 1 件の線。子は両親を結ぶ線の中点から 1 本の縦線で降ろす。
 *
 * `spacing` に既定値を置かない。線の取り付き位置は箱の右辺と上下の辺で決まるので、刻みが可変に
 * なった以上**渡し忘れると線だけが箱からずれた図が黙って描かれる**。既定の刻みで描くテストは
 * 全部緑のまま通るため、渡し忘れを鳴らせるのは型検査だけになる。
 */
export function familyConnector(
  family: DiagramFamily,
  nodes: ReadonlyMap<string, ChartNode>,
  options: { readonly lane?: number; readonly spacing: DiagramSpacing },
) {
  const { lane = 0, spacing } = options;
  const { nodeWidth, nodeHeight } = spacing;
  const first = nodes.get(family.parents[0]!)!;
  const second = family.parents[1] === undefined ? undefined : nodes.get(family.parents[1]);
  const firstY = first.y + nodeHeight / 2;
  const junction = second === undefined
    ? { x: first.x + nodeWidth, y: firstY }
    : (() => {
      const secondY = second.y + nodeHeight / 2;
      const horizontal = Math.abs(first.x - second.x) >= Math.abs(first.y - second.y);
      const firstAnchor = horizontal
        ? { x: first.x + (first.x < second.x ? nodeWidth : 0), y: firstY }
        : { x: first.x + nodeWidth / 2, y: first.y + (first.y < second.y ? nodeHeight : 0) };
      const secondAnchor = horizontal
        ? { x: second.x + (second.x < first.x ? nodeWidth : 0), y: secondY }
        : { x: second.x + nodeWidth / 2, y: second.y + (second.y < first.y ? nodeHeight : 0) };
      return {
        x: (firstAnchor.x + secondAnchor.x) / 2 + lane * 14,
        y: (firstAnchor.y + secondAnchor.y) / 2,
        firstAnchor,
        secondAnchor,
      };
    })();
  const marriage = second === undefined || !('firstAnchor' in junction)
    ? null
    : `M ${junction.firstAnchor.x} ${junction.firstAnchor.y} H ${junction.x} V ${junction.secondAnchor.y} H ${junction.secondAnchor.x}`;
  const children = family.children.map((name) => nodes.get(name)!);
  const busX = junction.x + 18;
  const childYs = children.map((child) => child.y + nodeHeight / 2);
  const descent = children.length === 0 ? null : [
    `M ${junction.x} ${junction.y} H ${busX}`,
    `M ${busX} ${Math.min(junction.y, ...childYs)} V ${Math.max(junction.y, ...childYs)}`,
    ...children.map((child) => `M ${busX} ${child.y + nodeHeight / 2} H ${child.x}`),
  ].join(' ');
  const points: ConnectorPoint[] = [];
  if (second !== undefined && 'firstAnchor' in junction) {
    points.push({ ...junction.firstAnchor, kind: 'parent' }, { ...junction.secondAnchor, kind: 'parent' });
  } else if (children.length > 0) {
    points.push({ x: first.x + nodeWidth, y: firstY, kind: 'parent' });
  }
  if (children.length > 0) {
    points.push({ x: junction.x, y: junction.y, kind: 'junction' });
    for (const child of children) points.push({ x: child.x, y: child.y + nodeHeight / 2, kind: 'child' });
  }
  return { junction, marriage, descent, points };
}

/**
 * 人物 1 人につき 1 つの節。世代は**親子の向きだけ**で決まり、配偶は循環を作らない。
 *
 * **配置差分はここでは扱わない**（`applyDiagramPlacements` が後から当てる）。差分を先に当てて
 * 並べ替えの入力にすると、動かした 1 人が同じ列の全員の行をずらす。
 */
export function layoutDiagram(families: readonly DiagramFamily[]) {
  const names = [...new Set(families.flatMap((f) => [...f.parents, ...f.children]))];
  const parents = new Map(names.map((name) => [name, new Set<string>()]));
  for (const f of families) for (const child of f.children) for (const parent of f.parents) parents.get(child)!.add(parent);
  const ranks = new Map<string, number>();
  const visiting = new Set<string>();
  function rank(name: string): number {
    if (ranks.has(name)) return ranks.get(name)!;
    if (visiting.has(name)) throw new Error(`Cyclic diagram: ${name}`);
    visiting.add(name);
    const value = Math.max(0, ...[...parents.get(name)!].map((parent) => rank(parent) + 1));
    visiting.delete(name);
    ranks.set(name, value);
    return value;
  }
  names.forEach(rank);
  // 系譜の記録が無い配偶者は、既知の相手の隣に置く（左端の根へ落とさない）。落とすと子が
  // 長い斜めの線で結ばれ、同世代に見えなくなる。
  function alignSpouses(): boolean {
    let changed = false;
    for (const family of families) {
      if (family.parents.length !== 2) continue;
      const [left, right] = family.parents;
      const leftHasParents = parents.get(left!)!.size > 0;
      const rightHasParents = parents.get(right!)!.size > 0;
      if (!leftHasParents && rightHasParents && ranks.get(left!) !== ranks.get(right!)) {
        ranks.set(left!, ranks.get(right!)!);
        changed = true;
      }
      if (!rightHasParents && leftHasParents && ranks.get(right!) !== ranks.get(left!)) {
        ranks.set(right!, ranks.get(left!)!);
        changed = true;
      }
    }
    return changed;
  }
  // 配偶者の揃えは**相手に記録がある**ときしか効かない。両方とも記録が無いと、どちらも動かず
  // 片方が原点の列に取り残される。記録の無い親を、子の列が決まった後に 1 列だけ手前へ引く。
  // 2 親の家族に限るのは、単親の儀礼（1 人だけの家族）まで子の列へ引きずらないため。
  function pullParentlessToChildren(): boolean {
    let changed = false;
    for (const family of families) {
      if (family.parents.length !== 2 || family.children.length === 0) continue;
      for (const parent of family.parents) {
        if (parents.get(parent)!.size > 0) continue;
        const target = Math.min(...family.children.map((child) => ranks.get(child)!)) - 1;
        if (target > ranks.get(parent)!) {
          ranks.set(parent, target);
          changed = true;
        }
      }
    }
    return changed;
  }
  function applyGenerationConstraint(): boolean {
    let changed = false;
    for (const family of families) {
      const parentRank = Math.max(...family.parents.map((parent) => ranks.get(parent)!));
      for (const child of family.children) {
        const next = Math.max(ranks.get(child)!, parentRank + 1);
        if (next !== ranks.get(child)!) {
          ranks.set(child, next);
          changed = true;
        }
      }
    }
    return changed;
  }
  // 3 つの規則を毎回まとめて回し、1 巡して何も変わらなくなったら止める（人物数で上限を切り、
  // 収束しない入力でも必ず終わる）。
  for (let pass = 0; pass < names.length; pass += 1) {
    const spouseChanged = alignSpouses();
    const pullChanged = pullParentlessToChildren();
    const constraintChanged = applyGenerationConstraint();
    if (!spouseChanged && !pullChanged && !constraintChanged) break;
  }
  // 連結成分。同じ系統をまとめて並べ、系統の切れ目で 1 行あけるのに使う。
  const component = new Map<string, string>(names.map((name) => [name, name]));
  const find = (name: string): string => {
    const parent = component.get(name)!;
    if (parent === name) return name;
    const root = find(parent);
    component.set(name, root);
    return root;
  };
  const join = (left: string, right: string): void => {
    const a = find(left);
    const b = find(right);
    if (a === b) return;
    if (a < b) component.set(b, a);
    else component.set(a, b);
  };
  for (const family of families) {
    const all = [...family.parents, ...family.children];
    for (const name of all.slice(1)) join(all[0]!, name);
  }
  // 結び付きの多い人物は離して置く。一定の行間だと、子や配偶の多い家族が同じ縦横の車線を
  // 共有して線が重なる。
  const groups = new Map<number, string[]>();
  for (const name of names) {
    const column = ranks.get(name)!;
    const group = groups.get(column) ?? [];
    group.push(name);
    groups.set(column, group);
  }
  const degree = (name: string): number => families.reduce((count, family) => count
    + (family.parents.includes(name) || family.children.includes(name) ? 1 : 0), 0);
  const automatic: ChartNode[] = [];
  for (const [column, group] of groups) {
    // 並びは**序数比較**で決める。`localeCompare` を混ぜると、同じデータでも環境の照合順で
    // 並びが変わり、保存された升目の番号が指す人物が入れ替わる。
    group.sort((left, right) => (find(left) < find(right) ? -1 : find(left) > find(right) ? 1 : 0)
      || degree(right) - degree(left)
      || (left < right ? -1 : left > right ? 1 : 0));
    // 自動配置も**升目の上にだけ置く**。余白を px で足していた頃は、手で動かせる場所（升目）と
    // 自動で置かれる場所が食い違い、「置ける所」を塗って示せなかった。余白は行数で表す。
    let row = 0;
    let previousComponent = '';
    for (const name of group) {
      const currentComponent = find(name);
      if (previousComponent !== '' && previousComponent !== currentComponent) row += 1;
      automatic.push({
        name,
        column,
        row,
        x: MARGIN + column * columnPitch(DEFAULT_DIAGRAM_SPACING),
        y: MARGIN + row * rowPitch(DEFAULT_DIAGRAM_SPACING),
      });
      row += 1 + (degree(name) >= CROWDED_DEGREE ? 1 : 0);
      previousComponent = currentComponent;
    }
  }
  const edges: ChartEdge[] = [];
  const seen = new Set<string>();
  function edge(from: string, to: string, kind: ChartEdge['kind']) {
    const key = JSON.stringify([from, to, kind]);
    if (!seen.has(key)) {
      edges.push({ from, to, kind });
      seen.add(key);
    }
  }
  for (const f of families) {
    if (f.parents.length === 2) edge(f.parents[0]!, f.parents[1]!, 'spouse');
    for (const parent of f.parents) for (const child of f.children) edge(parent, child, f.kind);
  }
  return { nodes: automatic, edges, automatic: new Map(automatic.map((node) => [node.name, node])) };
}

/** 自動配置の図（差分を当てる前）。刻みの適用も差分の適用も、この形を受けてこの形を返す。 */
export interface AutomaticChart {
  readonly nodes: readonly ChartNode[];
  readonly edges: readonly ChartEdge[];
  readonly automatic: ReadonlyMap<string, ChartNode>;
}

/**
 * 刻みを当てた自動配置。列・行の番号から座標を引き直すだけで、並べ替えはやり直さない。
 *
 * 既定の刻みならそのまま返す（触っていない図で写像を 1 回増やさない）。
 */
export function applyDiagramSpacing(
  chart: AutomaticChart,
  spacing: DiagramSpacing = DEFAULT_DIAGRAM_SPACING,
): AutomaticChart {
  // 「既定か」の判定は共有の 1 つを読む。ここで項目を並べ直すと、刻みに項目を足した日に
  // この行だけが古い項目数で通り、取っ手を動かしても x が引き直されない沈黙した破れになる。
  if (isDefaultDiagramSpacing(spacing)) return chart;
  const column = columnPitch(spacing);
  const row = rowPitch(spacing);
  const nodes = chart.nodes.map((node) => ({
    ...node,
    x: MARGIN + node.column * column,
    y: MARGIN + node.row * row,
  }));
  return { nodes, edges: chart.edges, automatic: new Map(nodes.map((node) => [node.name, node])) };
}

export interface PlacedChart {
  readonly nodes: readonly ChartNode[];
  readonly edges: readonly ChartEdge[];
  /** 自動配置の座標。「自動配置に戻す」が戻し先として読む。 */
  readonly automatic: ReadonlyMap<string, ChartNode>;
  readonly width: number;
  readonly height: number;
}

/**
 * 自動配置へ差分を当てた図。
 *
 * 差分は**升目の番号**なので、ここで刻みを当てて座標へ直す。刻みを変えても手で置いた人物が
 * 升目に載ったままなのは、px でなく番号を持っているため。
 */
export function applyDiagramPlacements(
  chart: AutomaticChart,
  overrides: DiagramLayout | null = null,
): PlacedChart {
  const placements = overrides?.placements ?? {};
  const spacing = overrides?.spacing ?? DEFAULT_DIAGRAM_SPACING;
  const { nodeWidth, nodeHeight } = spacing;
  const nodes: readonly ChartNode[] = [...chart.automatic.values()].map((node) => {
    const placement = placements[node.name];
    if (placement === undefined) return node;
    // 升目の番号は差分のものへ差し替える（自動配置の番号ではなく、いま居る升目を表すため）。
    return { ...node, column: placement.column, row: placement.row, ...cellPosition(spacing, placement) };
  });
  return {
    nodes,
    edges: chart.edges,
    automatic: chart.automatic,
    width: Math.max(...nodes.map((n) => n.x + nodeWidth)) + MARGIN,
    height: Math.max(...nodes.map((n) => n.y + nodeHeight)) + MARGIN,
  };
}

/** 自動配置・刻み・差分の適用を続けて行う（テストと、差分を持たない呼び出し向け）。 */
export function diagramChart(
  families: readonly DiagramFamily[],
  overrides: DiagramLayout | null = null,
): PlacedChart {
  return applyDiagramPlacements(applyDiagramSpacing(layoutDiagram(families), overrides?.spacing), overrides);
}
