import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listDocuments, pairDocuments } from '../src/document';
import type { GoldenFile } from '../src/types';

describe('listDocuments', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mdeval-list-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('lists files matching glob recursively', async () => {
    writeFileSync(join(tmp, '01-system.ja.md'), '# top\n');
    mkdirSync(join(tmp, '03.feature-detail'));
    writeFileSync(join(tmp, '03.feature-detail/feature-a.ja.md'), '# a\n');
    writeFileSync(join(tmp, 'README.md'), 'unrelated'); // not .ja.md

    const result = await listDocuments(tmp, '**/*.ja.md', []);
    expect(result.sort()).toEqual(['01-system.ja.md', '03.feature-detail/feature-a.ja.md']);
  });

  it('excludes files matching excludeGlobs', async () => {
    writeFileSync(join(tmp, '01-system.ja.md'), '# top\n');
    mkdirSync(join(tmp, '_eval'));
    writeFileSync(join(tmp, '_eval/20260517-eval.ja.md'), '# eval\n');

    const result = await listDocuments(tmp, '**/*.ja.md', ['_eval/**']);
    expect(result).toEqual(['01-system.ja.md']);
  });

  it('returns empty array for non-existent directory', async () => {
    const result = await listDocuments(join(tmp, 'does-not-exist'), '**/*.ja.md', []);
    expect(result).toEqual([]);
  });

  it('returns empty array when no files match', async () => {
    writeFileSync(join(tmp, 'README.txt'), 'unrelated');
    const result = await listDocuments(tmp, '**/*.ja.md', []);
    expect(result).toEqual([]);
  });
});

describe('pairDocuments', () => {
  const mkGolden = (paths: string[]): GoldenFile[] =>
    paths.map((p) => ({ relativePath: p, content: `# ${p}\n` }));

  it('pairs documents present in both', () => {
    const golden = mkGolden(['01.md', '02.md']);
    const candidate = ['01.md', '02.md'];
    const { matched, unmatchedReference, unmatchedCandidate } = pairDocuments(
      golden,
      candidate,
    );
    expect(matched.map((p) => p.relativePath).sort()).toEqual(['01.md', '02.md']);
    expect(unmatchedReference).toEqual([]);
    expect(unmatchedCandidate).toEqual([]);
  });

  it('puts golden-only files in unmatchedReference', () => {
    const golden = mkGolden(['01.md', '02.md']);
    const candidate = ['01.md'];
    const { matched, unmatchedReference, unmatchedCandidate } = pairDocuments(
      golden,
      candidate,
    );
    expect(matched.map((p) => p.relativePath)).toEqual(['01.md']);
    expect(unmatchedReference).toEqual(['02.md']);
    expect(unmatchedCandidate).toEqual([]);
  });

  it('puts candidate-only files in unmatchedCandidate', () => {
    const golden = mkGolden(['01.md']);
    const candidate = ['01.md', '02.md'];
    const { matched, unmatchedReference, unmatchedCandidate } = pairDocuments(
      golden,
      candidate,
    );
    expect(matched.map((p) => p.relativePath)).toEqual(['01.md']);
    expect(unmatchedReference).toEqual([]);
    expect(unmatchedCandidate).toEqual(['02.md']);
  });

  it('handles empty inputs', () => {
    const { matched, unmatchedReference, unmatchedCandidate } = pairDocuments([], []);
    expect(matched).toEqual([]);
    expect(unmatchedReference).toEqual([]);
    expect(unmatchedCandidate).toEqual([]);
  });

  it('returns golden content in matched pairs', () => {
    const golden: GoldenFile[] = [{ relativePath: '01.md', content: 'golden body' }];
    const candidate = ['01.md'];
    const { matched } = pairDocuments(golden, candidate);
    expect(matched[0].golden).toEqual({ relativePath: '01.md', content: 'golden body' });
    expect(matched[0].candidateRelativePath).toBe('01.md');
  });
});
