import { computeAiFirstTrySuccessRate, isAiFirstTryFailureCommit } from '../../domain/metrics/aiFirstTrySuccessRate';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = { from: '2026-04-01T00:00:00.000Z', to: '2026-04-30T23:59:59.999Z' };
const prevRange: DateRange = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-31T23:59:59.999Z' };

function aiCommit(hash: string, at: string, subject: string, files: string[] = []) {
  return { hash, subject, committed_at: at, is_ai_assisted: true, files };
}

function humanCommit(hash: string, at: string, subject: string, files: string[] = []) {
  return { hash, subject, committed_at: at, is_ai_assisted: false, files };
}

describe('computeAiFirstTrySuccessRate', () => {
  it('no AI commits → value=0, sampleSize=0, no level', () => {
    const result = computeAiFirstTrySuccessRate({ commits: [] }, range, prevRange, 'day');
    expect(result.value).toBe(0);
    expect(result.sampleSize).toBe(0);
    expect(result.level).toBeUndefined();
    expect(result.unit).toBe('percent');
  });

  it('all AI commits without any follow-up fix → 100%', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: add A', ['src/a.ts']),
      aiCommit('a2', '2026-04-02T09:00:00.000Z', 'feat: add B', ['src/b.ts']),
    ];
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.value).toBe(100);
    expect(result.sampleSize).toBe(2);
    expect(result.level).toBe('elite');
  });

  it('fix counts in denominator: feat + fix on same file = 1 fail + 1 success = 50%', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: add A', ['src/a.ts']),
      aiCommit('f1', '2026-04-05T09:00:00.000Z', 'fix: A was broken', ['src/a.ts']),
    ];
    // a1: fix in window same file → fail
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(50);
  });

  it('fix followed by another fix on same file: first fix fails, second succeeds', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: A', ['src/a.ts']),
      aiCommit('f2', '2026-04-03T09:00:00.000Z', 'fix: A again', ['src/a.ts']),
    ];
    // a1: f1 within 168h same file → fail
    // f1: f2 within 168h same file → fail
    // f2: no further fix → success
    // 1 / 3 ≈ 33.33%
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(3);
    expect(result.value).toBeCloseTo(33.33, 1);
  });

  it('fix touching different file: both succeed independently', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: refactor graph', ['packages/graph-core/src/engine.ts']),
      aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: UI header margin', ['packages/web-app/src/Header.tsx']),
    ];
    // a1: f1 at different file → no overlap → success
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(100);
  });

  it('fix with multi-file overlap fails the feat; fix itself succeeds', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts', 'src/b.ts']),
      aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: unrelated', ['src/c.ts', 'src/b.ts']),
    ];
    // a1: f1 overlaps b.ts → fail
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(50);
  });

  it('fix outside 168h window: both succeed', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('f1', '2026-04-15T09:00:00.000Z', 'fix: unrelated later', ['src/a.ts']),
    ];
    // a1: f1 outside 168h → success
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(100);
  });

  describe('F3: non-code file exclusion', () => {
    it('docs-only AI commit (.md) is excluded from denominator', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'docs: update readme', ['README.md']),
      ];
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(0);
      expect(result.value).toBe(0);
    });

    it('image-only AI commit is excluded from denominator', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'chore: replace logo', ['assets/logo.png', 'assets/icon.svg']),
      ];
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(0);
    });

    it('lockfile-only AI commit is excluded from denominator', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'chore: lockfile', ['package-lock.json']),
        aiCommit('a2', '2026-04-02T09:00:00.000Z', 'chore: yarn', ['yarn.lock']),
      ];
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(0);
    });

    it('mixed commit (code + docs) is included and counted via the code file', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts', 'README.md']),
      ];
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(1);
      expect(result.value).toBe(100);
    });

    it('doc-only fix on same .md does NOT mark earlier AI code commit as failed', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts', 'README.md']),
        aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix(docs): typo', ['README.md']),
      ];
      // a1: f1 has no code overlap → success
      // f1: only non-code (README.md) → excluded from denominator
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(1);
      expect(result.value).toBe(100);
    });

    it('code fix that overlaps .ts fails the feat; the fix itself succeeds', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts', 'README.md']),
        aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: a', ['src/a.ts', 'README.md']),
      ];
      // a1: f1 overlaps src/a.ts → fail
      // f1: no further fix → success
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(2);
      expect(result.value).toBe(50);
    });

    it('lockfile-only fix is excluded (no code file) → feat succeeds and nothing to evaluate for fix', () => {
      const commits = [
        aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
        aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix(deps): bump', ['package-lock.json']),
      ];
      // a1: f1 has no code overlap → success
      // f1: only non-code (package-lock.json) → excluded from denominator
      const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
      expect(result.sampleSize).toBe(1);
      expect(result.value).toBe(100);
    });
  });

  it('AI commit with empty files → optimistic success (unknown overlap)', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', []),
      aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: something', ['src/a.ts']),
    ];
    // a1: files empty → cannot confirm overlap → success
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(100);
  });

  it('fix with empty files → treated as no overlap (optimistic)', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('f1', '2026-04-02T09:00:00.000Z', 'fix: something', []),
    ];
    // a1: f1 files empty → cannot confirm overlap → success
    // f1: files empty → included optimistically, no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(100);
  });

  it('revert and hotfix failures behave like fix: fail feats, themselves pass if no further fix', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('r1', '2026-04-02T09:00:00.000Z', 'revert: A', ['src/a.ts']),
      aiCommit('a2', '2026-04-10T09:00:00.000Z', 'feat: B', ['src/b.ts']),
      aiCommit('h1', '2026-04-12T09:00:00.000Z', 'hotfix(scope): urgent', ['src/b.ts']),
    ];
    // a1 fails (r1), r1 succeeds (no further fix)
    // a2 fails (h1), h1 succeeds (no further fix)
    // 2 / 4 = 50%
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(4);
    expect(result.value).toBe(50);
  });

  it('human commits are excluded from denominator but still used for fix detection', () => {
    const commits = [
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      humanCommit('h1', '2026-04-02T09:00:00.000Z', 'fix: human patch', ['src/a.ts']),
    ];
    // a1: h1 fix in window, same file → fail
    // h1: not AI → excluded
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(1);
    expect(result.value).toBe(0);
  });

  it('commits outside range are excluded from denominator but still contribute to fix detection', () => {
    const commits = [
      aiCommit('a0', '2026-03-31T09:00:00.000Z', 'feat: before', ['src/a.ts']),
      aiCommit('a1', '2026-04-01T09:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('f1', '2026-04-04T09:00:00.000Z', 'fix: something', ['src/a.ts']),
    ];
    // a0: outside range → excluded from denominator
    // a1: f1 in window same file → fail
    // f1: no further fix → success
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(50);
  });

  it('fix commits are included in denominator and succeed on their own when no further fix', () => {
    const commits = [
      aiCommit('f1', '2026-04-01T09:00:00.000Z', 'fix: something', ['src/a.ts']),
      aiCommit('f2', '2026-04-02T09:00:00.000Z', 'revert: change', ['src/b.ts']),
    ];
    // Both are in the denominator (they are AI-generated code).
    // Neither has a further fix on overlapping code files → both succeed.
    const result = computeAiFirstTrySuccessRate({ commits }, range, prevRange, 'day');
    expect(result.sampleSize).toBe(2);
    expect(result.value).toBe(100);
  });

  it('deltaPct calculated from previous period', () => {
    const commits = [aiCommit('a1', '2026-04-10T00:00:00.000Z', 'feat: A', ['src/a.ts'])];
    // current: 1 / 1 = 100%
    const prevCommits = [
      aiCommit('pa1', '2026-03-01T00:00:00.000Z', 'feat: A', ['src/a.ts']),
      aiCommit('pa2', '2026-03-10T00:00:00.000Z', 'feat: B', ['src/b.ts']),
      aiCommit('pf1', '2026-03-12T00:00:00.000Z', 'fix: B', ['src/b.ts']),
    ];
    // pa1: no fix in window → success
    // pa2: pf1 within 168h overlap → fail
    // pf1: no further fix → success
    // prev: 2 / 3 ≈ 66.67%
    const result = computeAiFirstTrySuccessRate(
      { commits },
      range,
      prevRange,
      'day',
      { commits: prevCommits },
    );
    expect(result.comparison!.previousValue).toBeCloseTo(66.67, 1);
    expect(result.comparison!.deltaPct).toBeCloseTo(50, 1); // (100 - 66.67) / 66.67 * 100
  });

  it('deltaPct=null when previous has 0 AI commits', () => {
    const commits = [aiCommit('a1', '2026-04-10T00:00:00.000Z', 'feat: A', ['src/a.ts'])];
    const result = computeAiFirstTrySuccessRate(
      { commits },
      range,
      prevRange,
      'day',
      { commits: [] },
    );
    expect(result.comparison!.deltaPct).toBeNull();
  });

  it('DORA level classification', () => {
    // Thresholds: elite ≥ 80%, high ≥ 60%, medium ≥ 40%, low < 40%.
    //
    // Scenario generator:
    //   `pureSuccess` commits: feat commits with no follow-up fix → success
    //   `chain` groups: each group has feat + fix-that-fails-feat + fix-that-fails-the-fix
    //                   contributing 2 failures + 1 success (3 commits, 33% success)
    //
    // Total rate = (pureSuccess + chain) / (pureSuccess + 3 × chain)
    function makeScenario(pureSuccess: number, chain: number) {
      const commits = [];
      for (let i = 0; i < pureSuccess; i++) {
        const day = String((i % 25) + 1).padStart(2, '0');
        const minute = String((i * 3) % 60).padStart(2, '0');
        commits.push(aiCommit(`s${i}`, `2026-04-${day}T09:${minute}:00.000Z`, `feat: s${i}`, [`src/s${i}.ts`]));
      }
      for (let i = 0; i < chain; i++) {
        const day = String((i % 20) + 1).padStart(2, '0');
        commits.push(aiCommit(`c${i}a`, `2026-04-${day}T08:00:00.000Z`, `feat: c${i}`, [`src/c${i}.ts`]));
        commits.push(aiCommit(`c${i}b`, `2026-04-${day}T09:00:00.000Z`, `fix: c${i}`, [`src/c${i}.ts`, `src/cc${i}.ts`]));
        commits.push(aiCommit(`c${i}c`, `2026-04-${day}T10:00:00.000Z`, `fix: c${i}-again`, [`src/cc${i}.ts`]));
      }
      return commits;
    }

    // (10, 0): 10 / 10 = 100% → elite
    expect(computeAiFirstTrySuccessRate({ commits: makeScenario(10, 0) }, range, prevRange, 'day').level).toBe('elite');
    // (0, 5 chains): (0 + 5) / (0 + 15) = 33.3%... but we want high, adjust:
    // (4, 2): (4 + 2) / (4 + 6) = 6 / 10 = 60% → high
    expect(computeAiFirstTrySuccessRate({ commits: makeScenario(4, 2) }, range, prevRange, 'day').level).toBe('high');
    // (2, 3): (2 + 3) / (2 + 9) = 5 / 11 ≈ 45.5% → medium
    expect(computeAiFirstTrySuccessRate({ commits: makeScenario(2, 3) }, range, prevRange, 'day').level).toBe('medium');
    // (0, 5): (0 + 5) / (0 + 15) = 33.3% → low
    expect(computeAiFirstTrySuccessRate({ commits: makeScenario(0, 5) }, range, prevRange, 'day').level).toBe('low');
  });
});

describe('isAiFirstTryFailureCommit', () => {
  it('returns true for fix commit subject', () => {
    expect(isAiFirstTryFailureCommit('fix: something broken')).toBe(true);
  });

  it('returns false for feat commit subject', () => {
    expect(isAiFirstTryFailureCommit('feat: add new feature')).toBe(false);
  });
});
