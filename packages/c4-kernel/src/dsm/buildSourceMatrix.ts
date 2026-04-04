import type { DsmMatrix, DsmNode, DsmEdge } from './types';
import * as path from 'node:path';

/** TrailGraph node subset needed for DSM */
interface TrailFileNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly filePath: string;
}

/** TrailGraph edge subset needed for DSM */
interface TrailImportEdge {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

/** Minimal TrailGraph interface to avoid direct dependency on trail-core */
interface TrailGraphLike {
  readonly nodes: readonly TrailFileNode[];
  readonly edges: readonly TrailImportEdge[];
}

/**
 * TrailGraph（ソースコード解析結果）からDSM隣接行列を生成する。
 */
export function buildSourceMatrix(
  graph: TrailGraphLike,
  level: 'component' | 'package',
): DsmMatrix {
  const fileNodes = graph.nodes.filter(n => n.type === 'file');
  const importEdges = graph.edges.filter(e => e.type === 'import');

  if (level === 'package') {
    return buildPackageLevel(fileNodes, importEdges);
  }
  return buildComponentLevel(fileNodes, importEdges);
}

function buildComponentLevel(
  fileNodes: readonly TrailFileNode[],
  importEdges: readonly TrailImportEdge[],
): DsmMatrix {
  const nodes: DsmNode[] = fileNodes.map(n => ({
    id: n.id,
    name: n.label,
    path: n.filePath,
    level: 'component' as const,
  }));

  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));
  const n = nodes.length;
  const adjacency = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const edges: DsmEdge[] = [];

  for (const e of importEdges) {
    const fi = idxMap.get(e.source);
    const ti = idxMap.get(e.target);
    if (fi === undefined || ti === undefined) continue;
    adjacency[fi][ti] = 1;
    edges.push({
      source: e.source,
      target: e.target,
      imports: [{ filePath: e.source, line: 0, specifier: e.target }],
    });
  }

  return { nodes, edges, adjacency };
}

function buildPackageLevel(
  fileNodes: readonly TrailFileNode[],
  importEdges: readonly TrailImportEdge[],
): DsmMatrix {
  const fileToPackage = new Map<string, string>();
  const packageSet = new Set<string>();

  for (const n of fileNodes) {
    const dir = path.dirname(n.filePath);
    fileToPackage.set(n.id, dir);
    packageSet.add(dir);
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
  const adjacency = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

  for (const e of importEdges) {
    const fromPkg = fileToPackage.get(e.source);
    const toPkg = fileToPackage.get(e.target);
    if (!fromPkg || !toPkg || fromPkg === toPkg) continue;
    const fi = idxMap.get(fromPkg);
    const ti = idxMap.get(toPkg);
    if (fi === undefined || ti === undefined) continue;
    adjacency[fi][ti] = 1;
  }

  return { nodes, edges: [], adjacency };
}
