import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { writeMarkdown } from '../../tools/writeMarkdown';

describe('writeMarkdown', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should write a markdown file', async () => {
    await writeMarkdown({ path: 'test.md', content: '# Hello' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'test.md'), 'utf-8');
    expect(content).toBe('# Hello');
  });

  it('should create intermediate directories', async () => {
    await writeMarkdown({ path: 'sub/dir/test.md', content: '# Nested' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'sub/dir/test.md'), 'utf-8');
    expect(content).toBe('# Nested');
  });

  it('should overwrite existing file', async () => {
    await writeMarkdown({ path: 'test.md', content: 'old' }, tmpDir);
    await writeMarkdown({ path: 'test.md', content: 'new' }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'test.md'), 'utf-8');
    expect(content).toBe('new');
  });

  it('should reject non-markdown files', async () => {
    await expect(writeMarkdown({ path: 'test.txt', content: 'hello' }, tmpDir)).rejects.toThrow('File type not allowed');
  });

  it('should reject path traversal', async () => {
    await expect(writeMarkdown({ path: '../evil.md', content: 'bad' }, tmpDir)).rejects.toThrow('Access denied');
  });
});
