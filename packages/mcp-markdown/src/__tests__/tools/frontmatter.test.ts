import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getFrontmatter, updateFrontmatter } from '../../tools/frontmatter';

const DOC = `---
title: Sample
status: draft
related:
  - to: spec/x.md
    type: depends-on
---

# Body heading

body text that must not change
`;

describe('frontmatter tools', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fm-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('getFrontmatter returns data only (no body)', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), DOC);
    const data = await getFrontmatter({ path: 'a.md' }, tmpDir);
    expect(data.title).toBe('Sample');
    expect(data.status).toBe('draft');
    expect(data.related).toEqual([{ to: 'spec/x.md', type: 'depends-on' }]);
    expect(JSON.stringify(data)).not.toContain('body text');
  });

  it('updateFrontmatter merges set keys and preserves body', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), DOC);
    await updateFrontmatter({ path: 'a.md', set: { status: 'published', tags: ['x', 'y'] } }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'a.md'), 'utf-8');
    const data = await getFrontmatter({ path: 'a.md' }, tmpDir);
    expect(data.status).toBe('published');
    expect(data.tags).toEqual(['x', 'y']);
    expect(data.title).toBe('Sample'); // untouched key preserved
    expect(content).toContain('body text that must not change');
  });

  it('updateFrontmatter removes keys via removeKeys', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), DOC);
    await updateFrontmatter({ path: 'a.md', removeKeys: ['status'] }, tmpDir);
    const data = await getFrontmatter({ path: 'a.md' }, tmpDir);
    expect(data.status).toBeUndefined();
    expect(data.title).toBe('Sample');
  });

  it('updateFrontmatter adds frontmatter when absent', async () => {
    await fs.writeFile(path.join(tmpDir, 'plain.md'), '# Just a body\n\nno frontmatter here\n');
    await updateFrontmatter({ path: 'plain.md', set: { title: 'Added' } }, tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'plain.md'), 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    const data = await getFrontmatter({ path: 'plain.md' }, tmpDir);
    expect(data.title).toBe('Added');
    expect(content).toContain('no frontmatter here');
  });

  it('updateFrontmatter returns a summary of set/removed keys', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), DOC);
    const summary = await updateFrontmatter(
      { path: 'a.md', set: { status: 'published' }, removeKeys: ['title', 'nonexistent'] },
      tmpDir,
    );
    expect(summary.setKeys).toEqual(['status']);
    expect(summary.removedKeys).toEqual(['title']); // 実在したキーのみ報告
    expect(summary.createdFrontmatter).toBe(false);
  });

  it('updateFrontmatter reports createdFrontmatter when frontmatter was absent', async () => {
    await fs.writeFile(path.join(tmpDir, 'plain.md'), '# Just a body\n');
    const summary = await updateFrontmatter({ path: 'plain.md', set: { title: 'Added' } }, tmpDir);
    expect(summary.createdFrontmatter).toBe(true);
  });

  it('rejects paths outside root and bad extensions', async () => {
    await expect(getFrontmatter({ path: '../escape.md' }, tmpDir)).rejects.toThrow();
    await expect(getFrontmatter({ path: 'a.txt' }, tmpDir)).rejects.toThrow('File type not allowed');
  });
});
