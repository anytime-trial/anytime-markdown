/**
 * Additional coverage for AnalyzeAllRunner.ts — targeting uncovered lines:
 *   line 380: memory session close() throws → [WARN] logged, run continues
 *   line 390: onAfterRun() throws → [WARN] logged, does not propagate
 *   line 413: markMemoryScopesSkippedIfExcluded throws → [WARN] logged, does not propagate
 *   line 453: defaultAnalyzeAllStatePath called without argument (no gitRoot)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AnalyzeAllRunner, defaultAnalyzeAllStatePath } from '../AnalyzeAllRunner';
import { makeFakeScopeSession, makeMemoryCoreWithSession } from './fakeMemoryScopeSession';
import type { MemoryDbSession } from '@anytime-markdown/memory-core';

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

describe('AnalyzeAllRunner — edge coverage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analyze-edge-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('memory session close() throws → [WARN] logged, run reports success', async () => {
    const fake = makeFakeScopeSession();
    const closeThrows = Object.assign(Object.create(Object.getPrototypeOf(fake.session)) as MemoryDbSession, {
      ...fake.session,
      close: () => { throw new Error('close failed'); },
    });
    const mc = makeMemoryCoreWithSession(dir, closeThrows);
    const logSink = makeLogSink();

    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'state.json'),
      memoryCoreService: mc,
    });

    const status = await runner.runOnce('manual');
    // The warning is logged
    expect(logSink.lines.join('\n')).toContain('[WARN] memory session close failed');
    // But the run itself still counts as successful (no runError from close)
    expect(status.ticksRun).toBe(1);
  });

  it('onAfterRun() throws → [WARN] logged, does not propagate as run error', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();

    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'state.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      onAfterRun: () => { throw new Error('afterRun boom'); },
    });

    const status = await runner.runOnce('manual');
    expect(logSink.lines.join('\n')).toContain('[WARN] onAfterRun callback failed');
    // status should still succeed
    expect(status.ticksRun).toBe(1);
    expect(status.lastError).toBeNull();
  });

  it('markMemoryScopesSkipped throws when PipelineStatusWriter fails → [WARN] logged', async () => {
    const fake = makeFakeScopeSession();
    const logSink = makeLogSink();

    // Create a file at the parent directory location so mkdir fails inside PipelineStatusWriter,
    // which triggers the catch in markMemoryScopesSkippedIfExcluded.
    const statusDir = join(dir, 'status-dir-is-actually-a-file');
    // Make a file where the status directory would be needed
    const { writeFileSync } = await import('node:fs');
    writeFileSync(statusDir, 'I am a file, not a dir');
    // The status file path is inside "statusDir" (a file), so mkdirSync will fail
    const pipelineStatusFilePath = join(statusDir, 'status.json');

    const runner = new AnalyzeAllRunner({
      logSink,
      statePath: join(dir, 'state.json'),
      memoryCoreService: makeMemoryCoreWithSession(dir, fake.session),
      stage: 'primary',
      pipelineStatusFilePath,
    });

    // Should not throw — exception is caught and warned
    const status = await runner.runOnce('manual');
    expect(logSink.lines.join('\n')).toContain('[WARN] failed to mark memory scopes skipped');
    expect(status.ticksRun).toBe(1);
  });

  it('defaultAnalyzeAllStatePath without argument uses getTrailHome(undefined)', () => {
    const p = defaultAnalyzeAllStatePath();
    expect(p).toContain('analyze-all-runner.json');
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(0);
  });

  it('defaultAnalyzeAllStatePath with gitRoot includes trail home subpath', () => {
    const p = defaultAnalyzeAllStatePath('/some/project');
    expect(p).toContain('analyze-all-runner.json');
  });
});
