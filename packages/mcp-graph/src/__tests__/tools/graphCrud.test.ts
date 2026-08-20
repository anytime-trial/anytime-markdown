import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readGraph } from '../../tools/readGraph';
import { writeGraph } from '../../tools/writeGraph';
import { batchImport } from '../../tools/batchImport';

describe('readGraph', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should read a graph document', async () => {
    await batchImport({ path: 'test.graph', name: 'Read', nodes: [], edges: [] }, tmpDir);
    const result = await readGraph({ path: 'test.graph' }, tmpDir);
    expect(result.name).toBe('Read');
    expect(result.nodes).toEqual([]);
  });

  it('should reject path traversal', async () => {
    await expect(readGraph({ path: '../evil.graph' }, tmpDir)).rejects.toThrow('Access denied');
  });

  it('should throw on non-existent file', async () => {
    await expect(readGraph({ path: 'missing.graph' }, tmpDir)).rejects.toThrow();
  });
});

describe('writeGraph', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should write a graph document', async () => {
    const doc = await batchImport({ path: 'test.graph', name: 'Write', nodes: [], edges: [] }, tmpDir);
    doc.name = 'Updated';
    await writeGraph({ path: 'test.graph', document: doc }, tmpDir);
    const content = JSON.parse(await fs.readFile(path.join(tmpDir, 'test.graph'), 'utf-8'));
    expect(content.name).toBe('Updated');
  });
});
