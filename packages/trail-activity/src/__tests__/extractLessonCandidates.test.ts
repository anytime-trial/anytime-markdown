import { extractLessonCandidates } from '../domain/usecase/ExtractLessonCandidates';

function assistantToolUse(calls: Array<{ id: string; name: string }>): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-17T00:00:00.000Z',
    message: { content: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: {} })) },
  });
}

function userToolResults(results: Array<{ id: string; isError: boolean }>): string {
  return JSON.stringify({
    type: 'user',
    timestamp: '2026-07-17T00:00:00.000Z',
    message: {
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        ...(r.isError ? { is_error: true } : {}),
      })),
    },
  });
}

describe('extractLessonCandidates', () => {
  it('連続 2 回以上のツール失敗連鎖を学習候補として抽出する（ツール名付き）', () => {
    const lines = [
      assistantToolUse([{ id: 't1', name: 'Bash' }]),
      userToolResults([{ id: 't1', isError: true }]),
      assistantToolUse([{ id: 't2', name: 'Bash' }]),
      userToolResults([{ id: 't2', isError: true }]),
      assistantToolUse([{ id: 't3', name: 'Edit' }]),
      userToolResults([{ id: 't3', isError: false }]),
    ];
    const candidates = extractLessonCandidates({ lines, feedbackEntries: [] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.kind).toBe('tool_failure_chain');
    expect(candidates[0]?.summary).toContain('2');
    expect(candidates[0]?.evidence).toContain('Bash');
  });

  it('単発の失敗（連鎖 1 回）は候補にしない', () => {
    const lines = [
      assistantToolUse([{ id: 't1', name: 'Bash' }]),
      userToolResults([{ id: 't1', isError: true }]),
      assistantToolUse([{ id: 't2', name: 'Edit' }]),
      userToolResults([{ id: 't2', isError: false }]),
    ];
    expect(extractLessonCandidates({ lines, feedbackEntries: [] })).toHaveLength(0);
  });

  it('成功を挟んだ失敗は別の連鎖として数える', () => {
    const lines = [
      assistantToolUse([{ id: 't1', name: 'Bash' }]),
      userToolResults([{ id: 't1', isError: true }]),
      userToolResults([{ id: 't2', isError: true }]),
      userToolResults([{ id: 't3', isError: false }]),
      userToolResults([{ id: 't4', isError: true }]),
      userToolResults([{ id: 't5', isError: true }]),
      userToolResults([{ id: 't6', isError: true }]),
    ];
    const candidates = extractLessonCandidates({ lines, feedbackEntries: [] });
    expect(candidates).toHaveLength(2);
    expect(candidates[1]?.summary).toContain('3');
  });

  it('ユーザー訂正エントリを user_correction 候補に変換する', () => {
    const candidates = extractLessonCandidates({
      lines: [],
      feedbackEntries: [{ promptExcerpt: 'A ではなく B で実装して', matchedPattern: 'ではなく' }],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.kind).toBe('user_correction');
    expect(candidates[0]?.summary).toContain('ではなく');
    expect(candidates[0]?.evidence).toBe('A ではなく B で実装して');
  });

  it('候補は最大 20 件に制限する', () => {
    const feedbackEntries = Array.from({ length: 30 }, (_, i) => ({
      promptExcerpt: `修正 ${i}`,
      matchedPattern: '違う',
    }));
    expect(extractLessonCandidates({ lines: [], feedbackEntries })).toHaveLength(20);
  });

  it('sidechain 行は連鎖集計から除外する', () => {
    const sidechainFail = JSON.stringify({
      type: 'user',
      isSidechain: true,
      message: { content: [{ type: 'tool_result', tool_use_id: 'x1', is_error: true }] },
    });
    const lines = [
      sidechainFail,
      sidechainFail,
      assistantToolUse([{ id: 't1', name: 'Bash' }]),
      userToolResults([{ id: 't1', isError: false }]),
    ];
    expect(extractLessonCandidates({ lines, feedbackEntries: [] })).toHaveLength(0);
  });
});
