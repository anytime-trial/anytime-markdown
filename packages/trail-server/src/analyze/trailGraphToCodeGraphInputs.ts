import path from 'node:path';

import type { TrailGraph } from '@anytime-markdown/trail-core';

import type { CodeGraphEdge, CodeGraphNode } from './CodeGraph.types';

type NodeInput = Omit<CodeGraphNode, 'community' | 'communityLabel' | 'x' | 'y' | 'size'>;
type EdgeInput = CodeGraphEdge;

export interface TrailGraphConversionInput {
  /** Code Graph 上で使うリポジトリ ID（ノード ID 接頭辞） */
  readonly repoId: string;
  /** 絶対パス。docFiles の相対化に利用 */
  readonly repoRootPath: string;
  /** trail-core の analyze() 結果。tsconfig 無しリポでは undefined を許容 */
  readonly trailGraph?: TrailGraph;
  /** GraphDetector.detectDocFiles() の結果（絶対パス） */
  readonly docFiles?: readonly string[];
}

export interface CodeGraphInputs {
  readonly nodes: readonly NodeInput[];
  readonly edges: readonly EdgeInput[];
}

/**
 * trail-core の TrailGraph と documentファイル一覧を Code Graph 入力に変換する。
 * - file ノードのみ Code Graph ノード化（symbol ノードはファイル単位に集約する役割のみ）
 * - symbol→symbol edge は file→file に集約。同一ファイル内 edge は除去
 * - 同じ source/target ペアの edge は重複除去
 */
export function trailGraphToCodeGraphInputs(
  input: TrailGraphConversionInput,
): CodeGraphInputs {
  const nodes: NodeInput[] = [];
  const seenNodeIds = new Set<string>();

  const fileByNodeId = new Map<string, string>();
  for (const n of input.trailGraph?.nodes ?? []) {
    fileByNodeId.set(n.id, n.filePath);
    if (n.type !== 'file') continue;
    const codeNode = makeCodeNode(input.repoId, n.filePath, 'code');
    if (seenNodeIds.has(codeNode.id)) continue;
    nodes.push(codeNode);
    seenNodeIds.add(codeNode.id);
  }

  for (const docAbs of input.docFiles ?? []) {
    const relPath = path.relative(input.repoRootPath, docAbs);
    const docNode = makeCodeNode(input.repoId, relPath, 'document');
    if (seenNodeIds.has(docNode.id)) continue;
    nodes.push(docNode);
    seenNodeIds.add(docNode.id);
  }

  const seenEdgeKeys = new Set<string>();
  const edges: EdgeInput[] = [];
  for (const e of input.trailGraph?.edges ?? []) {
    const sourceFile = fileByNodeId.get(e.source);
    const targetFile = fileByNodeId.get(e.target);
    if (!sourceFile || !targetFile) continue;
    if (sourceFile === targetFile) continue;

    const sourceId = `${input.repoId}:${stripExt(sourceFile)}`;
    const targetId = `${input.repoId}:${stripExt(targetFile)}`;
    if (!seenNodeIds.has(sourceId) || !seenNodeIds.has(targetId)) continue;

    const key = `${sourceId} ${targetId}`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);
    edges.push({
      source: sourceId,
      target: targetId,
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      crossRepo: false,
    });
  }

  return { nodes, edges };
}

function makeCodeNode(
  repoId: string,
  relPath: string,
  fileType: 'code' | 'document',
): NodeInput {
  const cleaned = stripExt(relPath);
  const segments = cleaned.split('/');
  return {
    id: `${repoId}:${cleaned}`,
    label: path.basename(cleaned),
    repo: repoId,
    package: segments[1] ?? repoId,
    fileType,
  };
}

function stripExt(relPath: string): string {
  return relPath.replace(/\.(tsx?|mdx?)$/, '');
}
