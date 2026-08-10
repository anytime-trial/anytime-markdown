// packages/trail-activity/src/c4/functionGraph/filterTrailGraphByElement.ts
import type { TrailGraph, TrailNode } from '@anytime-markdown/code-analysis-core/model';

import type { C4Element, C4Model } from '../types';
import type {
  FunctionGraphEdge,
  FunctionGraphNode,
  FunctionGraphResponse,
} from './types';

/**
 * code 要素 1 つから filePath 集合を解決する内部ヘルパー。
 * 2 経路で候補を得る:
 *   - elementId が file ノード id と一致する場合
 *   - elementId 自体を filePath として扱う (codeGraphToC4 の生成規則)
 */
function resolveCodeFilePaths(
  element: C4Element,
  graph: TrailGraph,
  out: Set<string>,
): void {
  const fileNode = graph.nodes.find((n) => n.id === element.id && n.type === 'file');
  if (fileNode) out.add(fileNode.filePath);
  for (const n of graph.nodes) {
    if (n.filePath === element.id) out.add(n.filePath);
  }
}

/**
 * C4 要素 (Phase 1: type='code', Phase 2: 'component') からスコープ対象の filePath 集合を解決する。
 * その他の type (system / container / containerDb) では空集合を返す。
 */
function resolveTargetFilePaths(
  element: C4Element,
  model: C4Model,
  graph: TrailGraph,
): Set<string> {
  const out = new Set<string>();
  if (element.type === 'code') {
    resolveCodeFilePaths(element, graph, out);
    return out;
  }
  if (element.type === 'component') {
    // component 配下の code 子要素を boundaryId 一致で収集し、各 code 要素から filePath を解決
    for (const child of model.elements) {
      if (child.boundaryId !== element.id || child.type !== 'code') continue;
      resolveCodeFilePaths(child, graph, out);
    }
    return out;
  }
  return out;
}

/** F = 対象ファイル配下の function ノード集合 */
function collectInternalFunctions(
  graph: TrailGraph,
  targetFilePaths: ReadonlySet<string>,
): { nodes: TrailNode[]; ids: Set<string> } {
  const nodes: TrailNode[] = [];
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (n.type === 'function' && targetFilePaths.has(n.filePath)) {
      nodes.push(n);
      ids.add(n.id);
    }
  }
  return { nodes, ids };
}

/** call エッジ走査で持ち回る可変状態（呼び出し先での更新を捨てないよう 1 オブジェクトに束ねる） */
type CallEdgeScanState = {
  internalFnIds: ReadonlySet<string>;
  nodeById: ReadonlyMap<string, TrailNode>;
  /** dedup は source+target で行う */
  seen: Set<string>;
  edges: FunctionGraphEdge[];
  externalOut: Map<string, TrailNode>;
  externalIn: Map<string, TrailNode>;
};

/**
 * エッジ 1 本を走査結果へ反映する（call のみ・内部関数に接するもののみ）。
 * 外部ノードは external (out 先) と external_caller (in 元) に分けて集める。
 */
function applyCallEdge(state: CallEdgeScanState, e: TrailGraph['edges'][number]): void {
  if (e.type !== 'call') return;
  const srcInternal = state.internalFnIds.has(e.source);
  const dstInternal = state.internalFnIds.has(e.target);
  if (!srcInternal && !dstInternal) return;

  const key = `${e.source}\0${e.target}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  state.edges.push({ source: e.source, target: e.target });

  if (srcInternal && !dstInternal) {
    const ext = state.nodeById.get(e.target);
    if (ext) state.externalOut.set(e.target, ext);
  } else if (!srcInternal && dstInternal) {
    const ext = state.nodeById.get(e.source);
    if (ext) state.externalIn.set(e.source, ext);
  }
}

/** エッジ収集 (call のみ) と外部ノード収集をまとめて行う。 */
function scanCallEdges(
  graph: TrailGraph,
  internalFnIds: ReadonlySet<string>,
): Pick<CallEdgeScanState, 'edges' | 'externalOut' | 'externalIn'> {
  const nodeById = new Map<string, TrailNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const state: CallEdgeScanState = {
    internalFnIds,
    nodeById,
    seen: new Set<string>(),
    edges: [],
    externalOut: new Map<string, TrailNode>(),
    externalIn: new Map<string, TrailNode>(),
  };
  for (const e of graph.edges) applyCallEdge(state, e);
  return { edges: state.edges, externalOut: state.externalOut, externalIn: state.externalIn };
}

/** external 優先 dedup。external (out 先) を優先し、external_caller (in 元) は重複しない場合のみ */
function buildExternalNodes(
  externalOut: ReadonlyMap<string, TrailNode>,
  externalIn: ReadonlyMap<string, TrailNode>,
): FunctionGraphNode[] {
  const externals: FunctionGraphNode[] = [];
  for (const [id, n] of externalOut) {
    externals.push({
      id,
      label: n.label,
      filePath: n.filePath,
      line: n.line,
      kind: 'external',
    });
  }
  for (const [id, n] of externalIn) {
    if (externalOut.has(id)) continue;
    externals.push({
      id,
      label: n.label,
      filePath: n.filePath,
      line: n.line,
      kind: 'external_caller',
    });
  }
  return externals;
}

/**
 * TrailGraph を C4 要素 (Phase 1: type='code', Phase 2: 'component' も対応) のファイル範囲でフィルタし、
 * 関数ノード + call エッジを返す。
 * 外部呼び出しは external / external_caller プレースホルダノードで保持。
 * 同一 external ノードは「呼び出し先 (external)」を優先し dedup する。
 */
export function filterTrailGraphByElement(
  graph: TrailGraph,
  elementId: string,
  model: C4Model,
): FunctionGraphResponse {
  const element = model.elements.find((e) => e.id === elementId);
  if (!element || (element.type !== 'code' && element.type !== 'component')) {
    return { elementId, nodes: [], edges: [] };
  }

  const targetFilePaths = resolveTargetFilePaths(element, model, graph);

  if (targetFilePaths.size === 0) {
    return { elementId, nodes: [], edges: [] };
  }

  const { nodes: internalFnNodes, ids: internalFnIds } = collectInternalFunctions(
    graph,
    targetFilePaths,
  );

  if (internalFnNodes.length === 0) {
    return { elementId, nodes: [], edges: [] };
  }

  const internalNodes: FunctionGraphNode[] = internalFnNodes.map((n) => ({
    id: n.id,
    label: n.label,
    filePath: n.filePath,
    line: n.line,
    kind: 'function' as const,
  }));

  const { edges, externalOut, externalIn } = scanCallEdges(graph, internalFnIds);
  const externals = buildExternalNodes(externalOut, externalIn);

  return {
    elementId,
    nodes: [...internalNodes, ...externals],
    edges,
  };
}
