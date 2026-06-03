import ts from 'typescript';
import { FlowAnalyzer } from '../FlowAnalyzer';

function makeSourceFile(name: string, code: string): ts.SourceFile {
  return ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true);
}

describe('FlowAnalyzer.buildCallGraph', () => {
  it('相互再帰 (サイクル) でも全エッジが実在ノードを指す (conf04 回帰)', () => {
    // a() -> b() -> a() の循環。修正前は再訪時に生 symbolId を返すため、
    // 存在しないノードを指す孤立エッジが生じレンダラがクラッシュしていた。
    const source = makeSourceFile(
      '/x/file.ts',
      `function a() { b(); }
       function b() { a(); }`,
    );

    const graph = FlowAnalyzer.buildCallGraph([source], '/x/file.ts::a', 3);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });
});
