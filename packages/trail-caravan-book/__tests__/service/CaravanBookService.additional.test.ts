/**
 * CaravanBookService の追加テスト。
 *
 * 既存の src/service/__tests__/CaravanBookService.test.ts でカバーされていない
 * buildPipelineContext() / buildPipelineLogger() / defaultStatePath() を検証する。
 * openScopeSession() は openCaravanDbSession に fs 依存があるため、ここでは
 * モック経由で動線のみ確認する。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CaravanBookService, defaultStatePath } from '../../src/service/CaravanBookService';
import type { CaravanBookServiceOptions } from '../../src/service/types';

// openCaravanDbSession を mock する
jest.mock('../../src/service/openCaravanDbSession', () => ({
  openCaravanDbSession: jest.fn(),
}));

// defaultCaravanBookPipelineRunner を mock する (pipelineRunner 未指定経路)
jest.mock('../../src/service/defaultCaravanBookPipelineRunner', () => ({
  runCaravanBookPipeline: jest.fn(async () => undefined),
}));

import { openCaravanDbSession } from '../../src/service/openCaravanDbSession';
const mockOpenCaravanDbSession = openCaravanDbSession as jest.MockedFunction<typeof openCaravanDbSession>;

import { runCaravanBookPipeline } from '../../src/service/defaultCaravanBookPipelineRunner';
const mockRunCaravanBookPipeline = runCaravanBookPipeline as jest.MockedFunction<typeof runCaravanBookPipeline>;

function makeLogSink(): { lines: string[]; appendLine: (m: string) => void } {
  const lines: string[] = [];
  return { lines, appendLine: (m: string) => lines.push(m) };
}

function makeOpts(
  dir: string,
  overrides: Partial<CaravanBookServiceOptions> = {},
): CaravanBookServiceOptions {
  return {
    logSink: makeLogSink(),
    trailDbPath: join(dir, 'activity.db'),
    dbPath: join(dir, 'caravan-book.db'),
    statePath: join(dir, 'trail-caravan-book-runner.json'),
    pipelineRunner: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('CaravanBookService — additional coverage', () => {
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
      const svc = new CaravanBookService(opts);
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
      const svc = new CaravanBookService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.info('hello world');

      expect(logSink.lines.some((l) => l.includes('[INFO] hello world'))).toBe(true);
    });

    it('logger.error formats Error instance with stack', () => {
      const logSink = makeLogSink();
      const svc = new CaravanBookService(makeOpts(dir, { logSink }));
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
      const svc = new CaravanBookService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.error('fail msg', 'plain string error');

      const line = logSink.lines.find((l) => l.includes('[ERROR]'));
      expect(line).toBeDefined();
      expect(line).toContain('fail msg');
      expect(line).toContain('plain string error');
    });

    it('logger.error with no err argument omits trailing content', () => {
      const logSink = makeLogSink();
      const svc = new CaravanBookService(makeOpts(dir, { logSink }));
      const ctx = svc.buildPipelineContext();

      ctx.logger.error('bare error');

      const line = logSink.lines.find((l) => l.includes('[ERROR] bare error'));
      expect(line).toBeDefined();
      // no extra newline after 'bare error'
      expect(line?.endsWith('bare error')).toBe(true);
    });

    it('logger.error with Error that has no stack falls back to message', () => {
      const logSink = makeLogSink();
      const svc = new CaravanBookService(makeOpts(dir, { logSink }));
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
    it('delegates to openCaravanDbSession and returns its result', async () => {
      const mockSession = { close: jest.fn() } as unknown as import('../../src/service/CaravanDbSession').CaravanDbSession;
      mockOpenCaravanDbSession.mockResolvedValue(mockSession);

      const svc = new CaravanBookService(makeOpts(dir));
      const session = await svc.openScopeSession();

      expect(mockOpenCaravanDbSession).toHaveBeenCalledTimes(1);
      expect(session).toBe(mockSession);
    });

    it('returns null when openCaravanDbSession returns null (activity.db not found)', async () => {
      mockOpenCaravanDbSession.mockResolvedValue(null);

      const svc = new CaravanBookService(makeOpts(dir));
      const session = await svc.openScopeSession();

      expect(session).toBeNull();
    });

    it('passes the PipelineRunnerContext built from serviceOpts', async () => {
      mockOpenCaravanDbSession.mockResolvedValue(null);
      const opts = makeOpts(dir, { gitRoot: '/workspace', backfillDays: 7 });
      const svc = new CaravanBookService(opts);

      await svc.openScopeSession();

      const ctx = mockOpenCaravanDbSession.mock.calls[0]?.[0];
      expect(ctx?.gitRoot).toBe('/workspace');
      expect(ctx?.backfillDays).toBe(7);
    });
  });

  // ── defaultStatePath ───────────────────────────────────────────────────

  describe('defaultStatePath()', () => {
    it('returns a path ending with trail-caravan-book-runner.json', () => {
      process.env.TRAIL_HOME = dir;
      const p = defaultStatePath('/some/workspace');
      delete process.env.TRAIL_HOME;
      expect(p.endsWith('trail-caravan-book-runner.json')).toBe(true);
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
      expect(p).toContain('trail-caravan-book-runner.json');
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
      const svc = new CaravanBookService(opts);
      await svc.runOnce('manual');

      expect(pipelineRunner).toHaveBeenCalledTimes(1);
      const ctx = capturedCtxs[0] as Record<string, unknown>;
      expect(ctx.gitRoot).toBe('/my-repo');
      expect((ctx.llm as Record<string, unknown>)?.chatModel).toBe('my-model');
    });

    it('uses defaultPipelineRunner (defaultCaravanBookPipelineRunner) when pipelineRunner is not provided', async () => {
      // pipelineRunner を省略 → defaultPipelineRunner → runCaravanBookPipeline が呼ばれる
      const opts: CaravanBookServiceOptions = {
        logSink: makeLogSink(),
        trailDbPath: join(dir, 'activity.db'),
        dbPath: join(dir, 'caravan-book.db'),
        statePath: join(dir, 'trail-caravan-book-runner.json'),
        // pipelineRunner は省略
      };
      const svc = new CaravanBookService(opts);
      await svc.runOnce('manual');

      expect(mockRunCaravanBookPipeline).toHaveBeenCalledTimes(1);
    });
  });
});
