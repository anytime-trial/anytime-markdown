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
  SequenceAltBranch,
  SequenceFragment,
  SequenceModel,
  SequenceParticipant,
  SequenceStep,
} from '@anytime-markdown/trace-core/c4Sequence';
import { findFunctionNode } from './sourceFileFactory';

const MAX_STEPS = 500;
const MAX_CONDITION_LEN = 60;

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
  if (!funcNode || !funcNode.body) {
    return buildFallbackSteps(calls, fromParticipantId, toParticipantId, callerFnName, chainId, ctx);
  }

  const calleeNames = buildCalleeNames(calls, ctx);
  const collected: SequenceStep[] = [];
  walkBody(funcNode.body, sf, {
    calleeNames,
    from: fromParticipantId,
    to: toParticipantId,
    callerFnName,
    chainId,
    out: collected,
    ctx,
  });
  return collected;
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

// ---------------------------------------------------------------------------
//  AST walk: 制御フロー文脈と call の収集
// ---------------------------------------------------------------------------

interface WalkState {
  readonly calleeNames: ReadonlySet<string>;
  readonly from: string;
  readonly to: string;
  readonly callerFnName: string;
  readonly chainId: string;
  readonly out: SequenceStep[];
  readonly ctx: BuildContext;
}

/**
 * 関数 body を walk し、関連要素の関数を呼ぶ CallExpression を
 * if/loop/opt の制御文脈に応じてフラグメント階層に記録する。
 */
function walkBody(body: ts.Node, sf: ts.SourceFile, state: WalkState): void {
  visitFunctionBody(body, sf, state, state.out);
}

function visitStmt(stmt: ts.Statement, sf: ts.SourceFile, state: WalkState, out: SequenceStep[]): void {
  if (state.ctx.totalSteps >= MAX_STEPS) return;

  if (ts.isIfStatement(stmt)) { visitIfStatement(stmt, sf, state, out); return; }
  if (isLoopStatement(stmt)) { visitLoopStatement(stmt, sf, state, out); return; }
  if (ts.isBlock(stmt)) { visitBlockStmts(stmt.statements, sf, state, out); return; }
  if (ts.isExpressionStatement(stmt)) { visitExpression(stmt.expression, sf, state, out); return; }
  if (ts.isVariableStatement(stmt)) { visitVariableStatement(stmt, sf, state, out); return; }
  if (ts.isReturnStatement(stmt)) { if (stmt.expression) visitExpression(stmt.expression, sf, state, out); return; }
  if (ts.isTryStatement(stmt)) { visitTryStatement(stmt, sf, state, out); return; }

  // Generic statement: visit nested expressions / blocks shallowly
  ts.forEachChild(stmt, (child) => {
    if (ts.isStatement(child)) visitStmt(child, sf, state, out);
    else visitExpression(child, sf, state, out);
  });
}

function isLoopStatement(stmt: ts.Statement): stmt is ts.ForStatement | ts.ForInStatement | ts.ForOfStatement | ts.WhileStatement | ts.DoStatement {
  return ts.isForStatement(stmt) || ts.isForInStatement(stmt) || ts.isForOfStatement(stmt) || ts.isWhileStatement(stmt) || ts.isDoStatement(stmt);
}

function visitBlockStmts(
  statements: ts.NodeArray<ts.Statement>,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): void {
  for (const child of statements) visitStmt(child, sf, state, out);
}

function visitVariableStatement(
  stmt: ts.VariableStatement,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): void {
  for (const decl of stmt.declarationList.declarations) {
    if (decl.initializer) visitExpression(decl.initializer, sf, state, out);
  }
}

function visitTryStatement(
  stmt: ts.TryStatement,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): void {
  visitBlockStmts(stmt.tryBlock.statements, sf, state, out);
  if (stmt.catchClause) {
    visitBlockStmts(stmt.catchClause.block.statements, sf, state, out);
  }
  if (stmt.finallyBlock) {
    visitBlockStmts(stmt.finallyBlock.statements, sf, state, out);
  }
}

function visitIfStatement(stmt: ts.IfStatement, sf: ts.SourceFile, state: WalkState, out: SequenceStep[]): void {
  const condition = truncate(stmt.expression.getText(sf), MAX_CONDITION_LEN);

  const thenSteps: SequenceStep[] = [];
  visitStmt(stmt.thenStatement, sf, state, thenSteps);

  if (!stmt.elseStatement) {
    // opt
    if (thenSteps.length > 0) {
      out.push({ kind: 'fragment', fragment: { kind: 'opt', condition, steps: thenSteps } });
    }
    return;
  }

  // alt 構造（else または else if あり）
  const branches: SequenceAltBranch[] = [];
  if (thenSteps.length > 0) {
    branches.push({ condition, steps: thenSteps });
  }

  let elseStmt: ts.Statement | undefined = stmt.elseStatement;
  while (elseStmt && ts.isIfStatement(elseStmt)) {
    const cond = truncate(elseStmt.expression.getText(sf), MAX_CONDITION_LEN);
    const branchSteps: SequenceStep[] = [];
    visitStmt(elseStmt.thenStatement, sf, state, branchSteps);
    if (branchSteps.length > 0) {
      branches.push({ condition: cond, steps: branchSteps });
    }
    elseStmt = elseStmt.elseStatement;
  }
  if (elseStmt) {
    const branchSteps: SequenceStep[] = [];
    visitStmt(elseStmt, sf, state, branchSteps);
    if (branchSteps.length > 0) {
      branches.push({ condition: 'else', steps: branchSteps });
    }
  }

  if (branches.length > 0) {
    out.push({ kind: 'fragment', fragment: { kind: 'alt', branches } });
  }
}

