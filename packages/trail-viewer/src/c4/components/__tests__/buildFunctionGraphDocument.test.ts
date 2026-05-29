import { buildFunctionGraphDocument } from '../buildFunctionGraphDocument';
import type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';

const sample: FunctionGraphResponse = {
  elementId: 'src/foo.ts',
  nodes: [
    { id: 'src/foo.ts::a', label: 'a', filePath: 'src/foo.ts', line: 1, kind: 'function' },
    { id: 'src/foo.ts::b', label: 'b', filePath: 'src/foo.ts', line: 5, kind: 'function' },
    { id: 'src/bar.ts::c', label: 'c', filePath: 'src/bar.ts', line: 1, kind: 'external' },
    { id: 'src/caller.ts::d', label: 'd', filePath: 'src/caller.ts', line: 10, kind: 'external_caller' },
  ],
  edges: [
    { source: 'src/foo.ts::a', target: 'src/foo.ts::b' },
    { source: 'src/foo.ts::b', target: 'src/bar.ts::c' },
    { source: 'src/caller.ts::d', target: 'src/foo.ts::a' },
  ],
};

describe('buildFunctionGraphDocument', () => {
  it('全ノード + 全エッジを含む GraphDocument を生成する', () => {
    const doc = buildFunctionGraphDocument(sample, false);
    expect(doc.nodes).toHaveLength(4);
    expect(doc.edges).toHaveLength(3);
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

  it('external_caller ノードは function/external と異なる色', () => {
    const doc = buildFunctionGraphDocument(sample, false);
    const caller = doc.nodes.find((n) => n.id === 'src/caller.ts::d');
    const fn = doc.nodes.find((n) => n.id === 'src/foo.ts::a');
    const ext = doc.nodes.find((n) => n.id === 'src/bar.ts::c');
    expect(caller?.style.fill).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(caller?.style.fill).not.toBe(fn?.style.fill);
    expect(caller?.style.fill).not.toBe(ext?.style.fill);
  });

  it('空入力なら空 document を返す', () => {
    const doc = buildFunctionGraphDocument({
      elementId: 'x', nodes: [], edges: [],
    }, false);
    expect(doc.nodes).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
  });

  it('多数ノードの star グラフでノード矩形が重ならない (overlap 回帰)', () => {
    // root から 20 個の子関数へ呼び出すフラットな star パターン。
    // 旧 RADIUS=200 固定実装ではこのケースで外周ノードが重なっていた。
    const root = {
      id: 'src/f.ts::root', label: 'root', filePath: 'src/f.ts', line: 1,
      kind: 'function' as const,
    };
    const children = Array.from({ length: 20 }, (_, i) => ({
      id: `src/f.ts::child${i}`,
      label: `child${i}`,
      filePath: 'src/f.ts',
      line: i + 2,
      kind: 'function' as const,
    }));
    const nodes = [root, ...children];
    const edges = children.map((c) => ({ source: root.id, target: c.id }));
    const doc = buildFunctionGraphDocument(
      { elementId: 'src/f.ts', nodes, edges },
      false,
    );

    // 全ノードペアで矩形 (AABB) が重なっていないことを検証
    const overlaps: Array<[string, string]> = [];
    for (let i = 0; i < doc.nodes.length; i++) {
      for (let j = i + 1; j < doc.nodes.length; j++) {
        const a = doc.nodes[i];
        const b = doc.nodes[j];
        const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
        if (overlapX && overlapY) overlaps.push([a.id, b.id]);
      }
    }
    expect(overlaps).toEqual([]);
  });
});
