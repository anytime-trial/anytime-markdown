import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluateReverseSpec } from '../src/orchestrator';

describe('evaluateReverseSpec', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mdeval-orch-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns empty result for empty inputs', async () => {
    const r = await evaluateReverseSpec({ goldenFiles: [], candidateDir: tmp });
    expect(r.pairs).toEqual([]);
    expect(r.unmatched).toEqual({ reference: [], candidate: [] });
    expect(r.meta.golden_count).toBe(0);
    expect(r.meta.candidate_count).toBe(0);
    expect(r.meta.document_glob).toBe('**/*.ja.md');
    expect(r.meta.exclude_globs).toEqual(['_eval/**']);
    expect(r.meta.max_excerpt_chars).toBe(15000);
  });

  it('pairs golden and candidate documents with heuristic scoring', async () => {
    const content = '# 概要\n\nMemoryPanel handles things';
    writeFileSync(join(tmp, '01-system.ja.md'), content);

    const r = await evaluateReverseSpec({
      goldenFiles: [{ relativePath: '01-system.ja.md', content }],
      candidateDir: tmp,
    });

    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].file).toBe('01-system.ja.md');
    expect(r.pairs[0].heuristic.intent).toBeCloseTo(1.0);
    expect(r.pairs[0].heuristic.design).toBeCloseTo(1.0);
    expect(r.pairs[0].heuristic.completeness).toBeCloseTo(1.0);
    expect(r.pairs[0].golden_excerpt).toBe(content);
    expect(r.pairs[0].candidate_excerpt).toBe(content);
    expect(r.pairs[0].truncated).toEqual({ golden: false, candidate: false });
  });

  it('lists reference-only files as unmatched.reference', async () => {
    // candidateDir is empty, but golden has one file
    const r = await evaluateReverseSpec({
      goldenFiles: [{ relativePath: '01-system.ja.md', content: '# a' }],
      candidateDir: tmp,
    });
    expect(r.pairs).toEqual([]);
    expect(r.unmatched.reference).toEqual(['01-system.ja.md']);
    expect(r.unmatched.candidate).toEqual([]);
  });

  it('lists candidate-only files as unmatched.candidate', async () => {
    writeFileSync(join(tmp, 'extra.ja.md'), '# extra');
    const r = await evaluateReverseSpec({
      goldenFiles: [],
      candidateDir: tmp,
    });
    expect(r.pairs).toEqual([]);
    expect(r.unmatched.candidate).toEqual(['extra.ja.md']);
    expect(r.unmatched.reference).toEqual([]);
  });

  it('truncates excerpts longer than maxExcerptChars', async () => {
    const long = 'x'.repeat(500);
    writeFileSync(join(tmp, '01.ja.md'), long);
    const r = await evaluateReverseSpec({
      goldenFiles: [{ relativePath: '01.ja.md', content: long }],
      candidateDir: tmp,
      maxExcerptChars: 100,
    });
    expect(r.pairs[0].truncated).toEqual({ golden: true, candidate: true });
    expect(r.pairs[0].golden_excerpt).toContain('[truncated]');
    expect(r.pairs[0].candidate_excerpt).toContain('[truncated]');
  });

  it('handles subdirectories (03.feature-detail/) recursively', async () => {
    mkdirSync(join(tmp, '03.feature-detail'));
    writeFileSync(join(tmp, '01-system.ja.md'), '# top');
    writeFileSync(join(tmp, '03.feature-detail/feature-a.ja.md'), '# nested');

    const r = await evaluateReverseSpec({
      goldenFiles: [
        { relativePath: '01-system.ja.md', content: '# top' },
        { relativePath: '03.feature-detail/feature-a.ja.md', content: '# nested' },
      ],
      candidateDir: tmp,
    });

    expect(r.pairs.map((p) => p.file).sort()).toEqual([
      '01-system.ja.md',
      '03.feature-detail/feature-a.ja.md',
    ]);
    expect(r.unmatched.reference).toEqual([]);
    expect(r.unmatched.candidate).toEqual([]);
    expect(r.meta.golden_count).toBe(2);
    expect(r.meta.candidate_count).toBe(2);
  });

  it('excludes files matching excludeGlobs from candidate', async () => {
    mkdirSync(join(tmp, '_eval'));
    writeFileSync(join(tmp, '01.ja.md'), '# top');
    writeFileSync(join(tmp, '_eval/20260517-eval.ja.md'), '# eval report');

    const r = await evaluateReverseSpec({
      goldenFiles: [{ relativePath: '01.ja.md', content: '# top' }],
      candidateDir: tmp,
      // default excludeGlobs = ['_eval/**']
    });
    expect(r.pairs.map((p) => p.file)).toEqual(['01.ja.md']);
    expect(r.unmatched.candidate).toEqual([]); // _eval/ was excluded
  });

  it('uses custom documentGlob and excludeGlobs', async () => {
    writeFileSync(join(tmp, 'README.md'), '# top');
    writeFileSync(join(tmp, 'skip.md'), '# skip');

    const r = await evaluateReverseSpec({
      goldenFiles: [{ relativePath: 'README.md', content: '# top' }],
      candidateDir: tmp,
      documentGlob: '*.md',
      excludeGlobs: ['skip.md'],
    });
    expect(r.pairs.map((p) => p.file)).toEqual(['README.md']);
    expect(r.meta.document_glob).toBe('*.md');
    expect(r.meta.exclude_globs).toEqual(['skip.md']);
  });
});
