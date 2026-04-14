// packages/trail-core/src/analyzer/FlowAnalyzer.ts
import ts from 'typescript';
import type { FlowGraph, FlowNode, FlowEdge } from './flowTypes';

let nodeCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++nodeCounter}`;
}

export class FlowAnalyzer {
  /**
   * 関数宣言の制御フローグラフを生成する。
   */
  static buildControlFlow(
    sf: ts.SourceFile,
    funcNode: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): FlowGraph {
    nodeCounter = 0;
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    const startId = nextId('start');
    const endId = nextId('end');
    nodes.push({ id: startId, label: 'start', kind: 'start' });
    nodes.push({ id: endId, label: 'end', kind: 'end' });

    const body = ts.isFunctionDeclaration(funcNode) || ts.isMethodDeclaration(funcNode) || ts.isFunctionExpression(funcNode)
      ? funcNode.body
      : ts.isBlock(funcNode.body) ? funcNode.body : undefined;

    if (!body) {
      edges.push({ from: startId, to: endId });
      return { nodes, edges };
    }

    const lastIds = FlowAnalyzer.visitBlock(body, sf, nodes, edges, [startId], endId);
    for (const id of lastIds) {
      edges.push({ from: id, to: endId });
    }

    return { nodes, edges };
  }

  private static visitBlock(
    block: ts.Block,
    sf: ts.SourceFile,
    nodes: FlowNode[],
    edges: FlowEdge[],
    prevIds: string[],
    endId: string,
  ): string[] {
    let current = prevIds;
    for (const stmt of block.statements) {
      current = FlowAnalyzer.visitStatement(stmt, sf, nodes, edges, current, endId);
    }
    return current;
  }

  private static visitStatement(
    stmt: ts.Statement,
    sf: ts.SourceFile,
    nodes: FlowNode[],
    edges: FlowEdge[],
    prevIds: string[],
    endId: string,
  ): string[] {
    const line = sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;

    if (ts.isIfStatement(stmt)) {
      const condText = stmt.expression.getText(sf).slice(0, 40);
      const nodeId = nextId('decision');
      nodes.push({ id: nodeId, label: condText, kind: 'decision', line });
      for (const p of prevIds) edges.push({ from: p, to: nodeId });

      // true ブランチ
      const trueNodeId = nextId('process');
      nodes.push({ id: trueNodeId, label: 'then', kind: 'process' });
      edges.push({ from: nodeId, to: trueNodeId, label: 'true' });
      const thenOut = FlowAnalyzer.visitStatement(stmt.thenStatement, sf, nodes, edges, [trueNodeId], endId);

      if (stmt.elseStatement) {
        const falseNodeId = nextId('process');
        nodes.push({ id: falseNodeId, label: 'else', kind: 'process' });
        edges.push({ from: nodeId, to: falseNodeId, label: 'false' });
        const elseOut = FlowAnalyzer.visitStatement(stmt.elseStatement, sf, nodes, edges, [falseNodeId], endId);
        return [...thenOut, ...elseOut];
      }
      return [...thenOut, nodeId];
    }

    if (ts.isForStatement(stmt) || ts.isWhileStatement(stmt) || ts.isDoStatement(stmt)) {
      const nodeId = nextId('loop');
      nodes.push({ id: nodeId, label: stmt.getText(sf).slice(0, 30) + '…', kind: 'loop', line });
      for (const p of prevIds) edges.push({ from: p, to: nodeId });
      return [nodeId];
    }

    if (ts.isTryStatement(stmt)) {
      const tryId = nextId('process');
      nodes.push({ id: tryId, label: 'try', kind: 'process', line });
      for (const p of prevIds) edges.push({ from: p, to: tryId });

      const tryOut = FlowAnalyzer.visitBlock(stmt.tryBlock, sf, nodes, edges, [tryId], endId);
      if (stmt.catchClause) {
        const catchId = nextId('error');
        nodes.push({ id: catchId, label: 'catch', kind: 'error', line });
        edges.push({ from: tryId, to: catchId, label: 'error' });
        const catchOut = FlowAnalyzer.visitBlock(stmt.catchClause.block, sf, nodes, edges, [catchId], endId);
        return [...tryOut, ...catchOut];
      }
      return tryOut;
    }

    if (ts.isReturnStatement(stmt)) {
      const nodeId = nextId('return');
      const label = stmt.expression ? `return ${stmt.expression.getText(sf).slice(0, 30)}` : 'return';
      nodes.push({ id: nodeId, label, kind: 'return', line });
      for (const p of prevIds) edges.push({ from: p, to: nodeId });
      edges.push({ from: nodeId, to: endId });
      return [];
    }

    if (ts.isThrowStatement(stmt)) {
      const nodeId = nextId('error');
      nodes.push({ id: nodeId, label: `throw ${stmt.expression.getText(sf).slice(0, 30)}`, kind: 'error', line });
      for (const p of prevIds) edges.push({ from: p, to: nodeId });
      edges.push({ from: nodeId, to: endId });
      return [];
    }

    if (ts.isBlock(stmt)) {
      return FlowAnalyzer.visitBlock(stmt, sf, nodes, edges, prevIds, endId);
    }

    if (ts.isExpressionStatement(stmt)) {
      const nodeId = nextId('process');
      nodes.push({ id: nodeId, label: stmt.expression.getText(sf).slice(0, 40), kind: 'process', line });
      for (const p of prevIds) edges.push({ from: p, to: nodeId });
      return [nodeId];
    }

    // その他の文（宣言など）は process として扱う
    const nodeId = nextId('process');
    nodes.push({ id: nodeId, label: stmt.getText(sf).slice(0, 40), kind: 'process', line });
    for (const p of prevIds) edges.push({ from: p, to: nodeId });
    return [nodeId];
  }

  /**
   * 呼び出しフロー（call graph）を生成する。
   * @param sourceFiles コンポーネント内の全ソースファイル
   * @param entrySymbolId 起点シンボル ID（"filePath::funcName"）
   * @param maxDepth 探索深さ上限（デフォルト 3）
   */
  static buildCallGraph(
    sourceFiles: readonly ts.SourceFile[],
    entrySymbolId: string,
    maxDepth = 3,
  ): FlowGraph {
    nodeCounter = 0;
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const visited = new Set<string>();

    // ファイルパス → SourceFile マップ
    const sfMap = new Map<string, ts.SourceFile>();
    for (const sf of sourceFiles) sfMap.set(sf.fileName, sf);

    // 全ファイルの関数を ID → FunctionDeclaration にマップ
    const funcMap = new Map<string, ts.FunctionDeclaration>();
    for (const sf of sourceFiles) {
      ts.forEachChild(sf, node => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          funcMap.set(`${sf.fileName}::${node.name.text}`, node);
        }
      });
    }

    function walk(symbolId: string, depth: number): string {
      if (visited.has(symbolId)) return symbolId;
      visited.add(symbolId);

      const parts = symbolId.split('::');
      const funcName = parts.at(-1) ?? symbolId;
      const nodeId = nextId('call');
      nodes.push({ id: nodeId, label: funcName, kind: depth === 0 ? 'start' : 'call', filePath: parts[0], line: 0 });

      if (depth >= maxDepth) return nodeId;

      const funcNode = funcMap.get(symbolId);
      if (!funcNode?.body) return nodeId;

      const sfPath = parts[0];
      const sf = sfMap.get(sfPath);
      if (!sf) return nodeId;

      // body 内の CallExpression を収集
      function collectCalls(node: ts.Node): void {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const callee = node.expression.text;
          // 同コンポーネント内で解決を試みる
          for (const [id] of funcMap) {
            if (id.endsWith(`::${callee}`)) {
              const childId = walk(id, depth + 1);
              edges.push({ from: nodeId, to: childId });
            }
          }
        }
        ts.forEachChild(node, collectCalls);
      }
      collectCalls(funcNode.body);

      return nodeId;
    }

    walk(entrySymbolId, 0);
    return { nodes, edges };
  }
}
