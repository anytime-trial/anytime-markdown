/**
 * GraphLayout の追加テスト — 未カバー分岐を補完する。
 */
import Graph from 'graphology';
import { GraphLayout } from '../GraphLayout';

describe('GraphLayout — 追加テスト', () => {
  it('空グラフ（order=0）では何もせず正常終了する', () => {
    const g = new Graph();
    const layout = new GraphLayout();
    // 空グラフでは早期 return される（例外なし）
    expect(() => layout.apply(g)).not.toThrow();
    // ノードがないので各ノードへのアクセスは不要
    expect(g.order).toBe(0);
  });

  it('1 ノードでも x/y が割り当てられる', () => {
    const g = new Graph();
    g.addNode('solo', { size: 0 });
    const layout = new GraphLayout();
    layout.apply(g);
    expect(typeof g.getNodeAttribute('solo', 'x')).toBe('number');
    expect(typeof g.getNodeAttribute('solo', 'y')).toBe('number');
  });

  it('iterations 引数を変えても例外が起きない', () => {
    const g = new Graph();
    g.addNode('A', { size: 1 });
    g.addNode('B', { size: 1 });
    g.addEdge('A', 'B');
    const layout = new GraphLayout();
    expect(() => layout.apply(g, 10)).not.toThrow();
    expect(() => layout.apply(g, 1)).not.toThrow();
  });

  it('エッジなしの複数ノードでも全ノードに x/y が割り当てられる', () => {
    const g = new Graph();
    ['X', 'Y', 'Z'].forEach((n) => g.addNode(n, { size: 0 }));
    const layout = new GraphLayout();
    layout.apply(g);
    g.forEachNode((node) => {
      const x = g.getNodeAttribute(node, 'x');
      const y = g.getNodeAttribute(node, 'y');
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
      // NaN ではないこと
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    });
  });
});
