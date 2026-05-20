import type { C4Model } from './types';
import type {
  ConfidenceCouplingEdge,
  CouplingDirection,
  TemporalCouplingEdge,
} from '../temporalCoupling/types';

const FILE_PREFIX = 'file::';
const STRIPPABLE_EXT_RE = /\.(tsx?|mdx?)$/;

export interface C4GhostEdge {
  readonly source: string;
  readonly target: string;
  readonly jaccard: number;
  readonly coChangeCount: number;
  readonly direction?: CouplingDirection;
  readonly confidenceForward?: number;
  readonly confidenceBackward?: number;
}

type CouplingEdge = TemporalCouplingEdge | ConfidenceCouplingEdge;

type C4LevelNum = 1 | 2 | 3 | 4;

type Acc = {
  source: string;
  target: string;
  jaccard: number;
  coChangeCount: number;
  direction?: CouplingDirection;
  confidenceForward?: number;
  confidenceBackward?: number;
};

function stripExt(p: string): string {
  return p.replace(STRIPPABLE_EXT_RE, '');
}

function isDirectional(edge: CouplingEdge): edge is ConfidenceCouplingEdge {
  return 'direction' in edge;
}

/** file:: code 要素の拡張子なしパス → 要素 ID のマップを構築する。 */
function buildPathToId(c4Model: C4Model): Map<string, string> {
  const pathToId = new Map<string, string>();
  for (const el of c4Model.elements) {
    if (el.type !== 'code') continue;
    if (!el.id.startsWith(FILE_PREFIX)) continue;
    pathToId.set(stripExt(el.id.slice(FILE_PREFIX.length)), el.id);
  }
  return pathToId;
}

/** ConfidenceCouplingEdge 固有フィールドを Acc に付与する。 */
function applyDirectional(acc: Acc, e: ConfidenceCouplingEdge): void {
  acc.direction = e.direction;
  acc.confidenceForward = e.confidenceForward;
  acc.confidenceBackward = e.confidenceBackward;
}

/** 既存 Acc に新しいエッジで最大値更新を行う。 */
function mergeIntoAcc(prev: Acc, e: CouplingEdge): void {
  prev.jaccard = Math.max(prev.jaccard, e.jaccard);
  prev.coChangeCount += e.coChangeCount;
  if (isDirectional(e) && prev.confidenceForward !== undefined) {
    prev.confidenceForward = Math.max(prev.confidenceForward, e.confidenceForward);
    prev.confidenceBackward = Math.max(prev.confidenceBackward ?? 0, e.confidenceBackward);
  }
}

/** component 祖先 ID を上位ツリーを辿って返す。 */
function findComponentAncestor(
  codeElId: string,
  elementById: Map<string, C4Model['elements'][number]>,
): string | null {
  const visited = new Set<string>();
  let cur = elementById.get(codeElId)?.boundaryId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const el = elementById.get(cur);
    if (!el) return null;
    if (el.type === 'component') return el.id;
    cur = el.boundaryId;
  }
  return null;
}

/** file:: code 要素 → component 祖先 ID のマップを構築する。 */
function buildFileToComp(c4Model: C4Model): Map<string, string> {
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el]));
  const fileToComp = new Map<string, string>();
  for (const el of c4Model.elements) {
    if (el.type !== 'code') continue;
    if (!el.id.startsWith(FILE_PREFIX)) continue;
    const compId = findComponentAncestor(el.id, elementById);
    if (!compId) continue;
    fileToComp.set(stripExt(el.id.slice(FILE_PREFIX.length)), compId);
  }
  return fileToComp;
}

/** L4 (file) レベルの ghost edge 一覧を生成する。 */
function aggregateL4(
  edges: ReadonlyArray<CouplingEdge>,
  pathToId: Map<string, string>,
): C4GhostEdge[] {
  const result: C4GhostEdge[] = [];
  for (const e of edges) {
    const srcId = pathToId.get(stripExt(e.source));
    const tgtId = pathToId.get(stripExt(e.target));
    if (!srcId || !tgtId) continue;
    const base: C4GhostEdge = {
      source: srcId,
      target: tgtId,
      jaccard: e.jaccard,
      coChangeCount: e.coChangeCount,
    };
    if (isDirectional(e)) {
      result.push({
        ...base,
        direction: e.direction,
        confidenceForward: e.confidenceForward,
        confidenceBackward: e.confidenceBackward,
      });
    } else {
      result.push(base);
    }
  }
  return result;
}

/** L3 (component) レベルの ghost edge 一覧を生成する。 */
function aggregateL3(
  edges: ReadonlyArray<CouplingEdge>,
  fileToComp: Map<string, string>,
): C4GhostEdge[] {
  const aggMap = new Map<string, Acc>();
  for (const e of edges) {
    const compS = fileToComp.get(stripExt(e.source));
    const compT = fileToComp.get(stripExt(e.target));
    if (!compS || !compT || compS === compT) continue;

    const [a, b] = compS < compT ? [compS, compT] : [compT, compS];
    const key = `${a}|${b}`;
    const prev = aggMap.get(key);
    if (!prev) {
      const acc: Acc = { source: a, target: b, jaccard: e.jaccard, coChangeCount: e.coChangeCount };
      if (isDirectional(e)) applyDirectional(acc, e);
      aggMap.set(key, acc);
      continue;
    }
    mergeIntoAcc(prev, e);
  }

  return Array.from(aggMap.values()).sort((x, y) =>
    x.source !== y.source ? x.source.localeCompare(y.source) : x.target.localeCompare(y.target),
  );
}

export function aggregateGhostEdgesToC4(
  edges: ReadonlyArray<CouplingEdge>,
  c4Model: C4Model,
  level: C4LevelNum,
  selectedRepo: string | null,
): C4GhostEdge[] {
  void selectedRepo;
  if (level !== 3 && level !== 4) return [];
  if (edges.length === 0) return [];

  const pathToId = buildPathToId(c4Model);

  if (level === 4) {
    return aggregateL4(edges, pathToId);
  }

  // level === 3
  const fileToComp = buildFileToComp(c4Model);
  return aggregateL3(edges, fileToComp);
}
