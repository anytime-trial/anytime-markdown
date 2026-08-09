
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
// GET /api/caravan/status
// ---------------------------------------------------------------------------

describe('GET /api/caravan/status', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with status data', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/drift/events
// ---------------------------------------------------------------------------

describe('GET /api/caravan/drift/events', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with events array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/drift/events`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with unresolvedOnly filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/drift/events?unresolvedOnly=true`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with severity filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/drift/events?severity=warn`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with limit param', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/drift/events?limit=10`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/drift/events/:id
// ---------------------------------------------------------------------------

describe('GET /api/caravan/drift/events/:id', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 or 404 for a drift event id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/drift/events/nonexistent-event`);
    expect([200, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/bugs/recurring
// ---------------------------------------------------------------------------

describe('GET /api/caravan/bugs/recurring', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with recurring bugs', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/recurring`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with pkg filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/recurring?pkg=trail-server`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with windowDays filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/recurring?windowDays=30`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with limit filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/recurring?limit=5`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/bugs/history
// ---------------------------------------------------------------------------

describe('GET /api/caravan/bugs/history', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with bug history', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with pkg filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/history?pkg=trail-server`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with filePath filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/history?filePath=src/foo.ts`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with category filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/history?category=logic`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/bugs/causal
// ---------------------------------------------------------------------------

describe('GET /api/caravan/bugs/causal', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when bugEntityId is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/causal`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bugEntityId/i);
  });

  it('returns 200 with causal info for a bugEntityId', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/bugs/causal?bugEntityId=some-entity-id`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/reviews/unaddressed
// ---------------------------------------------------------------------------

describe('GET /api/caravan/reviews/unaddressed', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with unaddressed findings', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/unaddressed`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with category filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/unaddressed?category=logic`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with severity filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/unaddressed?severity=error`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with daysSinceMin filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/unaddressed?daysSinceMin=7`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/reviews/history
// ---------------------------------------------------------------------------

describe('GET /api/caravan/reviews/history', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with review history', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with pkg filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/history?pkg=trail-server`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with targetFilePath filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/reviews/history?targetFilePath=src/foo.ts`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/pipeline/runs/by-day
// ---------------------------------------------------------------------------

describe('GET /api/caravan/pipeline/runs/by-day', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with pipeline run stats', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/runs/by-day`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with scope filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/runs/by-day?scope=test`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with since filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/runs/by-day?since=2026-01-01T00:00:00.000Z`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/pipeline/failed
// ---------------------------------------------------------------------------

describe('GET /api/caravan/pipeline/failed', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with failed items', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/failed`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with scope filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/failed?scope=test`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with limit filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/pipeline/failed?limit=5`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/caravan/edges/invalidations
// ---------------------------------------------------------------------------

describe('GET /api/caravan/edges/invalidations', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with invalidations', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/edges/invalidations`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeDefined();
  });

  it('returns 200 with since filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/edges/invalidations?since=2026-01-01T00:00:00.000Z`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with limit filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/caravan/edges/invalidations?limit=10`);
    expect(res.status).toBe(200);
  });
});
