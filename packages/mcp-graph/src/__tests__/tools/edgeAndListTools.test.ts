import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createGraphFile } from '../../tools/createGraph';
import { addNode } from '../../tools/addNode';
import { addEdge } from '../../tools/addEdge';
import { removeEdge } from '../../tools/removeEdge';
import { listNodes } from '../../tools/listNodes';
import { readGraph } from '../../tools/readGraph';

describe('addEdge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should add an edge between two nodes', async () => {
    const n1 = await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'A' }, tmpDir);
    const n2 = await addNode({ path: 'test.graph.json', type: 'rect', x: 200, y: 0, text: 'B' }, tmpDir);
    const edge = await addEdge({
      path: 'test.graph.json',
      type: 'arrow',
      from: { nodeId: n1.id, x: 0, y: 0 },
      to: { nodeId: n2.id, x: 0, y: 0 },
    }, tmpDir);
    expect(edge.type).toBe('arrow');
    expect(edge.from.nodeId).toBe(n1.id);
    const doc = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(doc.edges).toHaveLength(1);
  });

  it('should throw if source node does not exist', async () => {
    const n2 = await addNode({ path: 'test.graph.json', type: 'rect', x: 200, y: 0 }, tmpDir);
    await expect(addEdge({
      path: 'test.graph.json',
      type: 'arrow',
      from: { nodeId: 'fake', x: 0, y: 0 },
      to: { nodeId: n2.id, x: 0, y: 0 },
    }, tmpDir)).rejects.toThrow('not found');
  });
});

describe('removeEdge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should remove an edge', async () => {
    const n1 = await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0 }, tmpDir);
    const n2 = await addNode({ path: 'test.graph.json', type: 'rect', x: 200, y: 0 }, tmpDir);
    const edge = await addEdge({
      path: 'test.graph.json', type: 'arrow',
      from: { nodeId: n1.id, x: 0, y: 0 }, to: { nodeId: n2.id, x: 0, y: 0 },
    }, tmpDir);
    await removeEdge({ path: 'test.graph.json', edgeId: edge.id }, tmpDir);
    const doc = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(doc.edges).toHaveLength(0);
  });

  it('should throw for non-existent edge', async () => {
    await expect(removeEdge({ path: 'test.graph.json', edgeId: 'fake' }, tmpDir)).rejects.toThrow('not found');
  });
});

describe('listNodes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should return node summaries', async () => {
    await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'A' }, tmpDir);
    await addNode({ path: 'test.graph.json', type: 'ellipse', x: 200, y: 0, text: 'B' }, tmpDir);
    const nodes = await listNodes({ path: 'test.graph.json' }, tmpDir);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe('rect');
    expect(nodes[0].text).toBe('A');
    expect(nodes[1].type).toBe('ellipse');
  });

  it('should return empty array for empty graph', async () => {
    const nodes = await listNodes({ path: 'test.graph.json' }, tmpDir);
    expect(nodes).toEqual([]);
  });
});
