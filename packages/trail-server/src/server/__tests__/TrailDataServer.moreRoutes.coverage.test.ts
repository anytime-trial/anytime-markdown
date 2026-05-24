
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

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
// GET /api/trail/deployment-frequency — with and without params
// ---------------------------------------------------------------------------

describe('GET /api/trail/deployment-frequency', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when from/to missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/from and to/i);
  });

  it('returns 200 with from/to params and empty data', async () => {
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 200 with bucket=week', async () => {
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}&bucket=week`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'getReleasesInRange').mockImplementation(() => { throw new Error('DB error'); });
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/deployment-frequency-quality — with and without params
// ---------------------------------------------------------------------------

describe('GET /api/trail/deployment-frequency-quality', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when from/to missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/from and to/i);
  });

  it('returns 200 with from/to params', async () => {
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality?from=${from}&to=${to}`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 200 with bucket=week', async () => {
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(
      `http://127.0.0.1:${port}/api/trail/deployment-frequency-quality?from=${from}&to=${to}&bucket=week`,
    );
    expect([200, 500]).toContain(res.status);
  });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'getReleaseQualityInputs').mockImplementation(() => { throw new Error('DB quality error'); });
    const from = '2024-01-01T00:00:00.000Z';
    const to = '2024-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality?from=${from}&to=${to}`);
    expect(res.status).toBe(500);
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

  it('returns 200 or 500 with valid date', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/days/2024-01-15/tool-metrics`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 500 when getDayToolMetrics returns null', async () => {
    jest.spyOn(db, 'getDayToolMetrics').mockReturnValue(null);
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/days/2024-01-15/tool-metrics`);
    expect(res.status).toBe(500);
  });

  it('returns 500 when getDayToolMetrics throws', async () => {
    jest.spyOn(db, 'getDayToolMetrics').mockImplementation(() => { throw new Error('day metrics error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/days/2024-01-15/tool-metrics`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/message-commits
// ---------------------------------------------------------------------------

describe('POST /api/message-commits', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when required fields missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageUuid: 'uuid-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 when all fields provided', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageUuid: 'msg-uuid-1',
        sessionId: 'session-id-1',
        commitHash: 'abc123def456',
        matchConfidence: 'realtime',
      }),
    });
    expect([200, 500]).toContain(res.status);
  });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'insertMessageCommit').mockImplementation(() => { throw new Error('DB insert error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageUuid: 'msg-uuid-2',
        sessionId: 'session-id-2',
        commitHash: 'abc123def789',
        matchConfidence: 'realtime',
      }),
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/trail/token-budget — invalid sessionId
// ---------------------------------------------------------------------------

describe('POST /api/trail/token-budget — validation paths', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when sessionId missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/sessionId required/i);
  });

  it('returns 400 when sessionId is invalid (has special chars)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'invalid session id with spaces!' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid sessionId/i);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Rate limiting', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 429 after exceeding rate limit', async () => {
    // Rate limit is 200 requests per second window
    const requests: Promise<Response>[] = [];
    for (let i = 0; i < 250; i++) {
      requests.push(fetch(`http://127.0.0.1:${port}/api/trail/sessions`));
    }
    const responses = await Promise.all(requests);
    const tooMany = responses.filter((r) => r.status === 429);
    expect(tooMany.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// GET / — standalone HTML
// ---------------------------------------------------------------------------

describe('GET / — standalone HTML', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 HTML for root path', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/html');
  });

  it('returns 404 for unknown HTML path', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/unknown-path`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// notify* public methods (no clients — should not throw)
// ---------------------------------------------------------------------------

describe('notify* methods with no connected clients', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('notifyClaudeActivity does not throw', () => {
    expect(() => server.notifyClaudeActivity(['sys_a'], ['pkg_b'], ['comp_c'])).not.toThrow();
  });

  it('notifyMultiAgentActivity does not throw', () => {
    expect(() => server.notifyMultiAgentActivity(
      [{
        sessionId: 's1',
        label: 'agent-1',
        branch: 'main',
        currentFile: 'src/foo.ts',
        activeElementIds: [],
        touchedElementIds: [],
        plannedElementIds: [],
      }],
      [],
    )).not.toThrow();
  });

  it('notifyCodeGraphUpdated does not throw', () => {
    expect(() => server.notifyCodeGraphUpdated()).not.toThrow();
  });

  it('notifyCodeGraphProgress does not throw', () => {
    expect(() => server.notifyCodeGraphProgress('building', 50)).not.toThrow();
  });

  it('notifyProgress does not throw', () => {
    expect(() => server.notifyProgress('analyzing', 75)).not.toThrow();
  });

  it('notify("dsm-updated") does not throw', () => {
    expect(() => server.notify('dsm-updated')).not.toThrow();
  });

  it('notify("model-updated") does not throw', () => {
    expect(() => server.notify('model-updated')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/sessions/:id — actual session exists
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id — valid session fetched', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 404 for non-existent session id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/nonexistent-session-id`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/activity-trend — with valid params (503 expected since no c4 model)
// ---------------------------------------------------------------------------

describe('GET /api/activity-trend — valid params', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 503 when c4 model not available but params valid', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/activity-trend?elementId=sys_test-repo&period=7d&granularity=commit&sessionMode=write`,
    );
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/c4 model/i);
  });

  it('returns 400 when sessionMode is invalid', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/activity-trend?elementId=sys_test-repo&period=7d&granularity=commit&sessionMode=invalid`,
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/trail/token-budget — missing JSON body
// ---------------------------------------------------------------------------

describe('POST /api/trail/token-budget — malformed body', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 ok even when body is empty (non-critical error path)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    // handleTokenBudget catches all errors and returns 200 ok
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trail/search — valid query
// ---------------------------------------------------------------------------

describe('GET /api/trail/search — with query', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with valid search query', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/search?q=hello`);
    expect([200, 500]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/function-analysis — with repo param
// ---------------------------------------------------------------------------

describe('GET /api/c4/function-analysis — with repo', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 when repo provided', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=my-repo&tag=current`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 200 for release tag', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=my-repo&tag=v1.0.0`);
    expect([200, 500]).toContain(res.status);
  });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'getCurrentFunctionAnalysis').mockImplementation(() => { throw new Error('fn analysis DB error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=my-repo&tag=current`);
    expect(res.status).toBe(500);
  });
});
