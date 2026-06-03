// packages/trail-core/src/analyzer/FlowAnalyzer.ts
import ts from 'typescript';
import type { FlowGraph, FlowNode, FlowEdge } from './flowTypes';
import { extractCfg } from './cfg/TsCfgExtractor';
import { flowGraphFromCfg } from './cfg/flowGraphFromCfg';

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
    // 言語非依存の CFG-IR を経由して FlowGraph を生成する（flow/sequence で抽出器を共有）。
    // 出力は従来の AST 直接走査と完全一致（cfg/__tests__ の parity テストで担保）。
    return flowGraphFromCfg(extractCfg(sf, funcNode));
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
    // symbolId → 生成済み nodeId。サイクル (相互再帰) で再訪したとき、生の
    // symbolId ではなく対応する nodeId を返すことで、存在しないノードを指す
    // 孤立エッジ (レンダラの参照クラッシュ要因) が生じるのを防ぐ。
    const visited = new Map<string, string>();

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
      const existing = visited.get(symbolId);
      if (existing !== undefined) return existing;

      const parts = symbolId.split('::');
      const funcName = parts.at(-1) ?? symbolId;
      const nodeId = nextId('call');
      // collectCalls の再帰より前に登録する。以降のサイクルはこの nodeId を返す。
      visited.set(symbolId, nodeId);
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
