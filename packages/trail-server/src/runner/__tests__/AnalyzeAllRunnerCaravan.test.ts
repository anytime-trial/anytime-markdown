import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeCaravanBookWithSession } from './fakeCaravanScopeSession';

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

describe('AnalyzeAllRunner — memory analyzers (LEP Step 3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-all-mem-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs all 7 memory scopes in dependsOn order via Wave 3, then closes the session once', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      caravanBookService: makeCaravanBookWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');

    expect(status.lastError).toBeNull();
    expect(fake.calls).toEqual([
      'runConversation',
      'runCode',
      'runBugHistory',
      'runReview',
      'runSpec',
      'runDrift',
      'runEmbeddingBackfill',
    ]);
    expect(fake.closed).toBe(1);
  });

  it('Ollama 復旧後の次 run で LLM 依存 scope を再開する（run 境界で可用性を測り直す）', async () => {
    // provider は runner のコンストラクタで 1 度だけ作られ daemon の生存期間使われる。
    // 可用性を run スコープにしないと、起動時に Ollama が落ちていた場合の「利用不可」が
    // 永久に残り、復旧しても daemon 再起動まで会話取込が止まる。
    //
    // provider 単体ではなく runner 越しに検査するのは、run 境界の配線
    // (runner の finally → provider.endRun) が失われても気づけるようにするため。
    const fake = makeFakeScopeSession();
    let reachable = false;
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      caravanBookService: makeCaravanBookWithSession(dir, fake.session),
      checkLlmAvailability: async () => ({
        ollama_chat: { ok: reachable },
        ollama_embedding: { ok: reachable },
      }),
    });

    // run 1: Ollama 停止中 → LLM 依存 scope は skip、LLM 非依存は実行
    await runner.runOnce('manual');
    expect(fake.calls).not.toContain('runConversation');
    expect(fake.calls).toContain('runBugHistory');

    // run 2: Ollama 復旧後 → 測り直して会話取込が走る
    fake.calls.length = 0;
    reachable = true;
    await runner.runOnce('manual');
    expect(fake.calls).toContain('runConversation');
  });

  it('surfaces a scope error as lastError and still closes the session', async () => {
    const fake = makeFakeScopeSession({ errorOnScope: 'runReview', errorMessage: 'review boom' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      caravanBookService: makeCaravanBookWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');

    expect(status.lastError).toContain('review boom');
    expect(fake.closed).toBe(1);
    // 他 analyzer は独立なので review 失敗後も走る (LEP モデル)
    expect(fake.calls).toContain('runDrift');
  });

  it('disabledCaravanAnalyzers omits those scopes (lep.json analyzers.<id>.enabled:false)', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      caravanBookService: makeCaravanBookWithSession(dir, fake.session),
      disabledCaravanAnalyzers: ['ConversationCaravanAnalyzer', 'EmbeddingBackfillAnalyzer'],
    });

    await runner.runOnce('manual');
    expect(fake.calls).not.toContain('runConversation');
    expect(fake.calls).not.toContain('runEmbeddingBackfill');
    expect(fake.calls).toContain('runCode');
    expect(fake.calls).toContain('runDrift');
  });
});
