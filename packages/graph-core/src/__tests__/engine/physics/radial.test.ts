import { computeRadialLayout } from '../../../engine/physics/radial';
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

describe('computeRadialLayout', () => {
  it('root を中心（中心座標 0,0）に配置する', () => {
    const b = bodies(['r', 'a', 'b']);
    computeRadialLayout(b, [edge('r', 'a'), edge('r', 'b')], 'r', 180);
    const r = b.get('r')!;
    expect(r.x).toBeCloseTo(-50); // 中心 0 - width/2
    expect(r.y).toBeCloseTo(-30);
  });

  it('子は depth=1 のリング（半径 ringGap）に配置される', () => {
    const b = bodies(['r', 'a']);
    computeRadialLayout(b, [edge('r', 'a')], 'r', 180);
    const a = b.get('a')!;
    const cx = a.x + 50, cy = a.y + 30;
    expect(Math.hypot(cx, cy)).toBeCloseTo(180, 1);
  });

  it('rootId 未指定時は入次数 0 のノードを root にする', () => {
    const b = bodies(['r', 'a']);
    computeRadialLayout(b, [edge('r', 'a')], undefined, 180);
    const r = b.get('r')!;
    expect(r.x).toBeCloseTo(-50);
  });
});
