import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getOutline, extractHeadingsFromText } from '../../tools/getOutline';

describe('extractHeadingsFromText', () => {
  it('should extract flat headings', () => {
    const md = '# Title\n\nContent\n\n## Section A\n\nText\n\n## Section B\n';
    const result = extractHeadingsFromText(md);
    expect(result).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section A', line: 5 },
      { level: 2, text: 'Section B', line: 9 },
    ]);
  });

  it('should ignore headings inside code blocks', () => {
    const md = '# Real\n\n```\n# Not a heading\n```\n\n## Also Real\n';
    const result = extractHeadingsFromText(md);
    expect(result).toEqual([
      { level: 1, text: 'Real', line: 1 },
      { level: 2, text: 'Also Real', line: 7 },
    ]);
  });

  it('should handle empty document', () => {
    expect(extractHeadingsFromText('')).toEqual([]);
  });

  it('should handle headings with inline formatting', () => {
    const md = '## **Bold** and *italic*\n';
    const result = extractHeadingsFromText(md);
    expect(result).toEqual([
      { level: 2, text: '**Bold** and *italic*', line: 1 },
    ]);
  });

  it('should handle headings up to level 6', () => {
    const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n';
    const result = extractHeadingsFromText(md);
    expect(result).toHaveLength(6);
    expect(result[5]).toEqual({ level: 6, text: 'H6', line: 6 });
  });

  it('should ignore lines with 7+ hashes', () => {
    const md = '####### Not a heading\n';
    const result = extractHeadingsFromText(md);
    expect(result).toEqual([]);
  });

  it('should handle fenced code blocks with language', () => {
    const md = '# Before\n\n```typescript\n# Inside code\n```\n\n# After\n';
    const result = extractHeadingsFromText(md);
    expect(result).toEqual([
      { level: 1, text: 'Before', line: 1 },
      { level: 1, text: 'After', line: 7 },
    ]);
  });
});

describe('getOutline', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should return outline from file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Title\n## Sub\n');
    const result = await getOutline({ path: 'test.md' }, tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ level: 1, text: 'Title', line: 1 });
    expect(result[1]).toEqual({ level: 2, text: 'Sub', line: 2 });
  });

  it('should reject non-markdown files', async () => {
    await expect(getOutline({ path: 'test.txt' }, tmpDir)).rejects.toThrow('File type not allowed');
  });
});
