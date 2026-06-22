import { computeRootedTreeLayout } from '../../../engine/physics/rootedTree';
import { createBody } from '../../../engine/physics/PhysicsBody';
import { createNode, createEdge } from '../../../types';
import type { PhysicsBody } from '../../../engine/physics/types';

function bodies(ids: string[]): Map<string, PhysicsBody> {
  const m = new Map<string, PhysicsBody>();
  for (const id of ids) m.set(id, createBody({ ...createNode('rect', 0, 0), id, width: 100, height: 60 }));
  return m;
}
function edge(from: string, to: string) {
  return createEdge('connector', { nodeId: from, x: 0, y: 0 }, { nodeId: to, x: 0, y: 0 });
}

describe('computeRootedTreeLayout', () => {
  it('rootId をレイヤ 0 に配置する（TB: 最小 y）', () => {
    const b = bodies(['r', 'a', 'b']);
    computeRootedTreeLayout(b, [edge('a', 'r'), edge('r', 'b')], 'r', 'TB');
    const ys = ['r', 'a', 'b'].map((id) => b.get(id)!.y);
    expect(b.get('r')!.y).toBe(Math.min(...ys));
  });

  it('循環があっても例外なく配置する（tree edge のみ使用）', () => {
    const b = bodies(['r', 'a', 'c']);
    expect(() => computeRootedTreeLayout(b, [edge('r', 'a'), edge('a', 'c'), edge('c', 'r')], 'r', 'TB')).not.toThrow();
  });

  it('disconnected ノードも配置される（座標が設定される）', () => {
    const b = bodies(['r', 'a', 'x']); // x は孤立
    computeRootedTreeLayout(b, [edge('r', 'a')], 'r', 'TB');
    const x = b.get('x')!;
    expect(Number.isFinite(x.x)).toBe(true);
    expect(Number.isFinite(x.y)).toBe(true);
  });
});
