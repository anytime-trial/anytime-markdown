import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { batchImport } from '../../tools/batchImport';
import { readGraph } from '../../tools/readGraph';

describe('batchImport', () => {
  let tmpDir: string;
  const testFile = 'test.graph';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-batch-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should create graph from batch input', async () => {
    const result = await batchImport({
      path: testFile,
      name: 'Test',
      nodes: [
        { id: 'a', text: 'Node A', metadata: { year: 2020 } },
        { id: 'b', text: 'Node B', metadata: { year: 2021 } },
      ],
      edges: [
        { fromId: 'a', toId: 'b', weight: 0.7 },
      ],
    }, tmpDir);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].weight).toBe(0.7);

    // 永続化確認
    const doc = await readGraph({ path: testFile }, tmpDir);
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(1);
  });
});
