/**
 * Characterization tests — importAll のフェーズ順序・イベント列・カウンタ
 *
 * `importAll` は CC 79 の直列手続きで、リファクタ前は**これを直接呼ぶテストが 1 本も
 * 無かった**（他パッケージの参照はすべて `jest.fn()` のモック）。フェーズ分割の前に、
 * 外部から観測できる振る舞い＝
 *
 *   1. 戻り値のカウンタ
 *   2. `onPhase` イベントの並び（phase / action / count / message）
 *   3. `onProgress` メッセージの並び
 *
 * をゴールデンマスターとして固定する。ここが緑のままフェーズを関数へ切り出せば、
 * 順序・スキップ判定・カウンタの引き回しが壊れていないことの根拠になる。
 *
 * `os.homedir()` を一時ディレクトリへ差し替えるため、実ユーザーの `~/.claude` は読まない。
 * DB は InMemoryTrailStorage（本番 DB 上書き事故の構造的防止）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ImportAllPhaseEvent } from '../TrailDatabase';
import type { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

const SID_1 = 'aaaabbbb-0000-0000-0000-00000000a001';
const SID_2 = 'aaaabbbb-0000-0000-0000-00000000a002';

function sessionLines(sessionId: string, cwd: string): unknown[] {
  return [
    {
      type: 'user',
      uuid: `${sessionId}-u1`,
      sessionId,
      parentUuid: null,
      timestamp: '2026-01-15T00:00:00.000Z',
      message: { role: 'user', content: 'Hello' },
      cwd,
    },
    {
      type: 'assistant',
      uuid: `${sessionId}-a1`,
      sessionId,
      parentUuid: `${sessionId}-u1`,
      timestamp: '2026-01-15T00:01:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
        usage: { input_tokens: 100, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
      },
      cwd,
    },
  ];
}

function writeJsonl(filePath: string, lines: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
}

/**
 * `~/.claude/projects/<project>/<sid>.jsonl` 構成の作業用 HOME を作る。
 * - セッション 2 本（うち 1 本は subagents 配下に 1 ファイル）
 * - UUID でないファイル名は取り込み対象外（collectClaudeCodeSessionDirs の UUID_RE）
 */
function buildFakeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-importall-home-'));
  const projectDir = path.join(home, '.claude', 'projects', '-repo-a');

  writeJsonl(path.join(projectDir, `${SID_1}.jsonl`), sessionLines(SID_1, '/repo-a'));
  writeJsonl(
    path.join(projectDir, SID_1, 'subagents', 'sub-1.jsonl'),
    sessionLines(SID_1, '/repo-a'),
  );
  writeJsonl(path.join(projectDir, `${SID_2}.jsonl`), sessionLines(SID_2, '/repo-a'));
  writeJsonl(path.join(projectDir, 'not-a-uuid.jsonl'), sessionLines('not-a-uuid', '/repo-a'));

  return home;
}

interface RunResult {
  counters: Awaited<ReturnType<TrailDatabase['importAll']>>;
  phases: ImportAllPhaseEvent[];
  progress: string[];
}

async function runImportAll(
  db: TrailDatabase,
  lepOpts?: Parameters<TrailDatabase['importAll']>[5],
): Promise<RunResult> {
  const phases: ImportAllPhaseEvent[] = [];
  const progress: string[] = [];
  const counters = await db.importAll(
    (message) => { progress.push(message); },
    undefined,
    undefined,
    undefined,
    (event) => { phases.push(event); },
    lepOpts,
  );
  return { counters, phases, progress };
}

