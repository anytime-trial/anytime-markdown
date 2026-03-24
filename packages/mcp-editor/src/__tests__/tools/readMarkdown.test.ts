import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readMarkdown } from '../../tools/readMarkdown';

describe('readMarkdown', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should read a markdown file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Hello\n\nWorld');
    const result = await readMarkdown({ path: 'test.md' }, tmpDir);
    expect(result).toBe('# Hello\n\nWorld');
  });

  it('should reject non-markdown files', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello');
    await expect(readMarkdown({ path: 'test.txt' }, tmpDir)).rejects.toThrow('File type not allowed');
  });

  it('should reject path traversal', async () => {
    await expect(readMarkdown({ path: '../evil.md' }, tmpDir)).rejects.toThrow('Access denied');
  });

  it('should throw on non-existent file', async () => {
    await expect(readMarkdown({ path: 'missing.md' }, tmpDir)).rejects.toThrow();
  });
});
