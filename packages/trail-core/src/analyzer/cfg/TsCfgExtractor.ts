// packages/trail-core/src/analyzer/cfg/TsCfgExtractor.ts
//
// ts.SourceFile + 関数ノード → 言語非依存 CFG-IR。
// 制御フロー構造 (if/loop/try/return/throw/expr/other) を抽出し、各式の call も
// 収集する (call は sequence 射影 R2 用。flow 射影は使わない)。
// truncation は flow 射影と一致させるため抽出時に適用する (R1 方針)。

import ts from 'typescript';
import type { CfgFunction, CfgBlock, CfgStmt, CfgCall, CfgArg } from './cfgTypes';

type FuncLike =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;

export function extractCfg(sf: ts.SourceFile, funcNode: FuncLike): CfgFunction {
  const hasDeclaredBody =
    ts.isFunctionDeclaration(funcNode) ||
    ts.isMethodDeclaration(funcNode) ||
    ts.isFunctionExpression(funcNode);
  const body = hasDeclaredBody
    ? funcNode.body
    : ts.isBlock(funcNode.body)
      ? funcNode.body
      : undefined;
  if (!body) return { hasBody: false, body: { stmts: [] } };
  return { hasBody: true, body: extractBlock(body, sf) };
}

function extractBlock(block: ts.Block, sf: ts.SourceFile): CfgBlock {
  return { stmts: block.statements.map((s) => extractStmt(s, sf)) };
}

function lineOf(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function blockOf(stmt: ts.Statement, sf: ts.SourceFile): CfgBlock {
  if (ts.isBlock(stmt)) return extractBlock(stmt, sf);
  return { stmts: [extractStmt(stmt, sf)] };
}

function extractStmt(stmt: ts.Statement, sf: ts.SourceFile): CfgStmt {
  const line = lineOf(stmt, sf);

  if (ts.isIfStatement(stmt)) {
    return {
      kind: 'if',
      line,
      condition: stmt.expression.getText(sf),
      then: blockOf(stmt.thenStatement, sf),
      ...(stmt.elseStatement ? { else: blockOf(stmt.elseStatement, sf) } : {}),
    };
  }

  if (
    ts.isForStatement(stmt) ||
    ts.isForInStatement(stmt) ||
    ts.isForOfStatement(stmt) ||
    ts.isWhileStatement(stmt) ||
    ts.isDoStatement(stmt)
  ) {
    let loopKind: 'for' | 'forIn' | 'forOf' | 'while' | 'do';
    if (ts.isForStatement(stmt)) {
      loopKind = 'for';
    } else if (ts.isForInStatement(stmt)) {
      loopKind = 'forIn';
    } else if (ts.isForOfStatement(stmt)) {
      loopKind = 'forOf';
    } else if (ts.isWhileStatement(stmt)) {
      loopKind = 'while';
    } else {
      loopKind = 'do';
    }
    return {
      kind: 'loop',
      line,
      loopKind,
      rawText: stmt.getText(sf),
      condition: extractLoopCondition(stmt, sf),
      body: blockOf(stmt.statement, sf),
    };
  }

  if (ts.isTryStatement(stmt)) {
    return {
      kind: 'try',
      line,
      body: extractBlock(stmt.tryBlock, sf),
      ...(stmt.catchClause ? { catch: extractBlock(stmt.catchClause.block, sf) } : {}),
      ...(stmt.finallyBlock ? { finally: extractBlock(stmt.finallyBlock, sf) } : {}),
    };
  }

  // standalone block 文 (`{ ... }`) は再帰する（FlowAnalyzer / SequenceAnalyzer と同じ）。
  if (ts.isBlock(stmt)) {
    return { kind: 'block', line, body: extractBlock(stmt, sf) };
  }

  if (ts.isReturnStatement(stmt)) {
    return {
      kind: 'return',
      line,
      ...(stmt.expression ? { exprText: stmt.expression.getText(sf) } : {}),
      calls: stmt.expression ? extractCalls(stmt.expression, sf) : [],
    };
  }

  if (ts.isThrowStatement(stmt)) {
    return { kind: 'throw', line, exprText: stmt.expression.getText(sf), calls: extractCalls(stmt.expression, sf) };
  }

  if (ts.isExpressionStatement(stmt)) {
    return {
      kind: 'expr',
      line,
      label: stmt.expression.getText(sf),
      calls: extractCalls(stmt.expression, sf),
    };
  }

  return { kind: 'other', line, label: stmt.getText(sf), calls: extractCalls(stmt, sf) };
}

// raw な loop 条件文字列を返す（trim/collapse/truncate は sequence 射影側の truncate に委ねる）。
function extractLoopCondition(stmt: ts.Statement, sf: ts.SourceFile): string {
  if (ts.isForStatement(stmt)) return stmt.condition?.getText(sf) ?? 'for';
  if (ts.isForInStatement(stmt)) return `for in ${stmt.expression.getText(sf)}`;
  if (ts.isForOfStatement(stmt)) return `for of ${stmt.expression.getText(sf)}`;
  if (ts.isWhileStatement(stmt)) return stmt.expression.getText(sf);
  if (ts.isDoStatement(stmt)) return `do while ${stmt.expression.getText(sf)}`;
  return 'loop';
}

/** 式から call を収集する (sequence 射影 R2 用)。CallExpression を見つけたら toCall に委ね、
 *  引数は toCall 内で再帰するため二重走査しない。 */
function extractCalls(node: ts.Node, sf: ts.SourceFile): CfgCall[] {
  const out: CfgCall[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      out.push(toCall(n, sf));
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function toCall(expr: ts.CallExpression, sf: ts.SourceFile): CfgCall {
  const isProp = ts.isPropertyAccessExpression(expr.expression);
  const propCalleeOrNull = isProp ? (expr.expression as ts.PropertyAccessExpression).name.text : null;
  const calleeName = ts.isIdentifier(expr.expression)
    ? expr.expression.text
    : propCalleeOrNull;
  const receiverText = isProp
    ? (expr.expression as ts.PropertyAccessExpression).expression.getText(sf)
    : undefined;
  const args: CfgArg[] = expr.arguments.map((a): CfgArg => {
    if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
      const body = ts.isBlock(a.body)
        ? extractBlock(a.body, sf)
        : { stmts: [extractExprAsStmt(a.body, sf)] };
      return { kind: 'functionBody', body };
    }
    if (ts.isCallExpression(a)) return { kind: 'call', call: toCall(a, sf) };
    return { kind: 'plain', calls: extractCalls(a, sf) };
  });
  return {
    calleeName,
    isPropertyAccess: isProp,
    line: lineOf(expr, sf),
    args,
    ...(receiverText ? { receiverText } : {}),
  };
}

function extractExprAsStmt(expr: ts.Expression, sf: ts.SourceFile): CfgStmt {
  return {
    kind: 'expr',
    line: lineOf(expr, sf),
    label: expr.getText(sf).slice(0, 40),
    calls: extractCalls(expr, sf),
  };
}
