// handoff モジュール（recall 決定論抽出の Node 移植）のユニットテスト。
// PoC（recall-trial/poc）で検証済みの挙動を本番 .ts へ昇格。
import {
  parseLines,
  firstUserGoal,
  lastAssistantState,
  touchedFiles,
  commands,
} from '../parseTranscript';
import { redact } from '../redact';
import { buildHandoffState } from '../buildHandoff';

/** Claude Code JSONL の最小合成フィクスチャ（1 行 = 1 イベント） */
function fixtureLines(): string[] {
  return [
    JSON.stringify({ type: 'user', message: { content: 'Implement chart-core package' } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: "I'll create it." },
          { type: 'tool_use', name: 'Write', input: { file_path: '/pkg/chart.ts' } },
        ],
      },
    }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] },
    }),
    // tool_result のみの user ターン → skip
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
    // スラッシュコマンド展開 → skip
    JSON.stringify({ type: 'user', message: { content: '<command-name>/usage</command-name>' } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done. 46 tests pass.' }] } }),
    '',
    '{ broken json',
  ];
}

describe('parseTranscript', () => {
  const events = parseLines(fixtureLines());

  it('user/assistant/tool イベントを抽出する', () => {
    expect(events.map((e) => e.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant']);
  });

  it('firstUserGoal は最初の実 user プロンプト（command-meta/壊れ行は除外）', () => {
    expect(firstUserGoal(events)).toBe('Implement chart-core package');
  });

  it('lastAssistantState は最後の assistant テキスト', () => {
    expect(lastAssistantState(events)).toBe('Done. 46 tests pass.');
  });

  it('touchedFiles は file_path を重複排除', () => {
    expect(touchedFiles(events)).toEqual(['/pkg/chart.ts']);
  });

  it('commands は Bash command を重複排除', () => {
    expect(commands(events)).toEqual(['npm test']);
  });

  it('goal はスキル/コマンド展開の注入前文をスキップする', () => {
    const ev = parseLines([
      JSON.stringify({ type: 'user', message: { content: 'Base directory for this skill: /x\n# 提案書' } }),
      JSON.stringify({ type: 'user', message: { content: '本当のゴール: バグを直して' } }),
    ]);
    expect(firstUserGoal(ev)).toBe('本当のゴール: バグを直して');
  });

  it('壊れた JSON 行・非オブジェクト行を無視する', () => {
    expect(parseLines(['not json', '123', 'null', '[]'])).toEqual([]);
  });
});

describe('redact', () => {
  it('API キー・トークン・env 値を伏字化する', () => {
    const dirty = 'key sk-ant-abcdef0123456789ABCDEF\nexport API_KEY=supersecretvalue123';
    const clean = redact(dirty);
    expect(clean).not.toContain('sk-ant-abcdef0123456789ABCDEF');
    expect(clean).not.toContain('supersecretvalue123');
    expect(clean).toContain('[REDACTED]');
  });

  it('空文字はそのまま返す', () => {
    expect(redact('')).toBe('');
  });
});

describe('buildHandoffState', () => {
  const events = parseLines(fixtureLines());

  it('圧縮ステート payload を組成する（narrative=null・redact 適用）', () => {
    const state = buildHandoffState(events, { branch: 'feature/chart', lastCommit: 'abc123' });
    expect(state.handoffVersion).toBe(1);
    expect(state.narrative).toBeNull();
    expect(state.structured.goal).toBe('Implement chart-core package');
    expect(state.structured.filesTouched).toEqual(['/pkg/chart.ts']);
    expect(state.structured.commands).toEqual(['npm test']);
    expect(state.structured.lastState).toBe('Done. 46 tests pass.');
    expect(state.structured.branch).toBe('feature/chart');
    expect(state.structured.lastCommit).toBe('abc123');
  });

  it('files/commands を直近 N 件上限で圧縮し全件数を保持する', () => {
    const many: string[] = [];
    for (let i = 0; i < 50; i++) {
      many.push(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: `/f${i}.ts` } }] },
      }));
      many.push(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo ${i}` } }] },
      }));
    }
    const st = buildHandoffState(parseLines(many), { maxFiles: 30, maxCommands: 15 }).structured;
    expect(st.filesTouched).toHaveLength(30);
    expect(st.filesTouchedTotal).toBe(50);
    expect(st.filesTouched.at(-1)).toBe('/f49.ts'); // 直近を残す
    expect(st.commands).toHaveLength(15);
    expect(st.commandsTotal).toBe(50);
  });

  it('JSON シリアライズ可能（summary 列保存用）', () => {
    const state = buildHandoffState(events, {});
    expect(() => JSON.parse(JSON.stringify(state))).not.toThrow();
  });
});
