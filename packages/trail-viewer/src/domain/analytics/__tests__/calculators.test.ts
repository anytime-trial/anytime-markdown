import {
  capTopN,
  countCompactDrops,
  dominantTool,
  extractPrefixWithScope,
  groupByWeek,
  laneClassifyTool,
  mergeRuns,
  mergeToolMetrics,
  niceTicks,
  parseCommitSubject,
  sessionCost,
  toFridayWeekKey,
  type ChartEntry,
} from '../calculators';
import type { TrailMessage, TrailSession, TrailToolCall, ToolMetrics } from '../../parser/types';

describe('niceTicks', () => {
  it('max <= 0 は [0]', () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
  });
  it('正の max に対して 0 から ceil(max/step)*step まで step 刻み', () => {
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(100)).toEqual([0, 50, 100]);
    expect(niceTicks(8)).toEqual([0, 2, 4, 6, 8]);
  });
});

describe('sessionCost', () => {
  it('estimatedCostUsd が無ければ 0', () => {
    expect(sessionCost({} as TrailSession)).toBe(0);
  });
  it('estimatedCostUsd を返す', () => {
    expect(sessionCost({ estimatedCostUsd: 1.23 } as TrailSession)).toBe(1.23);
  });
});

describe('countCompactDrops', () => {
  const mkMsg = (cacheRead: number): TrailMessage => ({
    usage: { cacheReadTokens: cacheRead } as TrailMessage['usage'],
  } as TrailMessage);

  it('空または 1 件は 0', () => {
    expect(countCompactDrops([])).toBe(0);
    expect(countCompactDrops([mkMsg(60_000)])).toBe(0);
  });
  it('50K 以上 → 70% 以上減少を 1 ドロップとカウント', () => {
    expect(countCompactDrops([mkMsg(60_000), mkMsg(10_000)])).toBe(1);
  });
  it('50K 未満は対象外', () => {
    expect(countCompactDrops([mkMsg(40_000), mkMsg(0)])).toBe(0);
  });
  it('減少が 70% 未満は対象外', () => {
    expect(countCompactDrops([mkMsg(60_000), mkMsg(30_000)])).toBe(0);
  });
});

describe('parseCommitSubject', () => {
  it('heredoc EOF パターン', () => {
    const cmd = "git commit -m \"$(cat <<'EOF'\nfeat: add foo\n\nbody\nEOF\n)\"";
    expect(parseCommitSubject(cmd)).toBe('feat: add foo');
  });
  it('シンプルな -m "..." パターン', () => {
    expect(parseCommitSubject('git commit -m "fix: bug"')).toBe('fix: bug');
  });
  it('マッチしない場合は空文字', () => {
    expect(parseCommitSubject('git status')).toBe('');
  });
});

describe('extractPrefixWithScope', () => {
  it('Conventional Commits prefix を抽出', () => {
    expect(extractPrefixWithScope('feat: add x')).toBe('feat');
    expect(extractPrefixWithScope('fix(api): bug')).toBe('fix(api)');
    expect(extractPrefixWithScope('feat!: breaking')).toBe('feat!');
  });
  it('prefix なしは先頭 40 文字', () => {
    expect(extractPrefixWithScope('hello world')).toBe('hello world');
    expect(extractPrefixWithScope('a'.repeat(50))).toBe('a'.repeat(40));
  });
});

describe('laneClassifyTool', () => {
  it('既知ツール名を分類', () => {
    expect(laneClassifyTool('Bash')).toBe('bash');
    expect(laneClassifyTool('Edit')).toBe('edit');
    expect(laneClassifyTool('MultiEdit')).toBe('edit');
    expect(laneClassifyTool('Write')).toBe('write');
    expect(laneClassifyTool('Read')).toBe('read');
    expect(laneClassifyTool('Glob')).toBe('read');
    expect(laneClassifyTool('Grep')).toBe('read');
    expect(laneClassifyTool('Task')).toBe('task');
  });
  it('mcp__ プレフィックスは task', () => {
    expect(laneClassifyTool('mcp__playwright__navigate')).toBe('task');
  });
  it('未知ツールは other', () => {
    expect(laneClassifyTool('Unknown')).toBe('other');
  });
});

describe('mergeRuns', () => {
  it('連続する同値を一つの run にまとめる', () => {
    expect(mergeRuns([1, 1, 2, 2, 2, 3])).toEqual([
      { value: 1, start: 0, end: 1 },
      { value: 2, start: 2, end: 4 },
      { value: 3, start: 5, end: 5 },
    ]);
  });
  it('空配列は空 runs', () => {
    expect(mergeRuns([])).toEqual([]);
  });
  it('全て同値', () => {
    expect(mergeRuns(['a', 'a', 'a'])).toEqual([{ value: 'a', start: 0, end: 2 }]);
  });
});

