import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { formatMarkdownTool } from '../../tools/formatMarkdown';

async function withTmpFile(name: string, content: string, fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fmt-'));
  try {
    await fs.writeFile(path.join(dir, name), content);
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
}

describe('formatMarkdownTool', () => {
  it('fix mode writes the formatted file in place and reports changed', async () => {
    await withTmpFile('a.md', 'intro\n# Title\nbody\n', async (dir) => {
      const res = await formatMarkdownTool({ path: 'a.md', mode: 'fix' }, dir);
      expect(res.changed).toBe(true);
      expect(res.rulesApplied.headingBlankLines).toBeGreaterThan(0);
      const written = await fs.readFile(path.join(dir, 'a.md'), 'utf-8');
      expect(written).toBe('intro\n\n# Title\n\nbody\n');
    });
  });

  it('the result object does not contain the document body', async () => {
    await withTmpFile('a.md', 'intro\n# Title\nbody\n', async (dir) => {
      const res = await formatMarkdownTool({ path: 'a.md', mode: 'fix' }, dir);
      const json = JSON.stringify(res);
      expect(json).not.toContain('Title');
      expect(json).not.toContain('body');
    });
  });

  it('check mode does not write but reports detections', async () => {
    const input = 'intro\n# Title\nbody\n';
    await withTmpFile('a.md', input, async (dir) => {
      const res = await formatMarkdownTool({ path: 'a.md', mode: 'check' }, dir);
      expect(res.changed).toBe(false);
      expect(res.rulesApplied.headingBlankLines).toBeGreaterThan(0);
      const unchanged = await fs.readFile(path.join(dir, 'a.md'), 'utf-8');
      expect(unchanged).toBe(input);
    });
  });

  it('reports changed=false when the file is already well-formed', async () => {
    const clean = '# Title\n\nbody\n';
    await withTmpFile('a.md', clean, async (dir) => {
      const res = await formatMarkdownTool({ path: 'a.md', mode: 'fix' }, dir);
      expect(res.changed).toBe(false);
      const unchanged = await fs.readFile(path.join(dir, 'a.md'), 'utf-8');
      expect(unchanged).toBe(clean);
    });
  });

  it('returns warnings for nesting depth', async () => {
    await withTmpFile('a.md', '- a\n    - b\n        - c\n', async (dir) => {
      const res = await formatMarkdownTool({ path: 'a.md' }, dir);
      expect(res.warnings.some((w) => w.rule === 'nestDepth')).toBe(true);
    });
  });

  it('rejects non-markdown extensions', async () => {
    await expect(formatMarkdownTool({ path: 'a.txt' }, '/tmp')).rejects.toThrow('File type not allowed');
  });

  it('rejects paths outside the root directory', async () => {
    await expect(formatMarkdownTool({ path: '../escape.md' }, '/tmp/root')).rejects.toThrow('Access denied');
  });
});
