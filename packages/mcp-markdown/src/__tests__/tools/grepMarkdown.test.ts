import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { grepMarkdownText, grepMarkdown } from '../../tools/grepMarkdown';

const DOC = [
  '# Title',
  'intro mentions widget here',
  '## Section A',
  'alpha line with WIDGET upper',
  '### Sub A1',
  'nested widget reference',
  '## Section B',
  'beta line no match',
].join('\n');

describe('grepMarkdownText', () => {
  it('returns matching lines with line number and enclosing heading', () => {
    const matches = grepMarkdownText(DOC, 'widget');
    // 'intro mentions widget here' (line 2, under Title) and 'nested widget reference' (line 6, under Sub A1)
    const lines = matches.map((m) => m.line);
    expect(lines).toContain(2);
    expect(lines).toContain(6);
    const m2 = matches.find((m) => m.line === 2);
    expect(m2?.heading).toBe('Title');
    const m6 = matches.find((m) => m.line === 6);
    expect(m6?.heading).toBe('Sub A1');
    expect(m6?.snippet).toContain('widget');
  });

  it('is case-sensitive by default, case-insensitive with ignoreCase', () => {
    expect(grepMarkdownText(DOC, 'WIDGET').map((m) => m.line)).toEqual([4]);
    const ci = grepMarkdownText(DOC, 'WIDGET', { ignoreCase: true }).map((m) => m.line);
    expect(ci).toEqual([2, 4, 6]);
  });

  it('caps results at maxMatches', () => {
    expect(grepMarkdownText(DOC, 'widget', { ignoreCase: true, maxMatches: 1 }).length).toBe(1);
  });

  it('returns empty array for no match and empty pattern', () => {
    expect(grepMarkdownText(DOC, 'zzznomatch')).toEqual([]);
    expect(grepMarkdownText(DOC, '')).toEqual([]);
  });

  it('truncates long lines with ellipsis around the match', () => {
    const longLine = `${'x'.repeat(80)}NEEDLE${'y'.repeat(80)}`;
    const matches = grepMarkdownText(`## H\n${longLine}`, 'NEEDLE');
    expect(matches[0].snippet).toContain('NEEDLE');
    expect(matches[0].snippet.startsWith('…')).toBe(true);
    expect(matches[0].snippet.endsWith('…')).toBe(true);
    expect(matches[0].snippet.length).toBeLessThan(longLine.length);
  });
});

describe('grepMarkdown (file)', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-grep-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('greps a file on disk', async () => {
    await fs.writeFile(path.join(tmpDir, 'd.md'), DOC);
    const matches = await grepMarkdown({ path: 'd.md', pattern: 'beta' }, tmpDir);
    expect(matches.length).toBe(1);
    expect(matches[0].heading).toBe('Section B');
  });

  it('rejects bad extension and path escape', async () => {
    await expect(grepMarkdown({ path: 'd.txt', pattern: 'x' }, tmpDir)).rejects.toThrow('File type not allowed');
    await expect(grepMarkdown({ path: '../d.md', pattern: 'x' }, tmpDir)).rejects.toThrow();
  });
});
