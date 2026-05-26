// packages/trail-core/src/analyzer/cfg/sequenceStepsFromCfg.ts
//
// 言語非依存 CFG-IR → SequenceStep[] 射影。SequenceAnalyzer の関数内 walk
// (walkBody/visitStmt/visitExpression/visitCallExpression/tryVisitIteratorCall) と
// 等価な出力を IR から生成する。横断チェーン機構は SequenceAnalyzer 側に残る。

import type { SequenceStep, SequenceAltBranch } from '@anytime-markdown/trace-core/c4Sequence';
import type { CfgBlock, CfgStmt, CfgCall } from './cfgTypes';

const ITERATOR_METHODS = new Set(['forEach', 'map', 'filter', 'reduce', 'flatMap', 'find', 'some', 'every']);
const MAX_CONDITION_LEN = 60;

export interface SeqWalkOptions {
  readonly calleeNames: ReadonlySet<string>;
  readonly from: string;
  readonly to: string;
  readonly callerFnName: string;
  readonly chainId: string;
  /** 残り step 上限。0 以下になると打ち切る。 */
  readonly maxSteps: number;
}

export interface SeqWalkResult {
  readonly steps: SequenceStep[];
  /** 生成した call step 数（呼び出し側の totalSteps 加算に使う）。 */
  readonly stepCount: number;
}

function truncate(s: string, max = MAX_CONDITION_LEN): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** CfgBlock を SequenceStep[] へ射影する（SequenceAnalyzer.walkBody 等価）。 */
export function sequenceStepsFromCfg(block: CfgBlock, opts: SeqWalkOptions): SeqWalkResult {
  let count = 0;
  const atLimit = (): boolean => count >= opts.maxSteps;

  const visitBlock = (b: CfgBlock, out: SequenceStep[]): void => {
    for (const stmt of b.stmts) {
      if (atLimit()) return;
      visitStmt(stmt, out);
    }
  };

  const visitStmt = (stmt: CfgStmt, out: SequenceStep[]): void => {
    if (atLimit()) return;
    switch (stmt.kind) {
      case 'if':
        return visitIf(stmt, out);
      case 'loop': {
        const bodySteps: SequenceStep[] = [];
        visitBlock(stmt.body, bodySteps);
        if (bodySteps.length > 0) {
          out.push({ kind: 'fragment', fragment: { kind: 'loop', condition: truncate(stmt.condition), steps: bodySteps } });
        }
        return;
      }
      case 'try':
        visitBlock(stmt.body, out);
        if (stmt.catch) visitBlock(stmt.catch, out);
        if (stmt.finally) visitBlock(stmt.finally, out);
        return;
      case 'block':
        return visitBlock(stmt.body, out);
      case 'expr':
      case 'other':
      case 'return':
      case 'throw':
        return visitCalls(stmt.calls, out);
      default:
        return;
    }
  };

  const visitIf = (stmt: Extract<CfgStmt, { kind: 'if' }>, out: SequenceStep[]): void => {
    const condition = truncate(stmt.condition);
    const thenSteps: SequenceStep[] = [];
    visitBlock(stmt.then, thenSteps);

    if (!stmt.else) {
      if (thenSteps.length > 0) {
        out.push({ kind: 'fragment', fragment: { kind: 'opt', condition, steps: thenSteps } });
      }
      return;
    }

    const branches: SequenceAltBranch[] = [];
    if (thenSteps.length > 0) branches.push({ condition, steps: thenSteps });

    // else が単一の if（else-if）なら連鎖を flatten
    let elseBlock: CfgBlock | undefined = stmt.else;
    while (elseBlock?.stmts.length === 1 && elseBlock.stmts[0].kind === 'if') {
      const elif = elseBlock.stmts[0] as Extract<CfgStmt, { kind: 'if' }>;
      const branchSteps: SequenceStep[] = [];
      visitBlock(elif.then, branchSteps);
      if (branchSteps.length > 0) branches.push({ condition: truncate(elif.condition), steps: branchSteps });
      elseBlock = elif.else;
    }
    if (elseBlock) {
      const branchSteps: SequenceStep[] = [];
      visitBlock(elseBlock, branchSteps);
      if (branchSteps.length > 0) branches.push({ condition: 'else', steps: branchSteps });
    }

    if (branches.length > 0) {
      out.push({ kind: 'fragment', fragment: { kind: 'alt', branches } });
    }
  };

  const visitCalls = (calls: readonly CfgCall[], out: SequenceStep[]): void => {
    for (const call of calls) {
      if (atLimit()) return;
      visitCall(call, out);
    }
  };

  const visitCall = (call: CfgCall, out: SequenceStep[]): void => {
    // iterator メソッド（forEach 等・第1引数がコールバック）を loop fragment 化
    if (call.isPropertyAccess && call.calleeName && ITERATOR_METHODS.has(call.calleeName)) {
      const first = call.args[0];
      if (first?.kind === 'functionBody') {
        const bodySteps: SequenceStep[] = [];
        visitBlock(first.body, bodySteps);
        if (bodySteps.length > 0) {
          const cond = truncate(`${call.calleeName} ${call.receiverText ?? ''}`);
          out.push({ kind: 'fragment', fragment: { kind: 'loop', condition: cond, steps: bodySteps } });
        }
        return;
      }
    }

    if (call.calleeName && opts.calleeNames.has(call.calleeName)) {
      out.push({
        kind: 'call',
        from: opts.from,
        to: opts.to,
        fnName: call.calleeName,
        callerFnName: opts.callerFnName,
        line: call.line,
        chainId: opts.chainId,
      });
      count += 1;
    }

    // 引数を順に降下（コールバック内・ネスト呼び出し）
    for (const arg of call.args) {
      if (atLimit()) return;
      if (arg.kind === 'call') visitCall(arg.call, out);
      else if (arg.kind === 'functionBody') visitBlock(arg.body, out);
      else visitCalls(arg.calls, out);
    }
  };

  const steps: SequenceStep[] = [];
  visitBlock(block, steps);
  return { steps, stepCount: count };
}
