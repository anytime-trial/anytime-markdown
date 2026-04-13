import type { C4Element } from '../types';
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
 * component レベルの DsmMatrix を C4 component 単位に集約する。
 * code 要素の boundaryId（親 component の ID）でグループ化し、
 * component 間の依存関係を隣接行列で表現する。
 * C4 component に対応しないノードは個別ノードとして残す。
 */
export function aggregateDsmToC4ComponentLevel(
  matrix: DsmMatrix,
  elements: readonly C4Element[],
): DsmMatrix {
  if (matrix.nodes.length === 0) return matrix;

  // code 要素の ID → 親 component ID のマップを構築
  const fileToComponent = new Map<string, string>();
  const componentNameById = new Map<string, string>();
  for (const el of elements) {
    if (el.type === 'code' && el.boundaryId) {
      fileToComponent.set(el.id, el.boundaryId);
    }
    if (el.type === 'component') {
      componentNameById.set(el.id, el.name);
    }
  }

  // DSM ノードを component にマップ（対応なしは自身のIDを使用）
  const nodeToGroup = new Map<string, string>();
  const groupSet = new Set<string>();
  const groupNameById = new Map<string, string>();

  for (const node of matrix.nodes) {
    const compId = fileToComponent.get(node.id);
    if (compId) {
      nodeToGroup.set(node.id, compId);
      groupSet.add(compId);
      const name = componentNameById.get(compId);
      if (name) groupNameById.set(compId, name);
    } else {
      // C4 component に紐づかないファイルは個別ノードとして残す
      nodeToGroup.set(node.id, node.id);
      groupSet.add(node.id);
      groupNameById.set(node.id, node.name);
    }
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
