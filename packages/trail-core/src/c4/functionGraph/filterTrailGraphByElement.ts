// packages/trail-core/src/c4/functionGraph/filterTrailGraphByElement.ts
import type { TrailGraph, TrailNode } from '@anytime-markdown/code-analysis-core/model';

import type { C4Model } from '../types';
import type {
  FunctionGraphEdge,
  FunctionGraphNode,
  FunctionGraphResponse,
} from './types';

/**
 * TrailGraph を C4 要素 (MVP では type='code' のみ) のファイル範囲でフィルタし、
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
  if (!element || element.type !== 'code') {
    return { elementId, nodes: [], edges: [] };
  }

  // MVP: type='code' = 1 ファイル。element.name はファイル名のみのことがあるので
  // 「graph 内で elementId == filePath を満たす file ノードがあるか」と
  // 「graph 内に filePath を持つ function ノードがあるか」の 2 経路で候補を得る。
  const targetFilePaths = new Set<string>();
  // 第一経路: elementId が file ノード id と一致する場合
  const fileNode = graph.nodes.find((n) => n.id === elementId && n.type === 'file');
  if (fileNode) targetFilePaths.add(fileNode.filePath);
  // 第二経路: elementId 自体を filePath として扱う (codeGraphToC4 の生成規則)
  for (const n of graph.nodes) {
    if (n.filePath === elementId) targetFilePaths.add(n.filePath);
  }

  if (targetFilePaths.size === 0) {
    return { elementId, nodes: [], edges: [] };
  }

  // F = 対象ファイル配下の function ノード集合
  const internalFnNodes: TrailNode[] = [];
  const internalFnIds = new Set<string>();
  for (const n of graph.nodes) {
    if (n.type === 'function' && targetFilePaths.has(n.filePath)) {
      internalFnNodes.push(n);
      internalFnIds.add(n.id);
    }
  }

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

  // エッジ収集 (call のみ)。dedup は source+target で行う。
  const seen = new Set<string>();
  const edges: FunctionGraphEdge[] = [];
  // 外部ノード収集。external (out 先) を優先し、external_caller (in 元) は重複しない場合のみ
  const externalOut = new Map<string, TrailNode>();
  const externalIn = new Map<string, TrailNode>();

  const nodeById = new Map<string, TrailNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  for (const e of graph.edges) {
    if (e.type !== 'call') continue;
    const srcInternal = internalFnIds.has(e.source);
    const dstInternal = internalFnIds.has(e.target);
    if (!srcInternal && !dstInternal) continue;

    const key = `${e.source}\0${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: e.source, target: e.target });

    if (srcInternal && !dstInternal) {
      const ext = nodeById.get(e.target);
      if (ext) externalOut.set(e.target, ext);
    } else if (!srcInternal && dstInternal) {
      const ext = nodeById.get(e.source);
      if (ext) externalIn.set(e.source, ext);
    }
  }

  // external 優先 dedup
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

  return {
    elementId,
    nodes: [...internalNodes, ...externals],
    edges,
  };
}
