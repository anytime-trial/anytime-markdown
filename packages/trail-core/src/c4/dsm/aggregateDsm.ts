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
