import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createGraphFile } from '../../tools/createGraph';
import { addNode } from '../../tools/addNode';
import { updateNode } from '../../tools/updateNode';
import { removeNode } from '../../tools/removeNode';
import { readGraph } from '../../tools/readGraph';
import { createEdge, type GraphEdge, type EdgeEndpoint } from '@anytime-markdown/graph-core/types';

describe('addNode', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should add a node with gridSnap applied', async () => {
    const node = await addNode({
      path: 'test.graph.json',
      type: 'rect',
      x: 103,
      y: 207,
      text: 'Hello',
    }, tmpDir);
    expect(node.type).toBe('rect');
    expect(node.text).toBe('Hello');
    // gridSnap: 103 → 100, 207 → 200 (grid=20)
    expect(node.x % 20).toBe(0);
    expect(node.y % 20).toBe(0);
    // verify persisted
    const doc = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(doc.nodes).toHaveLength(1);
  });

  it('should add node with custom dimensions', async () => {
    const node = await addNode({
      path: 'test.graph.json',
      type: 'ellipse',
      x: 100,
      y: 200,
      width: 200,
      height: 100,
    }, tmpDir);
    expect(node.width).toBe(200);
    expect(node.height).toBe(100);
  });
});

describe('updateNode', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should update node properties', async () => {
    const node = await addNode({ path: 'test.graph.json', type: 'rect', x: 100, y: 100, text: 'Old' }, tmpDir);
    const updated = await updateNode({ path: 'test.graph.json', nodeId: node.id, changes: { text: 'New' } }, tmpDir);
    expect(updated.text).toBe('New');
    const doc = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(doc.nodes[0].text).toBe('New');
  });

  it('should throw for non-existent node', async () => {
    await expect(updateNode({ path: 'test.graph.json', nodeId: 'fake-id', changes: { text: 'X' } }, tmpDir))
      .rejects.toThrow('not found');
  });
});

describe('removeNode', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should remove node and connected edges', async () => {
    const n1 = await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'A' }, tmpDir);
    const n2 = await addNode({ path: 'test.graph.json', type: 'rect', x: 200, y: 0, text: 'B' }, tmpDir);

    // manually add an edge
    const doc = await readGraph({ path: 'test.graph.json' }, tmpDir);
    const edge = createEdge('arrow', { nodeId: n1.id, x: 0, y: 0 }, { nodeId: n2.id, x: 0, y: 0 });
    doc.edges.push(edge);
    await fs.writeFile(path.join(tmpDir, 'test.graph.json'), JSON.stringify(doc, null, 2));

    await removeNode({ path: 'test.graph.json', nodeId: n1.id }, tmpDir);
    const after = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(after.nodes).toHaveLength(1);
    expect(after.nodes[0].id).toBe(n2.id);
    expect(after.edges).toHaveLength(0);
  });

  it('should throw for non-existent node', async () => {
    await expect(removeNode({ path: 'test.graph.json', nodeId: 'fake' }, tmpDir)).rejects.toThrow('not found');
  });
});
