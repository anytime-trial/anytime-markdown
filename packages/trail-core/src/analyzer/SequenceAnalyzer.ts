// packages/trail-core/src/analyzer/SequenceAnalyzer.ts
//
// trail-viewer C4 L3 シーケンス表示機能のためのアナライザ。
// 選択された C4 要素 (rootElementId) を中心に、
// In/Out 関連要素との関数呼び出しを AST から抽出し、
// 制御フロー文脈 (if/loop/opt) と組み合わせて SequenceModel を構築する。

import ts from 'typescript';
import type { C4Element, C4Model } from '../c4/types';
import type { TrailEdge, TrailGraph, TrailNode } from '../model/types';
import type {
  SequenceModel,
  SequenceParticipant,
  SequenceStep,
} from '@anytime-markdown/trace-core/c4Sequence';
import { findFunctionNode } from '@anytime-markdown/code-analysis-typescript/analyzer';
import { extractCfg } from './cfg/TsCfgExtractor';
import { sequenceStepsFromCfg } from './cfg/sequenceStepsFromCfg';

const MAX_STEPS = 500;

interface ChainPair {
  readonly source: C4Element;
  readonly target: C4Element;
  readonly chainId: string;
}

interface BuildContext {
  readonly model: C4Model;
  readonly graph: TrailGraph;
  readonly sourceFiles: ReadonlyMap<string, ts.SourceFile>;
  readonly fileToComponent: ReadonlyMap<string, string>;
  readonly nodesById: ReadonlyMap<string, TrailNode>;
  totalSteps: number;
}

/**
 * SequenceAnalyzer
 *
 * C4 モデル + TrailGraph + ソースファイルから、
 * 選択要素を中心としたシーケンス構造を抽出する。
 */
