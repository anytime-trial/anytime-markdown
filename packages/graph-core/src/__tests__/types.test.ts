import { createNode, createEdge, createDocument, DEFAULT_STICKY_STYLE, DEFAULT_NODE_STYLE } from '../types';

describe('createNode', () => {
  it('should create a rect node with default style', () => {
    const node = createNode('rect', 100, 200);
    expect(node.type).toBe('rect');
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
    expect(node.width).toBe(150);
    expect(node.height).toBe(100);
    expect(node.style.fill).toBe(DEFAULT_NODE_STYLE.fill);
    expect(node.id).toBeDefined();
  });

  it('should create a sticky node with sticky style', () => {
    const node = createNode('sticky', 0, 0);
    expect(node.style.fill).toBe(DEFAULT_STICKY_STYLE.fill);
  });

  it('should create a text node with smaller default size', () => {
    const node = createNode('text', 0, 0);
    expect(node.width).toBe(150);
    expect(node.height).toBe(30);
  });

  it('should apply overrides', () => {
    const node = createNode('rect', 0, 0, { text: 'hello' });
    expect(node.text).toBe('hello');
  });
});

describe('createEdge', () => {
  it('should create an edge with endpoints', () => {
    const edge = createEdge('arrow', { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(edge.type).toBe('arrow');
    expect(edge.from.x).toBe(0);
    expect(edge.to.x).toBe(100);
    expect(edge.id).toBeDefined();
  });

  it('should create a connector with node references', () => {
    const edge = createEdge('connector', { nodeId: 'a', x: 0, y: 0 }, { nodeId: 'b', x: 100, y: 100 });
    expect(edge.from.nodeId).toBe('a');
    expect(edge.to.nodeId).toBe('b');
  });
});

describe('createDocument', () => {
  it('should create an empty document', () => {
    const doc = createDocument('Test');
    expect(doc.name).toBe('Test');
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
    expect(doc.viewport.scale).toBe(1);
    expect(doc.createdAt).toBeGreaterThan(0);
  });
});
