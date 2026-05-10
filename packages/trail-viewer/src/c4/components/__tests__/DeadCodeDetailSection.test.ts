import { aggregateDeadCodeForElement } from '../deadCodeJudgment';
import type { FileAnalysisApiEntry } from '../../hooks/fetchFileAnalysisApi';

const entry = (
  filePath: string,
  deadCodeScore: number,
  opts: Partial<FileAnalysisApiEntry> = {},
): FileAnalysisApiEntry => ({
  filePath,
  importanceScore: 0,
  fanInTotal: 0,
  cognitiveComplexityMax: 0,
  lineCount: 0,
  functionCount: 0,
  deadCodeScore,
  signals: {
    orphan: deadCodeScore >= 45,
    fanInZero: false,
    noRecentChurn: false,
    zeroCoverage: false,
    isolatedCommunity: false,
  },
  isIgnored: false,
  ignoreReason: '',
  centralityScore: 0,
  crossPkgInCount: 0,
  externalConsumerPkgs: 0,
  isBarrel: false,
  ...opts,
});

describe('aggregateDeadCodeForElement', () => {
  it('empty entries → judgment healthy, score 0, no relatedFiles', () => {
    const r = aggregateDeadCodeForElement([]);
    expect(r.score).toBe(0);
    expect(r.judgment).toBe('healthy');
    expect(r.relatedFiles.length).toBe(0);
    expect(r.signals.orphan).toBe(false);
  });

  it('max score across entries determines overall score', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 70), entry('b.ts', 30)]);
    expect(r.score).toBe(70);
    expect(r.judgment).toBe('strong');
  });

  it('judgment 40-69 = review', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 50)]);
    expect(r.judgment).toBe('review');
  });

  it('judgment score exactly 40 = review', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 40)]);
    expect(r.judgment).toBe('review');
  });

  it('judgment score exactly 70 = strong', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 70)]);
    expect(r.judgment).toBe('strong');
  });

  it('judgment <40 = healthy', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 30)]);
    expect(r.judgment).toBe('healthy');
  });

  it('judgment score 39 = healthy', () => {
    const r = aggregateDeadCodeForElement([entry('a.ts', 39)]);
    expect(r.judgment).toBe('healthy');
  });

  it('all ignored → judgment ignored regardless of score', () => {
    const r = aggregateDeadCodeForElement([
      entry('a.ts', 0, { isIgnored: true }),
      entry('b.ts', 0, { isIgnored: true }),
    ]);
    expect(r.judgment).toBe('ignored');
  });

  it('partial ignored (not all) → uses score-based judgment', () => {
    const r = aggregateDeadCodeForElement([
      entry('a.ts', 80, { isIgnored: false }),
      entry('b.ts', 0, { isIgnored: true }),
    ]);
    expect(r.judgment).toBe('strong');
  });

  it('signals are OR-aggregated across entries', () => {
    const e1 = entry('a.ts', 45, {
      signals: {
        orphan: true,
        fanInZero: false,
        noRecentChurn: false,
        zeroCoverage: false,
        isolatedCommunity: false,
      },
    });
    const e2 = entry('b.ts', 25, {
      signals: {
        orphan: false,
        fanInZero: true,
        noRecentChurn: false,
        zeroCoverage: false,
        isolatedCommunity: false,
      },
    });
    const r = aggregateDeadCodeForElement([e1, e2]);
    expect(r.signals.orphan).toBe(true);
    expect(r.signals.fanInZero).toBe(true);
    expect(r.signals.noRecentChurn).toBe(false);
    expect(r.signals.zeroCoverage).toBe(false);
    expect(r.signals.isolatedCommunity).toBe(false);
  });

  it('relatedFiles only includes entries with score >= 40', () => {
    const entries = [
      entry('low.ts', 30),
      entry('high.ts', 80),
      entry('mid.ts', 50),
    ];
    const r = aggregateDeadCodeForElement(entries);
    const paths = r.relatedFiles.map((f) => f.filePath);
    expect(paths).not.toContain('low.ts');
    expect(paths).toContain('high.ts');
    expect(paths).toContain('mid.ts');
  });

  it('relatedFiles sorted by score desc', () => {
    const entries = [
      entry('b.ts', 50),
      entry('a.ts', 80),
      entry('c.ts', 60),
    ];
    const r = aggregateDeadCodeForElement(entries);
    expect(r.relatedFiles.map((f) => f.filePath)).toEqual(['a.ts', 'c.ts', 'b.ts']);
  });

  it('relatedFiles capped at 10', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry(`file${i}.ts`, 50 + i),
    );
    const r = aggregateDeadCodeForElement(entries);
    expect(r.relatedFiles.length).toBe(10);
    // highest scores first
    expect(r.relatedFiles[0].score).toBe(64);
  });

  it('relatedFiles score exactly 40 is included', () => {
    const r = aggregateDeadCodeForElement([entry('border.ts', 40)]);
    expect(r.relatedFiles.map((f) => f.filePath)).toContain('border.ts');
  });

  it('relatedFiles score 39 is excluded', () => {
    const r = aggregateDeadCodeForElement([entry('below.ts', 39)]);
    expect(r.relatedFiles.length).toBe(0);
  });
});
