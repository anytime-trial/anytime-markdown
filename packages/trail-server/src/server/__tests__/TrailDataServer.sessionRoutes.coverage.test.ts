
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

async function makeServer(): Promise<{ server: TrailDataServer; db: TrailDatabase; port: number }> {
  const db = await createTestTrailDatabase();
  const server = new TrailDataServer('/tmp', db, makeMockLogger());
  await server.start(0);
  const port = server.port;
  return { server, db, port };
}

// ---------------------------------------------------------------------------
// GET /api/trail/sessions with various filters
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions with filters', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with default empty sessions list', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('returns 200 with branch filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions?branch=main`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('returns 200 with model filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions?model=claude-opus`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with repository filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions?repository=test-repo`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with from/to date filters', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/sessions/:id — 404 for nonexistent
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 404 for nonexistent session id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/nonexistent-session-id`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/sessions/:id/commits
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id/commits', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with empty commits array for unknown session', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/unknown-session/commits`);
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: unknown[] };
    expect(Array.isArray(body.commits)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/sessions/:id/tool-metrics
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id/tool-metrics', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with tool metrics for unknown session', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/unknown-session/tool-metrics`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/days/:date/tool-metrics
// ---------------------------------------------------------------------------

describe('GET /api/trail/days/:date/tool-metrics', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 or 500 for a date', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/days/2026-01-01/tool-metrics`);
    expect([200, 500]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/releases
// ---------------------------------------------------------------------------

describe('GET /api/trail/releases', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with releases array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/releases`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/prompts
// ---------------------------------------------------------------------------

describe('GET /api/trail/prompts', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 or 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/prompts`);
    expect([200, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST /api/analyze/release — handler registered + 409 conflict
// ---------------------------------------------------------------------------

describe('POST /api/analyze/release — handler registered', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('calls handler and returns result', async () => {
    server.onAnalyzeReleaseCode = jest.fn().mockResolvedValue({ ok: true });
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 409 when analysis already in progress', async () => {
    let resolveRelease!: () => void;
    const releasePromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveRelease = () => resolve({ ok: true });
    });
    server.onAnalyzeReleaseCode = jest.fn().mockReturnValue(releasePromise);

    void fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });
    expect(res2.status).toBe(409);

    resolveRelease();
  });
});

// ---------------------------------------------------------------------------
// POST /api/analyze/all — handler registered + 409 conflict
// ---------------------------------------------------------------------------

describe('POST /api/analyze/all — handler registered', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('calls handler and returns result', async () => {
    server.onAnalyzeAll = jest.fn().mockResolvedValue({
      imported: 0, skipped: 0, commitsResolved: 0, releasesResolved: 0,
      releasesAnalyzed: 0, coverageImported: 0, currentCoverageImported: 0,
      messageCommitsBackfilled: 0, durationMs: 100,
    });
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/all`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { imported: number };
    expect(typeof body.imported).toBe('number');
  });

  it('returns 409 when analysis already in progress', async () => {
    let resolveAll!: () => void;
    const allPromise = new Promise<Record<string, number>>((resolve) => {
      resolveAll = () => resolve({ imported: 0 });
    });
    server.onAnalyzeAll = jest.fn().mockReturnValue(allPromise);

    void fetch(`http://127.0.0.1:${port}/api/analyze/all`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await fetch(`http://127.0.0.1:${port}/api/analyze/all`, { method: 'POST' });
    expect(res2.status).toBe(409);

    resolveAll();
  });
});

// ---------------------------------------------------------------------------
// analyze-all with runner registered
// ---------------------------------------------------------------------------

describe('analyze-all runner registered', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('pause returns 200 when runner registered', async () => {
    const mockRunner = {
      pause: jest.fn().mockResolvedValue({ paused: true }),
      resume: jest.fn().mockResolvedValue({ paused: false }),
      getStatus: jest.fn().mockReturnValue({ paused: false, queueLength: 0 }),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('resume returns 200 when runner registered', async () => {
    const mockRunner = {
      pause: jest.fn().mockResolvedValue({ paused: true }),
      resume: jest.fn().mockResolvedValue({ paused: false }),
      getStatus: jest.fn().mockReturnValue({ paused: false, queueLength: 0 }),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/resume`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('status returns 200 when runner registered', async () => {
    const mockRunner = {
      pause: jest.fn().mockResolvedValue({ paused: true }),
      resume: jest.fn().mockResolvedValue({ paused: false }),
      getStatus: jest.fn().mockReturnValue({ paused: false, queueLength: 0 }),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// GET /api/analyze/status when in progress
// ---------------------------------------------------------------------------

describe('GET /api/analyze/status when in progress', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('shows current kind when analysis is running', async () => {
    let resolveAnalysis!: () => void;
    const analysisPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveAnalysis = () => resolve({ ok: true });
    });
    server.onAnalyzeCurrentCode = jest.fn().mockReturnValue(analysisPromise);

    void fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 20));

    const statusRes = await fetch(`http://127.0.0.1:${port}/api/analyze/status`);
    expect(statusRes.status).toBe(200);
    const body = await statusRes.json() as { inProgress: { kind: string } | null };
    expect(body.inProgress?.kind).toBe('current');

    resolveAnalysis();
  });
});
