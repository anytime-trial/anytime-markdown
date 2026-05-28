import { buildFunctionGraphDocument } from '../buildFunctionGraphDocument';
import type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';

const sample: FunctionGraphResponse = {
  elementId: 'src/foo.ts',
  nodes: [
    { id: 'src/foo.ts::a', label: 'a', filePath: 'src/foo.ts', line: 1, kind: 'function' },
    { id: 'src/foo.ts::b', label: 'b', filePath: 'src/foo.ts', line: 5, kind: 'function' },
    { id: 'src/bar.ts::c', label: 'c', filePath: 'src/bar.ts', line: 1, kind: 'external' },
  ],
  edges: [
    { source: 'src/foo.ts::a', target: 'src/foo.ts::b' },
    { source: 'src/foo.ts::b', target: 'src/bar.ts::c' },
  ],
};

describe('buildFunctionGraphDocument', () => {
  it('全ノード + 全エッジを含む GraphDocument を生成する', () => {
    const doc = buildFunctionGraphDocument(sample, false);
    expect(doc.nodes).toHaveLength(3);
    expect(doc.edges).toHaveLength(2);
  });

  it('座標は決定的 (同入力で同出力)', () => {
    const d1 = buildFunctionGraphDocument(sample, false);
    const d2 = buildFunctionGraphDocument(sample, false);
    for (let i = 0; i < d1.nodes.length; i++) {
      expect(d1.nodes[i].x).toBe(d2.nodes[i].x);
      expect(d1.nodes[i].y).toBe(d2.nodes[i].y);
    }
  });

  it('external ノードはグレー固定の塗りつぶし', () => {
    const doc = buildFunctionGraphDocument(sample, false);
    const ext = doc.nodes.find((n) => n.id === 'src/bar.ts::c');
    expect(ext?.style.fill).toMatch(/^#[0-9a-fA-F]{6}$/);
    // function ノードと external ノードで色が異なる
    const fn = doc.nodes.find((n) => n.id === 'src/foo.ts::a');
    expect(fn?.style.fill).not.toBe(ext?.style.fill);
  });

  it('空入力なら空 document を返す', () => {
    const doc = buildFunctionGraphDocument({
      elementId: 'x', nodes: [], edges: [],
    }, false);
    expect(doc.nodes).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
  });
});
