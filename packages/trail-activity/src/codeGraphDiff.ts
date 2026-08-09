import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from './codeGraph';

/**
 * 2 時点のコードグラフの差分。State Replay の着色に使う。
 *
 * 判定に使うのは **ノード ID とエッジの `(source, target)` 対だけ**である。
 * 座標・community・size は解析のたびに変わるため使わない（2026-08-04 実測: v1.18.0 → v1.19.1 の
 * 共通 2072 ノードのうち座標は 2072 件、community は 1366 件が変化した。これらを判定に混ぜると
 * 全ノードが「変更」に落ちて差分表示が成立しない）。仕様は
 * `spec/31.trail/02.trail-viewer/state-replay/state-replay.ja.md` §2.3。
 */
export type CodeGraphNodeDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface CodeGraphDiffCounts {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
}

export interface CodeGraphDiff {
  /** ノード ID → 区分。削除ノードも含む（描画側が 1 回の lookup で色を決められるようにする）。 */
  readonly status: ReadonlyMap<string, CodeGraphNodeDiffStatus>;
  readonly addedNodeIds: readonly string[];
  /**
   * 削除ノードは対象グラフに存在しないため、ゴースト描画にはベースライン側の実体が要る
   * （座標を借りるため ID だけでは足りない）。
   */
  readonly removedNodes: readonly CodeGraphNode[];
  readonly changedNodeIds: readonly string[];
  readonly addedEdges: readonly CodeGraphEdge[];
  readonly removedEdges: readonly CodeGraphEdge[];
  readonly counts: CodeGraphDiffCounts;
}

/** エッジの同一性キー。`confidence` 系は解析ごとに揺れる推定値なので含めない。 */
function edgeKey(edge: Pick<CodeGraphEdge, 'source' | 'target'>): string {
  return `${edge.source} ${edge.target}`;
}

function indexEdges(edges: readonly CodeGraphEdge[]): Map<string, CodeGraphEdge> {
  const byKey = new Map<string, CodeGraphEdge>();
  for (const edge of edges) {
    const key = edgeKey(edge);
    if (!byKey.has(key)) byKey.set(key, edge);
  }
  return byKey;
}

/**
 * ノード ID → 接続の集合。方向を区別するため、出辺は `>target`、入辺は `<source` で表す
 * （`a → b` と `b → a` を同じ接続として扱わないため）。
 */
function indexNeighbours(edges: Iterable<CodeGraphEdge>): Map<string, Set<string>> {
  const byNode = new Map<string, Set<string>>();
  const bucket = (id: string): Set<string> => {
    let set = byNode.get(id);
    if (!set) {
      set = new Set<string>();
      byNode.set(id, set);
    }
    return set;
  };
  for (const edge of edges) {
    bucket(edge.source).add(`>${edge.target}`);
    bucket(edge.target).add(`<${edge.source}`);
  }
  return byNode;
}

const EMPTY_NEIGHBOURS: ReadonlySet<string> = new Set<string>();

function sameNeighbours(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * ベースラインから対象時点への差分を取る。
 *
 * @param baseline 1 つ前の時点のグラフ
 * @param target 表示中の時点のグラフ
 */
export function diffCodeGraphs(baseline: CodeGraph, target: CodeGraph): CodeGraphDiff {
  const baselineNodes = new Map(baseline.nodes.map((n) => [n.id, n]));
  const targetIds = new Set(target.nodes.map((n) => n.id));

  const baselineEdges = indexEdges(baseline.edges);
  const targetEdges = indexEdges(target.edges);
  const baselineNeighbours = indexNeighbours(baselineEdges.values());
  const targetNeighbours = indexNeighbours(targetEdges.values());

  const status = new Map<string, CodeGraphNodeDiffStatus>();
  const addedNodeIds: string[] = [];
  const changedNodeIds: string[] = [];
  let unchanged = 0;

  for (const node of target.nodes) {
    if (!baselineNodes.has(node.id)) {
      status.set(node.id, 'added');
      addedNodeIds.push(node.id);
      continue;
    }
    const before = baselineNeighbours.get(node.id) ?? EMPTY_NEIGHBOURS;
    const after = targetNeighbours.get(node.id) ?? EMPTY_NEIGHBOURS;
    if (sameNeighbours(before, after)) {
      status.set(node.id, 'unchanged');
      unchanged++;
    } else {
      status.set(node.id, 'changed');
      changedNodeIds.push(node.id);
    }
  }

  const removedNodes: CodeGraphNode[] = [];
  for (const node of baseline.nodes) {
    if (targetIds.has(node.id)) continue;
    status.set(node.id, 'removed');
    removedNodes.push(node);
  }

  const addedEdges: CodeGraphEdge[] = [];
  for (const [key, edge] of targetEdges) {
    if (!baselineEdges.has(key)) addedEdges.push(edge);
  }
  const removedEdges: CodeGraphEdge[] = [];
  for (const [key, edge] of baselineEdges) {
    if (!targetEdges.has(key)) removedEdges.push(edge);
  }

  return {
    status,
    addedNodeIds,
    removedNodes,
    changedNodeIds,
    addedEdges,
    removedEdges,
    counts: {
      added: addedNodeIds.length,
      removed: removedNodes.length,
      changed: changedNodeIds.length,
      unchanged,
    },
  };
}
