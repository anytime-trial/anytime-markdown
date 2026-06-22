import { resolveEdgesForRender } from '../../engine/edgeResolution';
import { createNode, createEdge } from '../../types';

function nodeAt(id: string, x: number, y: number) {
  return { ...createNode('rect', x, y, { text: id }), id, width: 100, height: 60 };
}

describe('resolveEdgesForRender', () => {
  it('connector の端点をノード位置から解決する', () => {
    const a = nodeAt('a', 0, 0);
    const b = nodeAt('b', 300, 0);
    const e = createEdge('connector', { nodeId: 'a', x: 0, y: 0 }, { nodeId: 'b', x: 0, y: 0 });
    const [res] = resolveEdgesForRender([a, b], [e]);
    expect(res.from.x).not.toBe(0);
    expect(res.to.x).not.toBe(0);
    expect(res.waypoints?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('layoutRunning 時は中心間直線（type=line・waypoints なし）になる', () => {
    const a = nodeAt('a', 0, 0);
    const b = nodeAt('b', 300, 0);
    const e = createEdge('connector', { nodeId: 'a', x: 0, y: 0 }, { nodeId: 'b', x: 0, y: 0 });
    const [res] = resolveEdgesForRender([a, b], [e], { layoutRunning: true });
    expect(res.type).toBe('line');
    expect(res.waypoints).toBeUndefined();
    expect(res.from.x).toBe(50);  // 0 + 100/2
    expect(res.to.x).toBe(350);   // 300 + 100/2
  });

  it('non-connector エッジはそのまま返す', () => {
    const a = nodeAt('a', 0, 0);
    const e = createEdge('line', { x: 1, y: 2 }, { x: 3, y: 4 });
    const [res] = resolveEdgesForRender([a], [e]);
    expect(res).toBe(e);
  });
});
