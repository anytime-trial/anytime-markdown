// Codex rollout からの handoff 生成（parseCodexTranscript / findCodexRolloutPath /
// generateCodexHandoff）のテスト。実 rollout（Codex CLI 0.154.0, cli_version フィールドで確認）
// の event_msg.item_completed 形式を fixture 化している。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCodexTranscript,
  parseCodexLines,
} from '../parseCodexTranscript';
import {
  findCodexRolloutPath,
  generateCodexHandoff,
} from '../generate';

interface RolloutFixtureSpec {
  readonly sessionId: string;
  readonly cwd: string;
  readonly userText: string;
  readonly agentText: string;
  readonly command: readonly string[];
  readonly changedFiles: Readonly<Record<string, unknown>>;
  /** 末尾に付けるノイズ行（壊れた JSON・未知 item.type）の有無 */
  readonly withNoise?: boolean;
}

function itemCompletedLine(item: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: '2026-09-20T10:09:01.251Z',
    type: 'event_msg',
    payload: { type: 'item_completed', item },
  });
}

function writeRolloutFixture(dir: string, filename: string, spec: RolloutFixtureSpec): string {
  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      timestamp: '2026-09-20T10:08:50.055Z',
      type: 'session_meta',
      payload: { id: spec.sessionId, timestamp: '2026-09-20T10:08:50.055Z', cwd: spec.cwd },
    }),
  );
  lines.push(itemCompletedLine({ type: 'UserMessage', id: 'u1', content: [{ type: 'text', text: spec.userText }] }));
  lines.push(itemCompletedLine({ type: 'Reasoning', id: 'r1', content: [{ type: 'Text', text: 'internal reasoning, should be ignored' }] }));
  lines.push(
    itemCompletedLine({
      type: 'CommandExecution',
      id: 'c1',
      command: spec.command,
      cwd: `file://${spec.cwd}`,
      status: 'completed',
    }),
  );
  lines.push(itemCompletedLine({ type: 'FileChange', id: 'f1', changes: spec.changedFiles, status: 'completed' }));
  lines.push(itemCompletedLine({ type: 'AgentMessage', id: 'a1', content: [{ type: 'Text', text: spec.agentText }] }));
  if (spec.withNoise) {
    lines.push('{ this is not valid json');
    lines.push(itemCompletedLine({ type: 'SomeFutureItemType', id: 'x1' }));
  }
  const file = join(dir, filename);
  writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

describe('parseCodexTranscript / parseCodexLines', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-transcript-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('UserMessage/AgentMessage/CommandExecution/FileChange を抽出し Reasoning・未知 type・壊れた行は無視する', () => {
    const file = writeRolloutFixture(dir, 'rollout-1.jsonl', {
      sessionId: 'sid-1',
      cwd: '/repo/work',
      userText: 'バグを直して',
      agentText: '修正完了しました',
      command: ['/bin/bash', '-lc', 'npm test'],
      changedFiles: { '/repo/work/src/a.ts': { type: 'update' } },
      withNoise: true,
    });

    const result = parseCodexTranscript(file);
    expect(result).not.toBeNull();
    expect(result!.cwd).toBe('/repo/work');

    const roles = result!.events.map((e) => `${e.role}:${e.tool}`);
    expect(roles).toEqual(['user:', 'tool:Bash', 'tool:FileChange', 'assistant:']);

    const userEvent = result!.events.find((e) => e.role === 'user');
    expect(userEvent!.text).toBe('バグを直して');
    const cmdEvent = result!.events.find((e) => e.tool === 'Bash');
    expect(cmdEvent!.detail).toBe('/bin/bash -lc npm test');
    const fileEvent = result!.events.find((e) => e.tool === 'FileChange');
    expect(fileEvent!.files).toEqual(['/repo/work/src/a.ts']);
    const agentEvent = result!.events.find((e) => e.role === 'assistant');
    expect(agentEvent!.text).toBe('修正完了しました');
  });

  it('session_meta が無い/型不一致なら null', () => {
    const file = join(dir, 'rollout-bad.jsonl');
    writeFileSync(file, `${JSON.stringify({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage' } } })}\n`);
    expect(parseCodexTranscript(file)).toBeNull();
  });

  it('読み取り不能（ファイル不在）なら null', () => {
    expect(parseCodexTranscript(join(dir, 'no-such-file.jsonl'))).toBeNull();
  });

  it('parseCodexLines は空行・空配列で空を返す', () => {
    expect(parseCodexLines([])).toEqual([]);
    expect(parseCodexLines(['', '   '])).toEqual([]);
  });
});