function visitLoopStatement(stmt: ts.Statement, sf: ts.SourceFile, state: WalkState, out: SequenceStep[]): void {
  const condition = describeLoopCondition(stmt, sf);
  const bodyStmt = getLoopBody(stmt);
  if (!bodyStmt) return;
  const bodySteps: SequenceStep[] = [];
  visitStmt(bodyStmt, sf, state, bodySteps);
  if (bodySteps.length > 0) {
    out.push({ kind: 'fragment', fragment: { kind: 'loop', condition, steps: bodySteps } });
  }
}

function describeLoopCondition(stmt: ts.Statement, sf: ts.SourceFile): string {
  if (ts.isForStatement(stmt)) {
    const cond = stmt.condition?.getText(sf) ?? '';
    return truncate(cond || 'for', MAX_CONDITION_LEN);
  }
  if (ts.isForInStatement(stmt)) {
    return truncate(`for in ${stmt.expression.getText(sf)}`, MAX_CONDITION_LEN);
  }
  if (ts.isForOfStatement(stmt)) {
    return truncate(`for of ${stmt.expression.getText(sf)}`, MAX_CONDITION_LEN);
  }
  if (ts.isWhileStatement(stmt)) {
    return truncate(stmt.expression.getText(sf), MAX_CONDITION_LEN);
  }
  if (ts.isDoStatement(stmt)) {
    return truncate(`do while ${stmt.expression.getText(sf)}`, MAX_CONDITION_LEN);
  }
  return 'loop';
}

function getLoopBody(stmt: ts.Statement): ts.Statement | undefined {
  if (
    ts.isForStatement(stmt) ||
    ts.isForInStatement(stmt) ||
    ts.isForOfStatement(stmt) ||
    ts.isWhileStatement(stmt) ||
    ts.isDoStatement(stmt)
  ) {
    return stmt.statement;
  }
  return undefined;
}

const ITERATOR_METHODS = new Set(['forEach', 'map', 'filter', 'reduce', 'flatMap', 'find', 'some', 'every']);

function visitExpression(expr: ts.Node, sf: ts.SourceFile, state: WalkState, out: SequenceStep[]): void {
  if (state.ctx.totalSteps >= MAX_STEPS) return;

  if (ts.isCallExpression(expr)) {
    visitCallExpression(expr, sf, state, out);
    return;
  }

  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    visitFunctionBody(expr.body, sf, state, out);
    return;
  }

  // 一般式: 子要素を再帰
  ts.forEachChild(expr, (child) => visitExpression(child, sf, state, out));
}

function visitCallExpression(
  expr: ts.CallExpression,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): void {
  // .forEach((...) => { ... }) などの iterator 系を loop として扱う
  if (tryVisitIteratorCall(expr, sf, state, out)) return;

  // 通常呼び出し: callee 名を抽出
  const calleeName = getCallExpressionName(expr);
  if (calleeName && state.calleeNames.has(calleeName)) {
    const line = sf.getLineAndCharacterOfPosition(expr.getStart()).line + 1;
    out.push({
      kind: 'call',
      from: state.from,
      to: state.to,
      fnName: calleeName,
      callerFnName: state.callerFnName,
      line,
      chainId: state.chainId,
    });
    state.ctx.totalSteps += 1;
  }

  // 引数も再帰（コールバック内の呼び出し等）
  for (const arg of expr.arguments) {
    visitExpression(arg, sf, state, out);
  }
}

/**
 * iterator メソッド呼び出し（forEach/map 等）を loop フラグメントとして記録する。
 * loop として出力した場合は true を返す（caller は以降の処理をスキップする）。
 */
function tryVisitIteratorCall(
  expr: ts.CallExpression,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): boolean {
  if (!ts.isPropertyAccessExpression(expr.expression)) return false;
  if (!ITERATOR_METHODS.has(expr.expression.name.text)) return false;

  const cb = expr.arguments[0];
  if (!cb || (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb))) return false;

  const condition = truncate(
    `${expr.expression.name.text} ${expr.expression.expression.getText(sf)}`,
    MAX_CONDITION_LEN,
  );
  const bodySteps: SequenceStep[] = [];
  visitFunctionBody(cb.body, sf, state, bodySteps);

  if (bodySteps.length > 0) {
    out.push({ kind: 'fragment', fragment: { kind: 'loop', condition, steps: bodySteps } });
    return true;
  }
  return false;
}

function visitFunctionBody(
  body: ts.Node | undefined,
  sf: ts.SourceFile,
  state: WalkState,
  out: SequenceStep[],
): void {
  if (!body) return;
  if (ts.isBlock(body)) {
    visitBlockStmts(body.statements, sf, state, out);
  } else {
    visitExpression(body, sf, state, out);
  }
}

function getCallExpressionName(expr: ts.CallExpression): string | null {
  if (ts.isIdentifier(expr.expression)) return expr.expression.text;
  if (ts.isPropertyAccessExpression(expr.expression)) return expr.expression.name.text;
  return null;
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function emptyModel(rootElementId: string): SequenceModel {
  return {
    version: 1,
    rootElementId,
    participants: [],
    root: { kind: 'sequence', steps: [] },
  };
}
