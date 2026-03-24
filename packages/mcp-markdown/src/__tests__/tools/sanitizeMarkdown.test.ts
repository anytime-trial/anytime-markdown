import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { sanitize } from '../../tools/sanitizeMarkdown';

describe('sanitize', () => {
  it('should sanitize markdown content', async () => {
    const input = '# Title\n\nSome content\n';
    const result = await sanitize({ content: input }, '/tmp');
    expect(typeof result).toBe('string');
    expect(result).toContain('# Title');
  });

  it('should read from file when path is provided', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'test.md'), '# Hello\n\nWorld\n');
      const result = await sanitize({ path: 'test.md' }, tmpDir);
      expect(result).toContain('# Hello');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });

  it('should throw when neither content nor path is provided', async () => {
    await expect(sanitize({}, '/tmp')).rejects.toThrow('Either content or path must be provided');
  });

  it('should preserve code blocks', async () => {
    const input = '# Title\n\n```js\nconst x = 1;\n```\n';
    const result = await sanitize({ content: input }, '/tmp');
    expect(result).toContain('```js');
    expect(result).toContain('const x = 1;');
  });
});