describe('TrailDatabase.importAll — phase sequence golden master', () => {
  let db: TrailDatabase;
  let home: string;
  let homedirSpy: jest.SpyInstance<string, []>;

  beforeEach(async () => {
    home = buildFakeHome();
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(home);
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    db.close();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('emits the phases in a fixed order with gitRoot absent', async () => {
    const { counters, phases } = await runImportAll(db);

    // gitRoot が無い実行では、git 依存フェーズが skip、それ以外が start→finish で並ぶ。
    // 並び順そのものが振る舞いなので、配列全体を固定する。
    expect(phases).toEqual([
      { phase: 'import_sessions', action: 'start', count: 2 },
      { phase: 'import_sessions', action: 'finish', count: 3 },
      { phase: 'resolve_releases', action: 'skip', message: 'no gitRoot' },
      { phase: 'analyze_releases', action: 'skip', message: 'no gitRoot' },
      { phase: 'import_coverage', action: 'skip', message: 'no gitRoot' },
      { phase: 'rebuild_costs', action: 'start' },
      { phase: 'rebuild_costs', action: 'finish' },
      { phase: 'analyze_behavior', action: 'start', count: 2 },
      { phase: 'analyze_behavior', action: 'finish', count: 2 },
      { phase: 'rebuild_counts', action: 'start' },
      { phase: 'rebuild_counts', action: 'finish' },
      { phase: 'backfill', action: 'start' },
      { phase: 'backfill', action: 'finish', count: 0 },
    ]);

    // main 2 本 + subagent 1 本 = 3 ファイル取り込み。UUID でない 1 本は対象外。
    expect(counters).toEqual({
      imported: 3,
      skipped: 0,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    });
  });

  it('reports the discovered session/file counts through onProgress', async () => {
    const { progress } = await runImportAll(db);

    expect(progress[0]).toBe(
      'Found 2 sessions (3 files): Claude Code 2 sessions (3 files), Codex 0 sessions (0 files)',
    );
    expect(progress).toContain('Rebuilding session costs...');
    expect(progress).toContain('Session costs rebuilt');
    expect(progress).toContain('Rebuilding daily counts...');
    expect(progress).toContain('Rebuilding session stats...');
    expect(progress).toContain('Backfilling subagent_type...');
    expect(progress).toContain('Backfilling message_commits...');
  });

  it('skips unchanged sessions on the second run and analyzes none', async () => {
    await runImportAll(db);
    const second = await runImportAll(db);

    expect(second.counters.imported).toBe(0);
    expect(second.counters.skipped).toBe(3);
    expect(second.phases).toContainEqual({ phase: 'import_sessions', action: 'finish', count: 0 });
    expect(second.phases).toContainEqual({
      phase: 'analyze_behavior', action: 'skip', message: 'no new sessions',
    });
  });

  it('re-imports a session whose file grew since the last run', async () => {
    await runImportAll(db);

    const mainFile = path.join(home, '.claude', 'projects', '-repo-a', `${SID_2}.jsonl`);
    fs.appendFileSync(
      mainFile,
      JSON.stringify({
        type: 'user',
        uuid: `${SID_2}-u2`,
        sessionId: SID_2,
        parentUuid: `${SID_2}-a1`,
        timestamp: '2026-01-15T00:02:00.000Z',
        message: { role: 'user', content: 'More' },
        cwd: '/repo-a',
      }) + '\n',
      'utf-8',
    );

    const second = await runImportAll(db);

    expect(second.counters.imported).toBe(1);
    expect(second.counters.skipped).toBe(2);
    expect(second.phases).toContainEqual({ phase: 'analyze_behavior', action: 'start', count: 1 });
  });

  it('skips the whole session scan when phasesToSkip has import_sessions', async () => {
    const { counters, phases } = await runImportAll(db, {
      phasesToSkip: new Set(['import_sessions'] as const),
    });

    // import_sessions の start/finish は出ない。後続フェーズは通常どおり走る。
    expect(phases.filter((p) => p.phase === 'import_sessions')).toEqual([]);
    expect(phases[0]).toEqual({ phase: 'resolve_releases', action: 'skip', message: 'no gitRoot' });
    expect(counters.imported).toBe(0);
    expect(counters.skipped).toBe(0);
  });

  it('carries external counters into the returned totals', async () => {
    const { counters } = await runImportAll(db, {
      phasesToSkip: new Set(['import_sessions'] as const),
      externalCounters: {
        imported: 7,
        skipped: 5,
        commitsResolved: 3,
        releasesResolved: 2,
        coverageImported: 1,
        currentCoverageImported: 4,
      },
    });

    expect(counters.imported).toBe(7);
    expect(counters.skipped).toBe(5);
    expect(counters.commitsResolved).toBe(3);
    // gitRoot が無いと resolve_releases / import_coverage は skip され、外部値がそのまま出る。
    expect(counters.releasesResolved).toBe(2);
    expect(counters.coverageImported).toBe(1);
    expect(counters.currentCoverageImported).toBe(4);
  });

  it('honours externalSessionsToAnalyze when phase 1 is delegated', async () => {
    const { phases } = await runImportAll(db, {
      phasesToSkip: new Set(['import_sessions'] as const),
      externalSessionsToAnalyze: new Set([SID_1]),
    });

    expect(phases).toContainEqual({ phase: 'analyze_behavior', action: 'start', count: 1 });
  });

  it('returns zeroed counters when the projects directory does not exist', async () => {
    fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });

    const { counters, phases } = await runImportAll(db);

    expect(counters).toEqual({
      imported: 0,
      skipped: 0,
      commitsResolved: 0,
      releasesResolved: 0,
      releasesAnalyzed: 0,
      coverageImported: 0,
      currentCoverageImported: 0,
      messageCommitsBackfilled: 0,
    });
    // readdirSync に失敗した時点で即 return するため、フェーズは 1 つも出ない。
    expect(phases).toEqual([]);
  });
});
