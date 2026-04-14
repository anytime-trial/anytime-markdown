import type { C4Element, C4ElementType } from '../types';
import type { DsmMatrix, DsmNode } from './types';

/** ブラウザ対応の dirname（node:path 不使用） */
function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx < 0 ? '.' : p.slice(0, idx);
}

/**
 * component レベルの DsmMatrix をパッケージ（ディレクトリ）レベルに集約する。
 * すでに package レベルの場合はそのまま返す。
 */
export function aggregateDsmToPackageLevel(matrix: DsmMatrix): DsmMatrix {
  if (matrix.nodes.length === 0) return matrix;
  if (matrix.nodes[0].level === 'package') return matrix;

  const fileToPackage = new Map<string, string>();
  const packageSet = new Set<string>();

  for (const node of matrix.nodes) {
    const pkg = dirnameOf(node.path);
    fileToPackage.set(node.id, pkg);
    packageSet.add(pkg);
  }

  const sortedPackages = [...packageSet].sort();
  const nodes: DsmNode[] = sortedPackages.map(p => ({
    id: p,
    name: p,
    path: p,
    level: 'package' as const,
  }));

  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));
  const n = nodes.length;
  const adjacency: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );

  const srcLen = matrix.nodes.length;
  for (let i = 0; i < srcLen; i++) {
    for (let j = 0; j < srcLen; j++) {
      if (matrix.adjacency[i][j] !== 1) continue;
      const fromPkg = fileToPackage.get(matrix.nodes[i].id);
      const toPkg = fileToPackage.get(matrix.nodes[j].id);
      if (!fromPkg || !toPkg || fromPkg === toPkg) continue;
      const fi = idxMap.get(fromPkg);
      const ti = idxMap.get(toPkg);
      if (fi === undefined || ti === undefined) continue;
      adjacency[fi][ti] = 1;
    }
  }

  return { nodes, edges: [], adjacency };
}

/**
 * DSM ノード（ファイル）を C4 要素階層で辿り、targetTypes のいずれかに
 * 該当する祖先要素でグループ化して集約する汎用関数。
 * 対応する祖先が見つからないノードは個別ノードとして残す。
 */
function aggregateDsmByC4Ancestors(
  matrix: DsmMatrix,
  elements: readonly C4Element[],
  targetTypes: ReadonlySet<C4ElementType>,
): DsmMatrix {
  if (matrix.nodes.length === 0) return matrix;

  const elementById = new Map<string, C4Element>();
  for (const el of elements) {
    elementById.set(el.id, el);
  }

  function findAncestor(id: string): string | null {
    let current = elementById.get(id);
    while (current) {
      if (targetTypes.has(current.type)) return current.id;
      if (!current.boundaryId) return null;
      current = elementById.get(current.boundaryId);
    }
    return null;
  }

  const nodeToGroup = new Map<string, string>();
  const groupSet = new Set<string>();
  const groupNameById = new Map<string, string>();

  for (const node of matrix.nodes) {
    const ancestor = findAncestor(node.id);
    if (ancestor) {
      nodeToGroup.set(node.id, ancestor);
      groupSet.add(ancestor);
      const el = elementById.get(ancestor);
      if (el) groupNameById.set(ancestor, el.name);
    }
    // C4 階層に祖先が見つからないノードは集約対象外（L4 のみで表示）
  }

  const sortedGroups = [...groupSet].sort((a, b) =>
    (groupNameById.get(a) ?? a).localeCompare(groupNameById.get(b) ?? b),
  );

  const nodes: DsmNode[] = sortedGroups.map(id => ({
    id,
    name: groupNameById.get(id) ?? id,
    path: id,
    level: 'component' as const,
  }));

  const idxMap = new Map(nodes.map((node, i) => [node.id, i]));
  const n = nodes.length;
  const adjacency: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );

  const srcLen = matrix.nodes.length;
  for (let i = 0; i < srcLen; i++) {
    for (let j = 0; j < srcLen; j++) {
      if (matrix.adjacency[i][j] !== 1) continue;
      const fromGroup = nodeToGroup.get(matrix.nodes[i].id);
      const toGroup = nodeToGroup.get(matrix.nodes[j].id);
      if (!fromGroup || !toGroup || fromGroup === toGroup) continue;
      const fi = idxMap.get(fromGroup);
      const ti = idxMap.get(toGroup);
      if (fi === undefined || ti === undefined) continue;
      adjacency[fi][ti] = 1;
    }
  }

  return { nodes, edges: [], adjacency };
}

/** L3 用: C4 component 単位で集約 */
export function aggregateDsmToC4ComponentLevel(
  matrix: DsmMatrix,
  elements: readonly C4Element[],
): DsmMatrix {
  return aggregateDsmByC4Ancestors(matrix, elements, new Set<C4ElementType>(['component']));
}

/** L2 用: C4 container / containerDb 単位で集約 */
export function aggregateDsmToC4ContainerLevel(
  matrix: DsmMatrix,
  elements: readonly C4Element[],
): DsmMatrix {
  return aggregateDsmByC4Ancestors(matrix, elements, new Set<C4ElementType>(['container', 'containerDb']));
}

/** L1 用: C4 system 単位で集約 */
export function aggregateDsmToC4SystemLevel(
  matrix: DsmMatrix,
  elements: readonly C4Element[],
): DsmMatrix {
  return aggregateDsmByC4Ancestors(matrix, elements, new Set<C4ElementType>(['system']));
}

/**
 * DsmMatrix のノードを path 昇順に並び替え、隣接行列も対応させる。
 * path でソートすることで、同一ディレクトリのノードが隣接しつつ
 * グループ（親）自体も昇順に並ぶ。
 */
export function sortDsmMatrixByName(matrix: DsmMatrix): DsmMatrix {
  const n = matrix.nodes.length;
  if (n === 0) return matrix;

  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => matrix.nodes[a].path.localeCompare(matrix.nodes[b].path));

  const nodes = order.map(i => matrix.nodes[i]);

  const posOf = new Array<number>(n);
  for (let pos = 0; pos < n; pos++) {
    posOf[order[pos]] = pos;
  }

  const adjacency: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (matrix.adjacency[i][j] === 1) {
        adjacency[posOf[i]][posOf[j]] = 1;
      }
    }
  }

  const edges = matrix.edges.map(e => ({ ...e }));

  return { nodes, edges, adjacency };
}

/** 指定IDセットに含まれるノードのみ残して行列を再構築する */
export function filterDsmMatrix(matrix: DsmMatrix, nodeIds: ReadonlySet<string>): DsmMatrix {
  const keepIndices: number[] = [];
  matrix.nodes.forEach((n, i) => { if (nodeIds.has(n.id)) keepIndices.push(i); });
  const nodes = keepIndices.map(i => matrix.nodes[i]);
  const adjacency = keepIndices.map(ri => keepIndices.map(ci => matrix.adjacency[ri][ci]));
  return { nodes, edges: matrix.edges, adjacency };
}
