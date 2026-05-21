/**
 * MemoryCoreService の追加テスト。
 *
 * 既存の src/service/__tests__/MemoryCoreService.test.ts でカバーされていない
 * buildPipelineContext() / buildPipelineLogger() / defaultStatePath() を検証する。
 * openScopeSession() は openMemoryDbSession に fs 依存があるため、ここでは
 * モック経由で動線のみ確認する。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { MemoryCoreService, defaultStatePath } from '../../src/service/MemoryCoreService';
import type { MemoryCoreServiceOptions } from '../../src/service/types';

// openMemoryDbSession を mock する
jest.mock('../../src/service/openMemoryDbSession', () => ({
  openMemoryDbSession: jest.fn(),
}));

// defaultMemoryCorePipelineRunner を mock する (pipelineRunner 未指定経路)
jest.mock('../../src/service/defaultMemoryCorePipelineRunner', () => ({
  runMemoryCorePipeline: jest.fn(async () => undefined),
}));

import { openMemoryDbSession } from '../../src/service/openMemoryDbSession';
const mockOpenMemoryDbSession = openMemoryDbSession as jest.MockedFunction<typeof openMemoryDbSession>;

import { runMemoryCorePipeline } from '../../src/service/defaultMemoryCorePipelineRunner';
const mockRunMemoryCorePipeline = runMemoryCorePipeline as jest.MockedFunction<typeof runMemoryCorePipeline>;

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function makeOpts(
  dir: string,
  overrides: Partial<MemoryCoreServiceOptions> = {},
): MemoryCoreServiceOptions {
  return {
    logSink: makeLogSink(),
    trailDbPath: join(dir, 'trail.db'),
    dbPath: join(dir, 'memory-core.db'),
    statePath: join(dir, 'memory-core-runner.json'),
    pipelineRunner: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('MemoryCoreService — additional coverage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memcore-svc-add-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // ── buildPipelineContext ───────────────────────────────────────────────

  describe('buildPipelineContext()', () => {
    it('returns a PipelineRunnerContext with all configured fields', () => {
      const opts = makeOpts(dir, {
        gitRoot: '/repo',
        backfillDays: 30,
        backupGenerations: 3,
        backupIntervalDays: 2,
        llm: { baseUrl: 'http://ollama:11434', chatModel: 'qwen', embedModel: 'bge' },
      });
      const svc = new MemoryCoreService(opts);
      const ctx = svc.buildPipelineContext();

      expect(ctx.trailDbPath).toBe(opts.trailDbPath);
      expect(ctx.dbPath).toBe(opts.dbPath);
      expect(ctx.gitRoot).toBe('/repo');
      expect(ctx.backfillDays).toBe(30);
      expect(ctx.backupGenerations).toBe(3);
      expect(ctx.backupIntervalDays).toBe(2);
      expect(ctx.llm?.baseUrl).toBe('http://ollama:11434');
      expect(ctx.llm?.chatModel).toBe('qwen');
      expect(ctx.llm?.embedModel).toBe('bge');
    });

    it('logger.info forwards through logSink with [INFO] prefix', () => {
      const logSink = makeLogSink();
      const svc = new MemoryCoreService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.info('hello world');

      expect(logSink.lines.some((l) => l.includes('[INFO] hello world'))).toBe(true);
    });

    it('logger.error formats Error instance with stack', () => {
      const logSink = makeLogSink();
      const svc = new MemoryCoreService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      const err = new Error('boom');
      ctx.logger.error('something went wrong', err);

      const line = logSink.lines.find((l) => l.includes('[ERROR]'));
      expect(line).toBeDefined();
      expect(line).toContain('something went wrong');
      expect(line).toContain('boom');
    });

    it('logger.error formats non-Error value with String()', () => {
      const logSink = makeLogSink();
      const svc = new MemoryCoreService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.error('fail msg', 'plain string error');

      const line = logSink.lines.find((l) => l.includes('[ERROR]'));
      expect(line).toBeDefined();
      expect(line).toContain('fail msg');
      expect(line).toContain('plain string error');
    });

    it('logger.error with no err argument omits trailing content', () => {
      const logSink = makeLogSink();
      const svc = new MemoryCoreService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.error('bare error');

      const line = logSink.lines.find((l) => l.includes('[ERROR] bare error'));
      expect(line).toBeDefined();
      // no extra newline after 'bare error'
      expect(line?.endsWith('bare error')).toBe(true);
    });

    it('logger.error with Error that has no stack falls back to message', () => {
      const logSink = makeLogSink();
      const svc = new MemoryCoreService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      const err = new Error('no-stack');
      delete err.stack;
      ctx.logger.error('err without stack', err);

      const line = logSink.lines.find((l) => l.includes('[ERROR]'));
      expect(line).toBeDefined();
      expect(line).toContain('no-stack');
    });
  });

  // ── openScopeSession ───────────────────────────────────────────────────

  describe('openScopeSession()', () => {
    it('delegates to openMemoryDbSession and returns its result', async () => {
      const mockSession = { close: jest.fn() } as unknown as import('../../src/service/MemoryDbSession').MemoryDbSession;
      mockOpenMemoryDbSession.mockResolvedValue(mockSession);

      const svc = new MemoryCoreService(makeOpts(dir));
      const session = await svc.openScopeSession();

      expect(mockOpenMemoryDbSession).toHaveBeenCalledTimes(1);
      expect(session).toBe(mockSession);
    });

    it('returns null when openMemoryDbSession returns null (trail.db not found)', async () => {
      mockOpenMemoryDbSession.mockResolvedValue(null);

      const svc = new MemoryCoreService(makeOpts(dir));
      const session = await svc.openScopeSession();

      expect(session).toBeNull();
    });

    it('passes the PipelineRunnerContext built from serviceOpts', async () => {
      mockOpenMemoryDbSession.mockResolvedValue(null);
      const opts = makeOpts(dir, { gitRoot: '/workspace', backfillDays: 7 });
      const svc = new MemoryCoreService(opts);

      await svc.openScopeSession();

      const ctx = mockOpenMemoryDbSession.mock.calls[0]?.[0];
      expect(ctx?.gitRoot).toBe('/workspace');
      expect(ctx?.backfillDays).toBe(7);
    });
  });

  // ── defaultStatePath ───────────────────────────────────────────────────

  describe('defaultStatePath()', () => {
    it('returns a path ending with memory-core-runner.json', () => {
      process.env.TRAIL_HOME = dir;
      const p = defaultStatePath('/some/workspace');
      delete process.env.TRAIL_HOME;
      expect(p.endsWith('memory-core-runner.json')).toBe(true);
    });

    it('uses TRAIL_HOME env when set', () => {
      process.env.TRAIL_HOME = dir;
      const p = defaultStatePath();
      delete process.env.TRAIL_HOME;
      expect(p.startsWith(dir)).toBe(true);
    });

    it('uses workspaceRoot when TRAIL_HOME is not set', () => {
      delete process.env.TRAIL_HOME;
      const p = defaultStatePath(dir);
      expect(p.startsWith(dir)).toBe(true);
      expect(p).toContain('memory-core-runner.json');
    });
  });

  // ── runImpl (pipelineRunner 注入あり) ──────────────────────────────────

  describe('runImpl via runOnce', () => {
    it('passes PipelineRunnerContext to pipelineRunner', async () => {
      const capturedCtxs: unknown[] = [];
      const pipelineRunner = jest.fn(async (ctx: unknown) => {
        capturedCtxs.push(ctx);
      });

      const opts = makeOpts(dir, {
        pipelineRunner,
        gitRoot: '/my-repo',
        llm: { chatModel: 'my-model' },
      });
      const svc = new MemoryCoreService(opts);
      await svc.runOnce('manual');

      expect(pipelineRunner).toHaveBeenCalledTimes(1);
      const ctx = capturedCtxs[0] as Record<string, unknown>;
      expect(ctx.gitRoot).toBe('/my-repo');
      expect((ctx.llm as Record<string, unknown>)?.chatModel).toBe('my-model');
    });

    it('uses defaultPipelineRunner (defaultMemoryCorePipelineRunner) when pipelineRunner is not provided', async () => {
      // pipelineRunner を省略 → defaultPipelineRunner → runMemoryCorePipeline が呼ばれる
      const opts: MemoryCoreServiceOptions = {
        logSink: makeLogSink(),
        trailDbPath: join(dir, 'trail.db'),
        dbPath: join(dir, 'memory-core.db'),
        statePath: join(dir, 'memory-core-runner.json'),
        // pipelineRunner は省略
      };
      const svc = new MemoryCoreService(opts);
      await svc.runOnce('manual');

      expect(mockRunMemoryCorePipeline).toHaveBeenCalledTimes(1);
    });
  });
});