describe('findCodexRolloutPath', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-locate-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('複数日付ディレクトリに跨る rollout から sessionId 一致の 1 件だけを返す', () => {
    const d1 = join(dir, '2026', '09', '18');
    const d2 = join(dir, '2026', '09', '20');
    mkdirSync(d1, { recursive: true });
    mkdirSync(d2, { recursive: true });
    writeRolloutFixture(d1, 'rollout-a.jsonl', {
      sessionId: 'sid-a',
      cwd: '/repo/a',
      userText: 'A の指示',
      agentText: 'A 完了',
      command: ['echo', 'a'],
      changedFiles: {},
    });
    writeRolloutFixture(d2, 'rollout-b.jsonl', {
      sessionId: 'sid-b',
      cwd: '/repo/b',
      userText: 'B の指示',
      agentText: 'B 完了',
      command: ['echo', 'b'],
      changedFiles: {},
    });

    expect(findCodexRolloutPath('sid-b', dir)).toBe(join(d2, 'rollout-b.jsonl'));
    expect(findCodexRolloutPath('sid-a', dir)).toBe(join(d1, 'rollout-a.jsonl'));
    expect(findCodexRolloutPath('sid-missing', dir)).toBeNull();
  });

  it('maxFiles=0 は常に null（走査しない）', () => {
    const d1 = join(dir, '2026', '09', '18');
    mkdirSync(d1, { recursive: true });
    writeRolloutFixture(d1, 'rollout-a.jsonl', {
      sessionId: 'sid-a',
      cwd: '/repo/a',
      userText: 'x',
      agentText: 'y',
      command: ['echo'],
      changedFiles: {},
    });
    expect(findCodexRolloutPath('sid-a', dir, 0)).toBeNull();
  });

  it('ルートディレクトリが存在しない場合は null', () => {
    expect(findCodexRolloutPath('sid-a', join(dir, 'does-not-exist'))).toBeNull();
  });
});

describe('generateCodexHandoff', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-generate-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('payload/markdown/injection/cwd を返し、秘密情報を伏字化する', () => {
    const dateDir = join(dir, '2026', '09', '20');
    mkdirSync(dateDir, { recursive: true });
    writeRolloutFixture(dateDir, 'rollout-x.jsonl', {
      sessionId: 'sid-secret',
      cwd: '/repo/work',
      userText: 'APIキーを設定して動作確認して',
      agentText: '動作確認まで完了しました',
      command: ['/bin/bash', '-lc', 'curl -H "Authorization: Bearer sk-abcdefghijklmnopqrstuvwx" https://example.com'],
      changedFiles: { '/repo/work/.env': { type: 'update' } },
    });

    const result = generateCodexHandoff('sid-secret', { rootDir: dir });
    expect(result).not.toBeNull();
    expect(result!.cwd).toBe('/repo/work');
    expect(result!.payload.structured.goal).toBe('APIキーを設定して動作確認して');
    expect(result!.payload.structured.lastState).toBe('動作確認まで完了しました');
    expect(result!.payload.structured.filesTouched).toEqual(['/repo/work/.env']);
    // Claude 経路の HandoffStructured 互換フィールドは Codex には無いので空のまま。
    expect(result!.payload.structured.branch).toBe('');

    // SEC-01: rollout 中の秘密情報が payload/markdown/injection に平文で残らない。
    expect(result!.payload.structured.commands[0]).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(result!.markdown).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(result!.injection).not.toContain('sk-abcdefghijklmnopqrstuvwx');

    // SEC-02: untrusted fence で囲われている。
    expect(result!.injection).toContain('BEGIN handoff context (untrusted data)');
    expect(result!.injection).toContain('END handoff context');
  });

  it('該当セッションが無ければ null', () => {
    expect(generateCodexHandoff('no-such-session', { rootDir: dir })).toBeNull();
  });

  it('2 セッション分の rollout があっても対象セッションの内容だけを返す（NFR-02）', () => {
    const dateDir = join(dir, '2026', '09', '20');
    mkdirSync(dateDir, { recursive: true });
    writeRolloutFixture(dateDir, 'rollout-1.jsonl', {
      sessionId: 'sid-1',
      cwd: '/repo/one',
      userText: '1つ目の指示',
      agentText: '1つ目完了',
      command: ['echo', 'one'],
      changedFiles: { '/repo/one/a.ts': {} },
    });
    writeRolloutFixture(dateDir, 'rollout-2.jsonl', {
      sessionId: 'sid-2',
      cwd: '/repo/two',
      userText: '2つ目の指示',
      agentText: '2つ目完了',
      command: ['echo', 'two'],
      changedFiles: { '/repo/two/b.ts': {} },
    });

    const r1 = generateCodexHandoff('sid-1', { rootDir: dir });
    const r2 = generateCodexHandoff('sid-2', { rootDir: dir });
    expect(r1!.payload.structured.goal).toBe('1つ目の指示');
    expect(r1!.cwd).toBe('/repo/one');
    expect(r1!.injection).not.toContain('2つ目');
    expect(r2!.payload.structured.goal).toBe('2つ目の指示');
    expect(r2!.cwd).toBe('/repo/two');
    expect(r2!.injection).not.toContain('1つ目');
  });
});
