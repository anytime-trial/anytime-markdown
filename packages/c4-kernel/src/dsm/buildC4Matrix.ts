import type { C4Model, BoundaryInfo } from '../types';
import type { DsmMatrix, DsmNode } from './types';

/**
 * C4モデルからDSM隣接行列を生成する。
 * @param model C4モデル
 * @param level 粒度（component: 要素単位、package: 境界単位）
 * @param boundaries 境界情報（packageレベル時に必要）
 */
export function buildC4Matrix(
  model: C4Model,
  level: 'component' | 'package',
  boundaries?: readonly BoundaryInfo[],
): DsmMatrix {
  if (level === 'package' && boundaries) {
    return buildPackageMatrix(model, boundaries);
  }
  return buildComponentMatrix(model);
}

function buildComponentMatrix(model: C4Model): DsmMatrix {
  const nodes: DsmNode[] = model.elements.map(e => ({
    id: e.id,
    name: e.name,
    path: e.id,
    level: 'component' as const,
  }));

  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));
  const n = nodes.length;
  const adjacency = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

  const edges = model.relationships.flatMap(r => {
    const fi = idxMap.get(r.from);
    const ti = idxMap.get(r.to);
    if (fi === undefined || ti === undefined) return [];
    adjacency[fi][ti] = 1;
    if (r.bidirectional) adjacency[ti][fi] = 1;
    return [{
      source: r.from,
      target: r.to,
      imports: [] as const,
    }];
  });

  return { nodes, edges, adjacency };
}

function buildPackageMatrix(
  model: C4Model,
  boundaries: readonly BoundaryInfo[],
): DsmMatrix {
  const nodes: DsmNode[] = boundaries.map(b => ({
    id: b.id,
    name: b.name,
    path: b.id,
    level: 'package' as const,
  }));

  const elementToBoundary = new Map<string, string>();
  for (const el of model.elements) {
    if (el.boundaryId) elementToBoundary.set(el.id, el.boundaryId);
  }

  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));
  const n = nodes.length;
  const adjacency = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

  for (const r of model.relationships) {
    const fromBoundary = elementToBoundary.get(r.from);
    const toBoundary = elementToBoundary.get(r.to);
    if (!fromBoundary || !toBoundary || fromBoundary === toBoundary) continue;
    const fi = idxMap.get(fromBoundary);
    const ti = idxMap.get(toBoundary);
    if (fi === undefined || ti === undefined) continue;
    adjacency[fi][ti] = 1;
    if (r.bidirectional) adjacency[ti][fi] = 1;
  }

  return { nodes, edges: [], adjacency };
}
