import { createBody, syncBodies } from '../../../engine/physics/PhysicsBody';
import type { GraphNode } from '../../../types';
import { createNode } from '../../../types';

describe('createBody', () => {
  it('should create a PhysicsBody from a GraphNode', () => {
    const node = createNode('rect', 100, 200);
    const body = createBody(node);
    expect(body.id).toBe(node.id);
    expect(body.x).toBe(100);
    expect(body.y).toBe(200);
    expect(body.width).toBe(node.width);
    expect(body.height).toBe(node.height);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
    expect(body.fx).toBe(0);
    expect(body.fy).toBe(0);
    expect(body.fixed).toBe(false);
    expect(body.mass).toBe(1.0);
  });

  it('should set fixed=true for locked nodes', () => {
    const node = { ...createNode('rect', 0, 0), locked: true };
    const body = createBody(node);
    expect(body.fixed).toBe(true);
  });
});

describe('syncBodies', () => {
  it('should create bodies for new nodes and remove stale ones', () => {
    const node1 = createNode('rect', 0, 0);
    const node2 = createNode('rect', 100, 100);
    const existing = new Map([[node1.id, createBody(node1)]]);

    const result = syncBodies([node2], existing);
    expect(result.has(node2.id)).toBe(true);
    expect(result.has(node1.id)).toBe(false);
  });

  it('should preserve velocity of existing bodies', () => {
    const node = createNode('rect', 0, 0);
    const body = createBody(node);
    body.vx = 5;
    body.vy = 10;
    const existing = new Map([[node.id, body]]);

    const updated = { ...node, x: 50, y: 50 };
    const result = syncBodies([updated], existing);
    const synced = result.get(node.id)!;
    expect(synced.x).toBe(50);
    expect(synced.y).toBe(50);
    expect(synced.vx).toBe(5);
    expect(synced.vy).toBe(10);
  });
});
