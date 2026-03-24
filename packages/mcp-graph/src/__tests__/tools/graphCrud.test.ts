import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readGraph } from '../../tools/readGraph';
import { writeGraph } from '../../tools/writeGraph';
import { createGraphFile } from '../../tools/createGraph';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';

describe('createGraphFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should create a new graph document', async () => {
    const result = await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
    expect(result.name).toBe('Test');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.id).toBeDefined();
    const content = await fs.readFile(path.join(tmpDir, 'test.graph.json'), 'utf-8');
    expect(JSON.parse(content).name).toBe('Test');
  });

  it('should reject non-graph files', async () => {
    await expect(createGraphFile({ path: 'test.json', name: 'T' }, tmpDir)).rejects.toThrow('File type not allowed');
  });
});

describe('readGraph', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should read a graph document', async () => {
    await createGraphFile({ path: 'test.graph.json', name: 'Read' }, tmpDir);
    const result = await readGraph({ path: 'test.graph.json' }, tmpDir);
    expect(result.name).toBe('Read');
    expect(result.nodes).toEqual([]);
  });

  it('should reject path traversal', async () => {
    await expect(readGraph({ path: '../evil.graph.json' }, tmpDir)).rejects.toThrow('Access denied');
  });

  it('should throw on non-existent file', async () => {
    await expect(readGraph({ path: 'missing.graph.json' }, tmpDir)).rejects.toThrow();
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
    const doc = await createGraphFile({ path: 'test.graph.json', name: 'Write' }, tmpDir);
    doc.name = 'Updated';
    await writeGraph({ path: 'test.graph.json', document: doc }, tmpDir);
    const content = JSON.parse(await fs.readFile(path.join(tmpDir, 'test.graph.json'), 'utf-8'));
    expect(content.name).toBe('Updated');
  });
});
