
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
import { fetchC4Model } from '@anytime-markdown/trail-core/c4';

const mockedFetchC4Model = fetchC4Model as jest.MockedFunction<typeof fetchC4Model>;

async function makeServer(): Promise<{ server: TrailDataServer; db: TrailDatabase; port: number }> {
  const db = await createTestTrailDatabase();
  const server = new TrailDataServer('/tmp', db, makeMockLogger());
  await server.start(0);
  const port = server.port;
  return { server, db, port };
}

// ---------------------------------------------------------------------------
// GET /api/activity-heatmap
// ---------------------------------------------------------------------------

describe('GET /api/activity-heatmap', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 for invalid period', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=invalid&mode=session-file`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/period/i);
  });

  it('returns 400 for invalid mode', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=30d&mode=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/mode/i);
  });

  it('returns 200 for valid session-file mode', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=30d&mode=session-file`);
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string; mode: string; rows: unknown[] };
    expect(body.period).toBe('30d');
    expect(body.mode).toBe('session-file');
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('returns 200 for subagent-file mode', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=7d&mode=subagent-file`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for period=all', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=all&mode=session-file`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/activity-trend
// ---------------------------------------------------------------------------

describe('GET /api/activity-trend', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when elementId is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/elementId/i);
  });

  it('returns 400 for invalid elementId format', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?elementId=invalid`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid period', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?elementId=pkg_test&period=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/period/i);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?elementId=pkg_test&granularity=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/granularity/i);
  });

  it('returns 400 for invalid sessionMode', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?elementId=pkg_test&sessionMode=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/sessionMode/i);
  });

  it('returns 503 when c4 model not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?elementId=pkg_test`);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/c4 model/i);
  });
});

// ---------------------------------------------------------------------------
// temporal coupling with additional params
// ---------------------------------------------------------------------------

describe('GET /api/temporal-coupling — additional params', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 for session granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test&granularity=session`);
    expect(res.status).toBe(200);
    const body = await res.json() as { granularity: string };
    expect(body.granularity).toBe('session');
  });

  it('returns 200 for subagentType granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test&granularity=subagentType`);
    expect(res.status).toBe(200);
    const body = await res.json() as { granularity: string };
    expect(body.granularity).toBe('subagentType');
  });

  it('returns 200 with threshold and minChange params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test&threshold=0.7&minChange=3`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/c4/communities/upsert-mappings and upsert-summaries
// ---------------------------------------------------------------------------

describe('POST /api/c4/communities/upsert-*', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('POST /api/c4/communities/upsert-mappings returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/communities/upsert-mappings?repo=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: [] }),
    });
    expect([200, 400]).toContain(res.status);
  });

  it('POST /api/c4/communities/upsert-summaries returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/communities/upsert-summaries?repo=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaries: [] }),
    });
    expect([200, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST /api/c4/manual-elements and related
// ---------------------------------------------------------------------------

describe('POST/PATCH/DELETE /api/c4/manual-elements', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('POST /api/c4/manual-elements returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements?repo=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'TestEl', type: 'container' }),
    });
    expect([200, 400]).toContain(res.status);
  });

  it('DELETE /api/c4/manual-elements/:id returns 200, 400, or 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-elements/nonexistent?repo=test-repo`, {
      method: 'DELETE',
    });
    expect([200, 400, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST/DELETE /api/c4/manual-relationships
// ---------------------------------------------------------------------------

describe('POST/DELETE /api/c4/manual-relationships', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('POST /api/c4/manual-relationships returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-relationships?repo=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId: 'el1', toId: 'el2', label: 'uses' }),
    });
    expect([200, 400]).toContain(res.status);
  });

  it('DELETE /api/c4/manual-relationships/:id returns 200, 400, or 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-relationships/nonexistent?repo=test-repo`, {
      method: 'DELETE',
    });
    expect([200, 400, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST/PATCH/DELETE /api/c4/manual-groups
// ---------------------------------------------------------------------------

describe('POST/PATCH/DELETE /api/c4/manual-groups', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('POST /api/c4/manual-groups returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-groups?repo=test-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MyGroup' }),
    });
    expect([200, 400]).toContain(res.status);
  });

  it('DELETE /api/c4/manual-groups/:id returns 200, 400, or 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-groups/nonexistent?repo=test-repo`, {
      method: 'DELETE',
    });
    expect([200, 400, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// CORS header handling
// ---------------------------------------------------------------------------

describe('CORS header handling', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('sets Access-Control-Allow-Origin for localhost origin', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/analytics`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('does not set ACAO for non-localhost origin', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/analytics`, {
      headers: { Origin: 'https://example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// notify* public methods (smoke tests — no HTTP, just API)
// ---------------------------------------------------------------------------

describe('TrailDataServer — notify methods (smoke)', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('notifySessionsUpdated does not throw', () => {
    expect(() => server.notifySessionsUpdated()).not.toThrow();
  });

  it('notifyProgress does not throw', () => {
    expect(() => server.notifyProgress('building', 50)).not.toThrow();
  });

  it('notifyCodeGraphUpdated does not throw', () => {
    expect(() => server.notifyCodeGraphUpdated()).not.toThrow();
  });

  it('notifyCodeGraphProgress does not throw', () => {
    expect(() => server.notifyCodeGraphProgress('indexing', 75)).not.toThrow();
  });

  it('notify model-updated does not throw', () => {
    expect(() => server.notify('model-updated')).not.toThrow();
  });

  it('notify dsm-updated with no provider does not throw', () => {
    expect(() => server.notify('dsm-updated')).not.toThrow();
  });

  it('notifyClaudeActivity does not throw', () => {
    expect(() => server.notifyClaudeActivity([], [], [])).not.toThrow();
  });

  it('notifyMultiAgentActivity does not throw', () => {
    expect(() => server.notifyMultiAgentActivity([], [])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// decodePathParam helper
// ---------------------------------------------------------------------------

describe('decodePathParam', () => {
  it('decodes percent-encoded path params', async () => {
    const { decodePathParam } = await import('../TrailDataServer');
    expect(decodePathParam('/api/memory/drift/events/drift%3Aentity%3Apkg', '/api/memory/drift/events/')).toBe('drift:entity:pkg');
  });

  it('handles suffix stripping', async () => {
    const { decodePathParam } = await import('../TrailDataServer');
    const result = decodePathParam('/api/memory/drift/events/my-id/resolve', '/api/memory/drift/events/', '/resolve');
    expect(result).toBe('my-id');
  });
});

// ---------------------------------------------------------------------------
// setTokenBudgetConfig + setC4Provider
// ---------------------------------------------------------------------------

describe('TrailDataServer — configuration methods', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('setTokenBudgetConfig does not throw', () => {
    expect(() => {
      server.setTokenBudgetConfig({ dailyLimitTokens: 100000, sessionLimitTokens: 10000, alertThresholdPct: 80 });
    }).not.toThrow();
  });

  it('setC4Provider does not throw', () => {
    expect(() => {
      server.setC4Provider(() => undefined);
    }).not.toThrow();
  });

  it('clientCount returns 0 with no clients', () => {
    expect(server.clientCount).toBe(0);
  });
});
