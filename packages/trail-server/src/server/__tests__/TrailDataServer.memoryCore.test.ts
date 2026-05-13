const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type {
  MemoryCoreService,
  MemoryCoreServiceStatus,
} from '@anytime-markdown/memory-core';

function makeStatus(overrides: Partial<MemoryCoreServiceStatus> = {}): MemoryCoreServiceStatus {
  return {
    schemaVersion: 1,
    paused: false,
    pausedAt: null,
    pausedBy: null,
    lastRunAt: null,
    lastDurationMs: null,
    lastReason: null,
    lastError: null,
    ticksRun: 0,
    ticksSkipped: 0,
    running: false,
    ...overrides,
  };
}

describe('/api/memory-core endpoints', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  describe('when no service is registered', () => {
    it('GET /api/memory-core/status → 503', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/status`);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toMatch(/not registered/);
    });

    it('POST /api/memory-core/pause → 503', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(503);
    });

    it('POST /api/memory-core/resume → 503', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/resume`, {
        method: 'POST',
      });
      expect(res.status).toBe(503);
    });
  });

  describe('when service is registered', () => {
    let pause: jest.Mock;
    let resume: jest.Mock;
    let getStatus: jest.Mock;
    let currentStatus: MemoryCoreServiceStatus;

    beforeEach(() => {
      currentStatus = makeStatus();
      pause = jest.fn(async (by: string) => {
        currentStatus = makeStatus({
          paused: true,
          pausedBy: by,
          pausedAt: '2026-05-13T12:00:00.000Z',
        });
        return currentStatus;
      });
      resume = jest.fn(async () => {
        currentStatus = makeStatus({ paused: false });
        return currentStatus;
      });
      getStatus = jest.fn(() => currentStatus);
      const svc = { pause, resume, getStatus } as unknown as MemoryCoreService;
      server.setMemoryCoreService(svc);
    });

    it('GET /api/memory-core/status → 200 + current status', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/status`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.paused).toBe(false);
      expect(body.schemaVersion).toBe(1);
      expect(getStatus).toHaveBeenCalled();
    });

    it('POST /api/memory-core/pause with body {by:"http-test"} → 200 and propagates by', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: 'http-test' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.paused).toBe(true);
      expect(body.pausedBy).toBe('http-test');
      expect(pause).toHaveBeenCalledWith('http-test');
    });

    it('POST /api/memory-core/pause with empty body → defaults to "http-api"', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/pause`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pausedBy).toBe('http-api');
    });

    it('POST /api/memory-core/resume → 200 and paused=false', async () => {
      await fetch(`http://127.0.0.1:${port}/api/memory-core/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: 'cli' }),
      });
      const res = await fetch(`http://127.0.0.1:${port}/api/memory-core/resume`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.paused).toBe(false);
      expect(resume).toHaveBeenCalled();
    });
  });
});
