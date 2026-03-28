import { createNode, createEdge, createDocument, DEFAULT_STICKY_STYLE, DEFAULT_NODE_STYLE, getDefaultNodeStyle, getDefaultEdgeStyle } from '../types';
import { getCanvasColors } from '../theme';

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

describe('getCanvasColors', () => {
  it('should return dark colors when isDark is true', () => {
    const colors = getCanvasColors(true);
    expect(colors.canvasBg).toBe('#0D1117');
    expect(colors.textPrimary).toBe('#FFFFFF');
  });

  it('should return light colors when isDark is false', () => {
    const colors = getCanvasColors(false);
    expect(colors.canvasBg).toBe('#F5F5F0');
    expect(colors.textPrimary).toBe('#1A1A1A');
  });
});

describe('getDefaultNodeStyle', () => {
  it('should return dark style when isDark is true', () => {
    const style = getDefaultNodeStyle(true);
    expect(style.fill).toBe(DEFAULT_NODE_STYLE.fill);
  });

  it('should return light style when isDark is false', () => {
    const style = getDefaultNodeStyle(false);
    expect(style.fill).toBe('#F5F5F0');
  });
});

describe('getDefaultEdgeStyle', () => {
  it('should return dark style when isDark is true', () => {
    const style = getDefaultEdgeStyle(true);
    expect(style.stroke).toBe(DEFAULT_NODE_STYLE.stroke);
  });

  it('should return light style when isDark is false', () => {
    const style = getDefaultEdgeStyle(false);
    expect(style.stroke).toBe('rgba(0,0,0,0.3)');
  });
});

describe('createNode with light theme', () => {
  it('should create node with light theme styles', () => {
    const node = createNode('rect', 0, 0, undefined, false);
    expect(node.style.fill).toBe('#F5F5F0');
  });

  it('should create sticky with light theme', () => {
    const node = createNode('sticky', 0, 0, undefined, false);
    expect(node.style.fill).toBe(DEFAULT_STICKY_STYLE.fill);
  });

  it('should create doc node with light theme', () => {
    const node = createNode('doc', 0, 0, undefined, false);
    expect(node.docContent).toBe('');
    expect(node.style.fill).toBeDefined();
  });

  it('should create frame node with light theme', () => {
    const node = createNode('frame', 0, 0, undefined, false);
    expect(node.style.borderRadius).toBe(8);
  });

  it('should create diamond node with specific dimensions', () => {
    const node = createNode('diamond', 0, 0);
    expect(node.width).toBe(120);
    expect(node.height).toBe(120);
  });

  it('should create parallelogram node', () => {
    const node = createNode('parallelogram', 0, 0);
    expect(node.width).toBe(160);
    expect(node.height).toBe(80);
  });

  it('should create cylinder node', () => {
    const node = createNode('cylinder', 0, 0);
    expect(node.width).toBe(100);
    expect(node.height).toBe(120);
  });

  it('should create image node', () => {
    const node = createNode('image', 0, 0);
    expect(node.width).toBe(200);
    expect(node.height).toBe(150);
  });
});

describe('createEdge with light theme', () => {
  it('should create edge with light theme style', () => {
    const edge = createEdge('arrow', { x: 0, y: 0 }, { x: 100, y: 100 }, undefined, false);
    expect(edge.style.stroke).toBe('rgba(0,0,0,0.3)');
  });
});
