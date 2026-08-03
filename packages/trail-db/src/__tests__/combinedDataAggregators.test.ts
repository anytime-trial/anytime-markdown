import {
  aggregateCommitPrefixBaseline,
  aggregateCommitPrefixStats,
  aggregateErrorsByPeriod,
  aggregateQualityRates,
  aggregateToolCounts,
  attachCommitFiles,
  buildCombinedDataSqlFragments,
  countRegressionFixesByPeriod,
  resolveWorkspaceScope,
} from '../combinedDataAggregators';

// ---------------------------------------------------------------------------
// aggregateQualityRates
// ---------------------------------------------------------------------------

describe('aggregateQualityRates', () => {
  it('returns empty array when all inputs are empty', () => {
    expect(aggregateQualityRates([], [], [])).toEqual([]);
  });

  it('calculates retry rate, build fail rate, and test fail rate correctly', () => {
    const buildTestRows = [
      { period: '2026-05-01', build_runs: 10, build_fails: 2, test_runs: 5, test_fails: 1 },
    ];
    const editRows = [{ period: '2026-05-01', total_edits: 40 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 8 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe('2026-05-01');
    expect(result[0]!.retryRate).toBeCloseTo(20);      // 8/40 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(20);  // 2/10 * 100
    expect(result[0]!.testFailRate).toBeCloseTo(20);   // 1/5  * 100
  });

  it('returns null retryRate when edits = 0', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 4, build_fails: 1, test_runs: 0, test_fails: 0 }];
    const editRows: Record<string, unknown>[] = [];
    const retryRows: Record<string, unknown>[] = [];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.retryRate).toBeNull();
  });

  it('returns null buildFailRate when build_runs = 0', () => {
    const buildTestRows: Record<string, unknown>[] = [];
    const editRows = [{ period: '2026-05-01', total_edits: 10 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 2 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.buildFailRate).toBeNull();
    expect(result[0]!.testFailRate).toBeNull();
  });

  it('returns null testFailRate when test_runs = 0', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 5, build_fails: 0, test_runs: 0, test_fails: 0 }];
    const editRows: Record<string, unknown>[] = [];
    const retryRows: Record<string, unknown>[] = [];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.testFailRate).toBeNull();
  });

  it('handles multiple periods and sorts by period ascending', () => {
    const buildTestRows = [
      { period: '2026-05-03', build_runs: 6, build_fails: 3, test_runs: 2, test_fails: 2 },
      { period: '2026-05-01', build_runs: 10, build_fails: 0, test_runs: 0, test_fails: 0 },
    ];
    const editRows = [
      { period: '2026-05-03', total_edits: 20 },
      { period: '2026-05-01', total_edits: 50 },
    ];
    const retryRows = [
      { period: '2026-05-03', total_retries: 4 },
      { period: '2026-05-01', total_retries: 10 },
    ];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(2);
    expect(result[0]!.period).toBe('2026-05-01');
    expect(result[1]!.period).toBe('2026-05-03');
    expect(result[0]!.buildFailRate).toBeCloseTo(0);   // 0/10 * 100
    expect(result[1]!.buildFailRate).toBeCloseTo(50);  // 3/6  * 100
    expect(result[1]!.testFailRate).toBeCloseTo(100);  // 2/2  * 100
    expect(result[1]!.retryRate).toBeCloseTo(20);      // 4/20 * 100
  });

  it('merges data from the three sources into a single entry per period', () => {
    // buildTestRows にない period が editRows にある場合も統合されること
    const buildTestRows = [{ period: '2026-05-01', build_runs: 4, build_fails: 2, test_runs: 0, test_fails: 0 }];
    const editRows = [{ period: '2026-05-01', total_edits: 20 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 5 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result).toHaveLength(1);
    expect(result[0]!.retryRate).toBeCloseTo(25);     // 5/20 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(50); // 2/4  * 100
    expect(result[0]!.testFailRate).toBeNull();
  });

  it('handles week period keys', () => {
    const buildTestRows = [{ period: '2026-W19', build_runs: 8, build_fails: 4, test_runs: 4, test_fails: 1 }];
    const editRows = [{ period: '2026-W19', total_edits: 100 }];
    const retryRows = [{ period: '2026-W19', total_retries: 15 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.period).toBe('2026-W19');
    expect(result[0]!.retryRate).toBeCloseTo(15);     // 15/100 * 100
    expect(result[0]!.buildFailRate).toBeCloseTo(50); // 4/8    * 100
    expect(result[0]!.testFailRate).toBeCloseTo(25);  // 1/4    * 100
  });

  it('returns 0% rates when all runs are successful', () => {
    const buildTestRows = [{ period: '2026-05-01', build_runs: 10, build_fails: 0, test_runs: 5, test_fails: 0 }];
    const editRows = [{ period: '2026-05-01', total_edits: 30 }];
    const retryRows = [{ period: '2026-05-01', total_retries: 0 }];

    const result = aggregateQualityRates(buildTestRows, editRows, retryRows);

    expect(result[0]!.retryRate).toBeCloseTo(0);
    expect(result[0]!.buildFailRate).toBeCloseTo(0);
    expect(result[0]!.testFailRate).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateCommitPrefixStats
// ---------------------------------------------------------------------------

describe('aggregateCommitPrefixStats', () => {
  it('returns empty array when commitRows is empty', () => {
    expect(aggregateCommitPrefixStats([], '2026-05-09')).toEqual([]);
  });

  it('aggregates a single commit correctly', () => {
    const rows = [{ period: '2026-05-09', subject: 'feat: add login', linesAdded: 100, linesDeleted: 10 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe('2026-05-09');
    expect(result[0]!.prefix).toBe('feat');
    expect(result[0]!.count).toBe(1);
    expect(result[0]!.linesAdded).toBe(100);
    expect(result[0]!.linesDeleted).toBe(10);
  });

  it('sums linesAdded and linesDeleted for same period+prefix', () => {
    const rows = [
      { period: '2026-05-09', subject: 'fix: bug A', linesAdded: 30, linesDeleted: 5 },
      { period: '2026-05-09', subject: 'fix: bug B', linesAdded: 20, linesDeleted: 8 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.prefix).toBe('fix');
    expect(result[0]!.count).toBe(2);
    expect(result[0]!.linesAdded).toBe(50);
    expect(result[0]!.linesDeleted).toBe(13);
  });

  it('produces separate entries for different prefixes in the same period', () => {
    const rows = [
      { period: '2026-05-09', subject: 'feat: X', linesAdded: 100, linesDeleted: 0 },
      { period: '2026-05-09', subject: 'fix: Y', linesAdded: 10, linesDeleted: 5 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');
    const prefixes = result.map(r => r.prefix).sort();

    expect(result).toHaveLength(2);
    expect(prefixes).toEqual(['feat', 'fix']);
  });

  it('filters out commits with period > todayPeriod', () => {
    const rows = [
      { period: '2026-05-09', subject: 'feat: present', linesAdded: 50, linesDeleted: 0 },
      { period: '2026-05-10', subject: 'feat: future', linesAdded: 200, linesDeleted: 0 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.linesAdded).toBe(50);
  });

  it('includes commits with period === todayPeriod', () => {
    const rows = [{ period: '2026-05-09', subject: 'refactor: clean', linesAdded: 60, linesDeleted: 40 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result).toHaveLength(1);
    expect(result[0]!.prefix).toBe('refactor');
  });

  it('assigns "other" prefix for non-conventional commits', () => {
    const rows = [{ period: '2026-05-09', subject: 'Merge branch main', linesAdded: 5, linesDeleted: 0 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('other');
  });

  it('handles multiple periods correctly', () => {
    const rows = [
      { period: '2026-05-08', subject: 'feat: day1', linesAdded: 100, linesDeleted: 20 },
      { period: '2026-05-09', subject: 'fix: day2', linesAdded: 30, linesDeleted: 5 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');
    const sorted = [...result].sort((a, b) => a.period.localeCompare(b.period));

    expect(result).toHaveLength(2);
    expect(sorted[0]!.period).toBe('2026-05-08');
    expect(sorted[0]!.prefix).toBe('feat');
    expect(sorted[1]!.period).toBe('2026-05-09');
    expect(sorted[1]!.prefix).toBe('fix');
  });

  it('handles week period keys', () => {
    const rows = [
      { period: '2026-W18', subject: 'feat: A', linesAdded: 50, linesDeleted: 10 },
      { period: '2026-W19', subject: 'feat: B', linesAdded: 80, linesDeleted: 20 },
      { period: '2026-W20', subject: 'feat: C', linesAdded: 200, linesDeleted: 0 },
    ];
    const result = aggregateCommitPrefixStats(rows, '2026-W19');
    const periods = result.map(r => r.period).sort();

    expect(periods).toEqual(['2026-W18', '2026-W19']);
  });

  it('handles scoped conventional commits', () => {
    const rows = [{ period: '2026-05-09', subject: 'fix(auth): handle token expiry', linesAdded: 15, linesDeleted: 3 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('fix');
  });

  it('handles breaking change marker in prefix', () => {
    const rows = [{ period: '2026-05-09', subject: 'refactor!: remove deprecated API', linesAdded: 0, linesDeleted: 200 }];
    const result = aggregateCommitPrefixStats(rows, '2026-05-09');

    expect(result[0]!.prefix).toBe('refactor');
  });
});

// ---------------------------------------------------------------------------
// aggregateCommitPrefixBaseline
// ---------------------------------------------------------------------------

describe('aggregateCommitPrefixBaseline', () => {
  it('returns empty summary for empty input', () => {
    const result = aggregateCommitPrefixBaseline([]);
    expect(result.perPrefix).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.regressionCount).toBe(0);
  });

  it('groups by prefix and accumulates count / LOC', () => {
    const result = aggregateCommitPrefixBaseline([
      { subject: 'feat: a', linesAdded: 10, linesDeleted: 1 },
      { subject: 'feat(api): b', linesAdded: 20, linesDeleted: 2 },
      { subject: 'fix: c', linesAdded: 5, linesDeleted: 3 },
    ]);
    const byPrefix = new Map(result.perPrefix.map((e) => [e.prefix, e]));
    expect(byPrefix.get('feat')).toEqual({ prefix: 'feat', count: 2, linesAdded: 30, linesDeleted: 3 });
    expect(byPrefix.get('fix')).toEqual({ prefix: 'fix', count: 1, linesAdded: 5, linesDeleted: 3 });
    expect(result.totalCount).toBe(3);
    expect(result.regressionCount).toBe(0);
  });

  it('counts fix(*regression*) subjects as regression', () => {
    const result = aggregateCommitPrefixBaseline([
      { subject: 'fix(memory-core/regression): wrap purge', linesAdded: 4, linesDeleted: 1 },
      { subject: 'fix(regression): undo bad logic', linesAdded: 2, linesDeleted: 8 },
      { subject: 'fix: unrelated', linesAdded: 1, linesDeleted: 0 },
      { subject: 'feat: x', linesAdded: 10, linesDeleted: 0 },
    ]);
    expect(result.regressionCount).toBe(2);
    expect(result.totalCount).toBe(4);
  });

  it('does not count feat()/refactor() with regression scope as regression', () => {
    const result = aggregateCommitPrefixBaseline([
      { subject: 'feat(regression-tests): add suite', linesAdded: 100, linesDeleted: 0 },
      { subject: 'refactor(regression): tidy', linesAdded: 10, linesDeleted: 5 },
    ]);
    expect(result.regressionCount).toBe(0);
    expect(result.totalCount).toBe(2);
  });

  it('classifies non-conventional subjects as other prefix', () => {
    const result = aggregateCommitPrefixBaseline([
      { subject: 'Merge pull request #1', linesAdded: 0, linesDeleted: 0 },
    ]);
    expect(result.perPrefix).toHaveLength(1);
    expect(result.perPrefix[0]!.prefix).toBe('other');
    expect(result.totalCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getCombinedData から切り出した集計（変異注入で既存の統合テストが検知しなかった経路を含む）
// ---------------------------------------------------------------------------

const toText = (v: unknown): string => (v == null ? '' : String(v));

describe('resolveWorkspaceScope', () => {
  const normalizeName = (n: string): string => n.replace(/\/\.worktrees\/.*$/, '');

  it('選択肢は「対象期間に活動があった repo」だけに絞る', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [
        [1, 'active-repo'],
        [2, 'idle-repo'],
      ],
      activeRepoIds: new Set([1]),
      workspace: undefined,
      normalizeName,
      toText,
    });
    expect(scope.workspaces).toEqual(['active-repo']);
  });

  it('正規化後に空になる repo_name は捨てる', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [[1, '']],
      activeRepoIds: new Set([1]),
      workspace: undefined,
      normalizeName,
      toText,
    });
    expect(scope.workspaces).toEqual([]);
  });

  it('フィルタ対象は活動の有無に依らず解決する（worktree 由来も親名で拾う）', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [
        [1, 'repo-a'],
        [2, 'repo-a/.worktrees/feature'],
        [3, 'repo-b'],
      ],
      activeRepoIds: new Set([1]),
      workspace: 'repo-a',
      normalizeName,
      toText,
    });
    expect(scope.hasWorkspaceFilter).toBe(true);
    expect(scope.repoIdList).toBe('1,2');
  });

  it('選択中のワークスペースは期間外でも選択肢に残す', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [
        [1, 'selected'],
        [2, 'other'],
      ],
      activeRepoIds: new Set([2]),
      workspace: 'selected',
      normalizeName,
      toText,
    });
    expect(scope.workspaces).toEqual(['other', 'selected']);
  });

  it('該当 repo が無ければ IN 句は常偽の -1', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [[1, 'repo-a']],
      activeRepoIds: new Set([1]),
      workspace: 'no-such-workspace',
      normalizeName,
      toText,
    });
    expect(scope.repoIdList).toBe('-1');
  });

  it('空文字のワークスペース指定はフィルタ無効', () => {
    const scope = resolveWorkspaceScope({
      repoRows: [[1, 'repo-a']],
      activeRepoIds: new Set([1]),
      workspace: '',
      normalizeName,
      toText,
    });
    expect(scope.hasWorkspaceFilter).toBe(false);
  });
});

describe('buildCombinedDataSqlFragments', () => {
  it('フィルタ無効時は SQL 断片が空文字（WHERE 句を変えない）', () => {
    const f = buildCombinedDataSqlFragments(
      { hasWorkspaceFilter: false, repoIdList: '-1' },
      'day',
      '+09:00',
    );
    expect(f.sessionRepoFilter).toBe('');
    expect(f.commitBareRepoFilter).toBe('');
  });

  it('sessions を JOIN していないクエリ用の断片は session_id 経由で同じ条件を表す', () => {
    const f = buildCombinedDataSqlFragments(
      { hasWorkspaceFilter: true, repoIdList: '1,2' },
      'day',
      '+09:00',
    );
    expect(f.sessionRepoFilter).toBe(' AND s.repo_id IN (1,2)');
    expect(f.commitBareRepoFilter).toBe(
      ' AND session_id IN (SELECT id FROM sessions WHERE repo_id IN (1,2))',
    );
  });

  it('week 指定では期間式が週キーになる', () => {
    const day = buildCombinedDataSqlFragments(
      { hasWorkspaceFilter: false, repoIdList: '-1' },
      'day',
      '+09:00',
    );
    const week = buildCombinedDataSqlFragments(
      { hasWorkspaceFilter: false, repoIdList: '-1' },
      'week',
      '+09:00',
    );
    expect(day.sessionStartPeriodExpr).toContain('DATE(s.start_time');
    expect(week.sessionStartPeriodExpr).toContain("strftime('%Y-W%W'");
    expect(week.commitPeriodExpr).toContain('committed_at');
  });
});

describe('attachCommitFiles', () => {
  const commit = (repoName: string, hash: string): { repoName: string; hash: string; files: string[] } => ({
    repoName,
    hash,
    files: [],
  });

  it('同じハッシュでもリポジトリが違えば別のコミットとして割り当てる', () => {
    const rows = [commit('repo-a', 'abc'), commit('repo-b', 'abc')];
    attachCommitFiles(
      rows,
      [
        ['repo-a', 'abc', 'a.ts'],
        ['repo-b', 'abc', 'b.ts'],
      ],
      toText,
    );
    expect(rows[0].files).toEqual(['a.ts']);
    expect(rows[1].files).toEqual(['b.ts']);
  });

  it('同じコミットの複数ファイルを順に積む', () => {
    const rows = [commit('repo-a', 'abc')];
    attachCommitFiles(
      rows,
      [
        ['repo-a', 'abc', 'a.ts'],
        ['repo-a', 'abc', 'b.ts'],
      ],
      toText,
    );
    expect(rows[0].files).toEqual(['a.ts', 'b.ts']);
  });

  it('対応する行が無いコミットは空配列のまま', () => {
    const rows = [commit('repo-a', 'abc')];
    attachCommitFiles(rows, [['repo-a', 'zzz', 'z.ts']], toText);
    expect(rows[0].files).toEqual([]);
  });

  it('ファイル行が空でも落ちない', () => {
    const rows = [commit('repo-a', 'abc')];
    attachCommitFiles(rows, [], toText);
    expect(rows[0].files).toEqual([]);
  });
});

describe('aggregateToolCounts', () => {
  it('同じ (period, tool) を合算する', () => {
    const result = aggregateToolCounts(
      [
        { period: '2026-05-01', tool: 'Bash', count: 2, duration_ms: 10, tokens: 100 },
        { period: '2026-05-01', tool: 'Bash', count: 3, duration_ms: 5, tokens: 50 },
      ],
      toText,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ period: '2026-05-01', tool: 'Bash', count: 5, durationMs: 15 });
  });

  it('観測できなかったターンの分だけトークンを外挿する', () => {
    const result = aggregateToolCounts(
      [
        {
          period: '2026-05-01',
          tool: 'Read',
          tokens: 100,
          token_total_turns: 10,
          token_missing_turns: 5,
        },
      ],
      toText,
    );
    // 観測 5 ターンで 100 トークン → 全 10 ターン相当は 200
    expect(result[0].tokens).toBe(200);
    expect(result[0].tokenMissingRate).toBe(0.5);
  });

  it('観測ターンが 0 なら外挿しない（等倍）', () => {
    const result = aggregateToolCounts(
      [
        {
          period: '2026-05-01',
          tool: 'Read',
          tokens: 100,
          token_total_turns: 4,
          token_missing_turns: 4,
        },
      ],
      toText,
    );
    expect(result[0].tokens).toBe(100);
    expect(result[0].tokenMissingRate).toBe(1);
  });

  it('ツール名に区切り文字が含まれても period と tool を復元できる', () => {
    const result = aggregateToolCounts(
      [{ period: '2026-W18', tool: 'mcp__trail__query|graph', count: 1 }],
      toText,
    );
    expect(result[0].period).toBe('2026-W18');
    expect(result[0].tool).toBe('mcp__trail__query|graph');
  });
});

describe('countRegressionFixesByPeriod', () => {
  it('fix(...regression...) の件名だけを期間ごとに数える', () => {
    const result = countRegressionFixesByPeriod(
      [
        { period: '2026-05-01', subject: 'fix(app/regression): 直す' },
        { period: '2026-05-01', subject: 'fix(app/logic): 別の修正' },
        { period: '2026-05-02', subject: 'fix(regression): また直す' },
      ],
      '2026-05-31',
    );
    expect(result).toEqual([
      { period: '2026-05-01', count: 1 },
      { period: '2026-05-02', count: 1 },
    ]);
  });

  it('集計末尾より後ろの期間は落とす（分母が未確定のため）', () => {
    const result = countRegressionFixesByPeriod(
      [
        { period: '2026-05-01', subject: 'fix(app/regression): 直す' },
        { period: '2026-06-01', subject: 'fix(app/regression): 未来' },
      ],
      '2026-05-31',
    );
    expect(result).toEqual([{ period: '2026-05-01', count: 1 }]);
  });

  it('期間順に並べて返す', () => {
    const result = countRegressionFixesByPeriod(
      [
        { period: '2026-05-03', subject: 'fix(regression): c' },
        { period: '2026-05-01', subject: 'fix(regression): a' },
      ],
      '2026-05-31',
    );
    expect(result.map((r) => r.period)).toEqual(['2026-05-01', '2026-05-03']);
  });
});

describe('aggregateErrorsByPeriod', () => {
  it('期間ごとにツール別のエラー件数を積む', () => {
    const result = aggregateErrorsByPeriod(
      [
        { period: '2026-05-01', tool: 'Bash', err_count: 2 },
        { period: '2026-05-01', tool: 'Edit', err_count: 1 },
        { period: '2026-05-01', tool: 'Bash', err_count: 3 },
      ],
      toText,
    );
    expect(result).toEqual([
      { period: '2026-05-01', rate: 0, byTool: { Bash: 5, Edit: 1 } },
    ]);
  });

  it('件数 0 の行は期間ごと作らない', () => {
    expect(aggregateErrorsByPeriod([{ period: '2026-05-01', tool: 'Bash', err_count: 0 }], toText))
      .toEqual([]);
  });
});
