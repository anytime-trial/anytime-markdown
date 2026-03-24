import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { diff } from '../../tools/computeDiff';

describe('computeDiff tool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should compute diff between two content strings', async () => {
    const result = await diff({
      contentA: '# Title\n\nOld line\n',
      contentB: '# Title\n\nNew line\n',
    }, tmpDir);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('should compute diff between two files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '# A\n');
    await fs.writeFile(path.join(tmpDir, 'b.md'), '# B\n');
    const result = await diff({ pathA: 'a.md', pathB: 'b.md' }, tmpDir);
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it('should return empty blocks for identical content', async () => {
    const result = await diff({
      contentA: '# Same\n',
      contentB: '# Same\n',
    }, tmpDir);
    expect(result.blocks).toHaveLength(0);
  });

  it('should throw when input is incomplete', async () => {
    await expect(diff({ contentA: 'a' }, tmpDir)).rejects.toThrow('Provide either');
  });

  it('should reject non-markdown files', async () => {
    await expect(diff({ pathA: 'a.txt', pathB: 'b.txt' }, tmpDir)).rejects.toThrow('File type not allowed');
  });
});
