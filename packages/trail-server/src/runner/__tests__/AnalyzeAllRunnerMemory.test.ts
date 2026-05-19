import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnalyzeAllRunner } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeMemoryCoreWithSession } from './fakeMemoryScopeSession';

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
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
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

  it('surfaces a scope error as lastError and still closes the session', async () => {
    const fake = makeFakeScopeSession({ errorOnScope: 'runReview', errorMessage: 'review boom' });
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
    });

    const status = await runner.runOnce('manual');

    expect(status.lastError).toContain('review boom');
    expect(fake.closed).toBe(1);
    // 他 analyzer は独立なので review 失敗後も走る (LEP モデル)
    expect(fake.calls).toContain('runDrift');
  });

  it('disabledMemoryAnalyzers omits those scopes (lep.json analyzers.<id>.enabled:false)', async () => {
    const fake = makeFakeScopeSession();
    const runner = new AnalyzeAllRunner({
      logSink: makeLogSink(),
      statePath: join(dir, 'runner.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      disabledMemoryAnalyzers: ['ConversationMemoryAnalyzer', 'EmbeddingBackfillAnalyzer'],
    });

    await runner.runOnce('manual');
    expect(fake.calls).not.toContain('runConversation');
    expect(fake.calls).not.toContain('runEmbeddingBackfill');
    expect(fake.calls).toContain('runCode');
    expect(fake.calls).toContain('runDrift');
  });
});