export class SequenceAnalyzer {
  /**
   * @param rootElementId 起点 C4 要素 ID（通常 component）
   * @param c4Model C4 モデル
   * @param trailGraph 関数間の call エッジを含む TrailGraph
   * @param sourceFiles relativePath → SourceFile のマップ
   */
  static build(
    rootElementId: string,
    c4Model: C4Model,
    trailGraph: TrailGraph,
    sourceFiles: ReadonlyMap<string, ts.SourceFile>,
  ): SequenceModel {
    const root = c4Model.elements.find((e) => e.id === rootElementId);
    if (!root) {
      return emptyModel(rootElementId);
    }

    const chains = expandChains(root, c4Model);
    const participants = buildParticipants(root, chains);
    const fileToComponent = buildFileToComponent(c4Model);
    const nodesById = new Map(trailGraph.nodes.map((n) => [n.id, n]));

    const ctx: BuildContext = {
      model: c4Model,
      graph: trailGraph,
      sourceFiles,
      fileToComponent,
      nodesById,
      totalSteps: 0,
    };

    const allSteps: SequenceStep[] = [];
    for (const chain of chains) {
      if (ctx.totalSteps >= MAX_STEPS) break;
      const chainSteps = processChain(chain, ctx);
      if (chainSteps.length > 0) {
        allSteps.push(...chainSteps);
      }
    }

    return {
      version: 1,
      rootElementId,
      participants,
      root: { kind: 'sequence', steps: allSteps },
      ...(ctx.totalSteps >= MAX_STEPS ? { truncated: true } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
//  チェーン展開
// ---------------------------------------------------------------------------

function expandChains(root: C4Element, model: C4Model): ChainPair[] {
  const result: ChainPair[] = [];
  for (const r of model.relationships) {
    if (r.to === root.id && r.from !== root.id) {
      const x = model.elements.find((e) => e.id === r.from);
      if (x) result.push({ source: x, target: root, chainId: `in_${x.id}` });
    } else if (r.from === root.id && r.to !== root.id) {
      const y = model.elements.find((e) => e.id === r.to);
      if (y) result.push({ source: root, target: y, chainId: `out_${y.id}` });
    }
  }
  return result;
}

function buildParticipants(root: C4Element, chains: readonly ChainPair[]): SequenceParticipant[] {
  const seen = new Set<string>();
  const ordered: C4Element[] = [];
  // In sources first
  for (const c of chains) {
    if (c.target.id === root.id && !seen.has(c.source.id)) {
      seen.add(c.source.id);
      ordered.push(c.source);
    }
  }
  // Root
  if (!seen.has(root.id)) {
    seen.add(root.id);
    ordered.push(root);
  }
  // Out targets
  for (const c of chains) {
    if (c.source.id === root.id && !seen.has(c.target.id)) {
      seen.add(c.target.id);
      ordered.push(c.target);
    }
  }
  return ordered.map((el) => ({
    id: `elem_${el.id}`,
    elementId: el.id,
    label: el.name,
  }));
}

function buildFileToComponent(model: C4Model): Map<string, string> {
  const result = new Map<string, string>();
  for (const el of model.elements) {
    if (el.type === 'code' && el.boundaryId) {
      result.set(el.id, el.boundaryId);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
//  チェーン処理
// ---------------------------------------------------------------------------

function processChain(chain: ChainPair, ctx: BuildContext): SequenceStep[] {
  // chain.source 内の関数 → chain.target 内の関数の呼び出しを抽出
  const callerNodes = filterFunctionsInElement(ctx.graph.nodes, chain.source.id, ctx);
  if (callerNodes.length === 0) return [];

  const targetFnIds = buildTargetFnIds(chain.target.id, ctx);
  if (targetFnIds.size === 0) return [];

  const callerToCalls = buildCallerToCallsMap(ctx.graph.edges, targetFnIds);

  const steps: SequenceStep[] = [];
  const fromParticipantId = `elem_${chain.source.id}`;
  const toParticipantId = `elem_${chain.target.id}`;

  for (const caller of callerNodes) {
    if (ctx.totalSteps >= MAX_STEPS) break;
    const calls = callerToCalls.get(caller.id);
    if (!calls || calls.length === 0) continue;

    const callerSteps = processCallerNode(
      caller, calls, fromParticipantId, toParticipantId, chain.chainId, ctx,
    );
    steps.push(...callerSteps);
  }
  return steps;
}

function buildTargetFnIds(targetElementId: string, ctx: BuildContext): Set<string> {
  const targetFnIds = new Set<string>();
  for (const n of ctx.graph.nodes) {
    if (n.type === 'function' && getComponentForNode(n, ctx) === targetElementId) {
      targetFnIds.add(n.id);
    }
  }
  return targetFnIds;
}

function buildCallerToCallsMap(
  edges: readonly TrailEdge[],
  targetFnIds: ReadonlySet<string>,
): Map<string, TrailEdge[]> {
  const callerToCalls = new Map<string, TrailEdge[]>();
  for (const e of edges) {
    if (e.type !== 'call') continue;
    if (!targetFnIds.has(e.target)) continue;
    const list = callerToCalls.get(e.source);
    if (list) list.push(e);
    else callerToCalls.set(e.source, [e]);
  }
  return callerToCalls;
}

function processCallerNode(
  caller: TrailNode,
  calls: readonly TrailEdge[],
  fromParticipantId: string,
  toParticipantId: string,
  chainId: string,
  ctx: BuildContext,
): SequenceStep[] {
  const sf = ctx.sourceFiles.get(caller.filePath);
  if (!sf) return [];

  const callerFnName = caller.label;
  const funcNode = findFunctionNode(sf, callerFnName);
  if (!funcNode?.body) {
    return buildFallbackSteps(calls, fromParticipantId, toParticipantId, callerFnName, chainId, ctx);
  }

  const calleeNames = buildCalleeNames(calls, ctx);
  // 共通 CFG-IR 射影で caller 関数本体から SequenceStep[] を生成する。
  // 残り step 上限を渡し、消費分を ctx.totalSteps に加算する（build の chain ループの打ち切りと整合）。
  const cfg = extractCfg(sf, funcNode);
  const result = sequenceStepsFromCfg(cfg.body, {
    calleeNames,
    from: fromParticipantId,
    to: toParticipantId,
    callerFnName,
    chainId,
    maxSteps: MAX_STEPS - ctx.totalSteps,
  });
  ctx.totalSteps += result.stepCount;
  return result.steps;
}

function buildFallbackSteps(
  calls: readonly TrailEdge[],
  fromParticipantId: string,
  toParticipantId: string,
  callerFnName: string,
  chainId: string,
  ctx: BuildContext,
): SequenceStep[] {
  const steps: SequenceStep[] = [];
  for (const e of calls) {
    if (ctx.totalSteps >= MAX_STEPS) break;
    const calleeNode = ctx.nodesById.get(e.target);
    steps.push({
      kind: 'call',
      from: fromParticipantId,
      to: toParticipantId,
      fnName: calleeNode?.label ?? 'unknown',
      callerFnName,
      chainId,
    });
    ctx.totalSteps += 1;
  }
  return steps;
}

function buildCalleeNames(calls: readonly TrailEdge[], ctx: BuildContext): Set<string> {
  const calleeNamesById = new Map<string, string>();
  for (const e of calls) {
    const calleeNode = ctx.nodesById.get(e.target);
    if (calleeNode) calleeNamesById.set(calleeNode.id, calleeNode.label);
  }
  return new Set(calleeNamesById.values());
}

function filterFunctionsInElement(nodes: readonly TrailNode[], elementId: string, ctx: BuildContext): TrailNode[] {
  return nodes.filter(
    (n) => n.type === 'function' && getComponentForNode(n, ctx) === elementId,
  );
}

function getComponentForNode(node: TrailNode, ctx: BuildContext): string | null {
  // Code element id format: 'file::<relativePath>'
  const fileElementId = `file::${node.filePath}`;
  return ctx.fileToComponent.get(fileElementId) ?? null;
}

function emptyModel(rootElementId: string): SequenceModel {
  return {
    version: 1,
    rootElementId,
    participants: [],
    root: { kind: 'sequence', steps: [] },
  };
}
