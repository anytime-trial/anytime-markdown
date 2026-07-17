import { computeFlightOutcome } from '../domain/usecase/ComputeFlightOutcome';

interface LineOptions {
  type?: 'user' | 'assistant' | 'system';
  timestamp?: string;
  isSidechain?: boolean;
  content?: unknown[];
}

function line(opts: LineOptions): string {
  const { type = 'assistant', timestamp = '2026-07-17T00:00:00.000Z', isSidechain, content = [] } = opts;
  return JSON.stringify({
    type,
    timestamp,
    ...(isSidechain === undefined ? {} : { isSidechain }),
    message: { content },
  });
}

function toolUse(name: string, input: Record<string, unknown>): unknown {
  return { type: 'tool_use', id: 'tu_1', name, input };
}

function toolResult(isError: boolean): unknown {
  return { type: 'tool_result', tool_use_id: 'tu_1', ...(isError ? { is_error: true } : {}) };
}

describe('computeFlightOutcome', () => {
  it('空入力では null / 0 の集計を返す', () => {
    const result = computeFlightOutcome([]);
    expect(result).toEqual({
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      toolCallCount: 0,
      toolFailureCount: 0,
      reworkCount: 0,
    });
  });

  it('先頭・末尾 timestamp から所要時間を秒で算出する', () => {
    const result = computeFlightOutcome([
      line({ type: 'user', timestamp: '2026-07-17T00:00:00.000Z' }),
      line({ timestamp: '2026-07-17T00:01:30.500Z' }),
    ]);
    expect(result.startedAt).toBe('2026-07-17T00:00:00.000Z');
    expect(result.endedAt).toBe('2026-07-17T00:01:30.500Z');
    expect(result.durationSeconds).toBe(91);
  });

  it('tool_use をカウントし、is_error === true の tool_result を失敗として数える', () => {
    const result = computeFlightOutcome([
      line({ content: [toolUse('Read', { file_path: '/a.ts' }), toolUse('Bash', { command: 'ls' })] }),
      line({ type: 'user', content: [toolResult(true)] }),
      line({ type: 'user', content: [toolResult(false)] }),
    ]);
    expect(result.toolCallCount).toBe(2);
    expect(result.toolFailureCount).toBe(1);
  });

  it('同一ファイルへの 2 回目以降の Edit/Write を手戻りとして数える', () => {
    const result = computeFlightOutcome([
      line({ content: [toolUse('Edit', { file_path: '/a.ts' })] }),
      line({ content: [toolUse('Write', { file_path: '/a.ts' })] }),
      line({ content: [toolUse('Edit', { file_path: '/a.ts' })] }),
      line({ content: [toolUse('Edit', { file_path: '/b.ts' })] }),
    ]);
    // /a.ts への 2 回目・3 回目 = 2。/b.ts は初回のみ = 0
    expect(result.reworkCount).toBe(2);
  });

  it('revert 系 Bash（git restore / reset / checkout -- ）を手戻りとして数える', () => {
    const result = computeFlightOutcome([
      line({ content: [toolUse('Bash', { command: 'git restore src/a.ts' })] }),
      line({ content: [toolUse('Bash', { command: 'git reset --hard HEAD~1' })] }),
      line({ content: [toolUse('Bash', { command: 'git checkout -- src/b.ts' })] }),
      line({ content: [toolUse('Bash', { command: 'git checkout feature/x' })] }),
      line({ content: [toolUse('Bash', { command: 'npm test' })] }),
    ]);
    expect(result.reworkCount).toBe(3);
  });

  it('サブエージェント行（isSidechain）と不正 JSON 行は集計から除外する', () => {
    const result = computeFlightOutcome([
      'not-json{{{',
      line({ isSidechain: true, timestamp: '2026-07-16T00:00:00.000Z', content: [toolUse('Edit', { file_path: '/a.ts' })] }),
      line({ timestamp: '2026-07-17T00:00:10.000Z', content: [toolUse('Edit', { file_path: '/a.ts' })] }),
    ]);
    expect(result.startedAt).toBe('2026-07-17T00:00:10.000Z');
    expect(result.toolCallCount).toBe(1);
    expect(result.reworkCount).toBe(0);
  });
});