describe('dominantTool', () => {
  const mkTool = (name: string): TrailToolCall => ({ name } as TrailToolCall);
  it('空または undefined は ""', () => {
    expect(dominantTool(undefined)).toBe('');
    expect(dominantTool([])).toBe('');
  });
  it('優先度順 (bash > edit > write > read > task > other) で最初の該当を返す', () => {
    expect(dominantTool([mkTool('Edit'), mkTool('Bash')])).toBe('bash');
    expect(dominantTool([mkTool('Read'), mkTool('Edit')])).toBe('edit');
    expect(dominantTool([mkTool('Read')])).toBe('read');
  });
});

describe('mergeToolMetrics', () => {
  it('全て null なら null', () => {
    expect(mergeToolMetrics([null, null])).toBeNull();
  });
  it('集計 totals を加算', () => {
    const a = {
      totalRetries: 1, totalEdits: 2, totalBuildRuns: 3, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
      toolUsage: [{ tool: 'Bash', count: 5, tokens: 10, durationMs: 100 }],
      skillUsage: [], errorsByTool: [], modelUsage: [],
    } as unknown as ToolMetrics;
    const b = {
      totalRetries: 2, totalEdits: 1, totalBuildRuns: 0, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
      toolUsage: [{ tool: 'Bash', count: 3, tokens: 5, durationMs: 50 }],
      skillUsage: [], errorsByTool: [], modelUsage: [],
    } as unknown as ToolMetrics;
    const merged = mergeToolMetrics([a, b]);
    expect(merged).not.toBeNull();
    expect(merged!.totalRetries).toBe(3);
    expect(merged!.totalEdits).toBe(3);
    expect(merged!.totalBuildRuns).toBe(3);
    const bash = merged!.toolUsage?.find((u) => u.tool === 'Bash');
    expect(bash).toEqual({ tool: 'Bash', count: 8, tokens: 15, durationMs: 150 });
  });
});

describe('toFridayWeekKey', () => {
  it('金曜日はそのまま', () => {
    expect(toFridayWeekKey('2026-05-01')).toBe('2026-05-01');
  });
  it('週内の他曜日は直前の金曜日に丸める', () => {
    expect(toFridayWeekKey('2026-05-02')).toBe('2026-05-01');
    expect(toFridayWeekKey('2026-05-04')).toBe('2026-05-01');
    expect(toFridayWeekKey('2026-05-07')).toBe('2026-05-01');
  });
});

describe('groupByWeek', () => {
  const mkEntry = (fullDate: string, overlayValue: number | null = null): ChartEntry => ({
    date: fullDate.slice(5), fullDate,
    inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheCreationTokens: 1,
    actualCost: 1, skillCost: 1,
    linesAdded: 10, linesDeleted: 4,
    overlayValue,
  });

  it('同一週内のエントリを集約', () => {
    const result = groupByWeek([mkEntry('2026-05-01'), mkEntry('2026-05-04')]);
    expect(result).toHaveLength(1);
    expect(result[0].fullDate).toBe('2026-05-01');
    expect(result[0].inputTokens).toBe(2);
    expect(result[0].linesAdded).toBe(20);
    expect(result[0].linesDeleted).toBe(8);
  });
  it('overlayValue は平均', () => {
    const result = groupByWeek([mkEntry('2026-05-01', 4), mkEntry('2026-05-02', 6)]);
    expect(result[0].overlayValue).toBe(5);
  });
  it('overlayValue が全 null なら null のまま', () => {
    const result = groupByWeek([mkEntry('2026-05-01'), mkEntry('2026-05-02')]);
    expect(result[0].overlayValue).toBeNull();
  });
});

describe('capTopN', () => {
  it('topN 以下なら全て表示', () => {
    const totals = new Map([['a', 10], ['b', 5]]);
    const { displayKeys, keyMap } = capTopN(totals, 5);
    expect(displayKeys).toEqual(['a', 'b']);
    expect(keyMap.get('a')).toBe('a');
    expect(keyMap.get('b')).toBe('b');
  });
  it('topN を超えたら下位を Others に集約', () => {
    const totals = new Map([['a', 10], ['b', 5], ['c', 3], ['d', 1]]);
    const { displayKeys, keyMap } = capTopN(totals, 2);
    expect(displayKeys).toEqual(['a', 'b', 'Others']);
    expect(keyMap.get('a')).toBe('a');
    expect(keyMap.get('b')).toBe('b');
    expect(keyMap.get('c')).toBe('Others');
    expect(keyMap.get('d')).toBe('Others');
  });
});
