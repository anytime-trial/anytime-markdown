
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

// MemoryApiHandler を mock してルーティングのみをテストする
// (TrailDataServer が /tmp の nativeBinding を渡すと better-sqlite3 が解決失敗するため)
jest.mock('../MemoryApiHandler', () => {
  const mockHandler = {
    handleStatus: jest.fn().mockResolvedValue({ exists: true }),
    listDriftEvents: jest.fn().mockResolvedValue([{ id: 'drift-1', resolvedAt: null }]),
    getDriftEventDetail: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'known-id') return { id: 'known-id', detailJson: { x: 1 } };
      return null;
    }),
    resolveDriftEvent: jest.fn().mockResolvedValue({ ok: true }),
    listRecurringBugs: jest.fn().mockResolvedValue([]),
    getBugHistory: jest.fn().mockResolvedValue([{ commitSha: 'abc' }]),
    getBugCausalInfo: jest.fn().mockResolvedValue({ bugEntityId: 'ent-1' }),
    listUnaddressedReviewFindings: jest.fn().mockResolvedValue([{ id: 'rf-1' }]),
    getReviewHistory: jest.fn().mockResolvedValue([{ id: 'rf-1' }]),
    listPipelineRunStatsByDay: jest.fn().mockResolvedValue([{ day: '2026-05-01', worstStatus: 'success' }]),
    listFailedItems: jest.fn().mockResolvedValue([{ itemKey: 'item-1' }]),
    listTopEntities: jest.fn().mockResolvedValue([{ id: 'ent-1' }]),
    listInvalidations: jest.fn().mockResolvedValue([{ id: 'inv-1', reason: 'superseded' }]),
    dispose: jest.fn(),
  };
  return {
    MemoryApiHandler: jest.fn().mockImplementation(() => mockHandler),
  };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

describe('Memory API HTTP endpoints via TrailDataServer (routing tests)', () => {
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    trailDb = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', trailDb, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    trailDb.close();
  });

  it('GET /api/memory/status returns 200 with exists field', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as { exists: boolean };
    expect(typeof body.exists).toBe('boolean');
  });

  it('GET /api/memory/drift/events returns 200 with array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/drift/events with query params passes them to handler', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events?severity=error&driftType=spec_vs_code&unresolvedOnly=true&limit=10`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/drift/events/:id returns 200 for known id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/known-id`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe('known-id');
  });

  it('GET /api/memory/drift/events/:id returns 404 for unknown id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/unknown-event`);
    expect(res.status).toBe(404);
  });

  it('POST /api/memory/drift/events/:id/resolve returns 200 with ok:true', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/drift-1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote: 'test note' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('POST /api/memory/drift/events/:id/resolve with no body still works (empty note)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/drift-1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/bugs/recurring returns 200 with array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/recurring`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/bugs/recurring supports windowDays param', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/recurring?windowDays=30&limit=5`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/bugs/history returns 200 with bug history', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ commitSha: string }>;
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/bugs/causal returns 400 when bugEntityId missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/causal`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/bugEntityId/i);
  });

  it('GET /api/memory/bugs/causal returns 200 with causal info when bugEntityId provided', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/causal?bugEntityId=ent-1`);
    expect(res.status).toBe(200);
    const body = await res.json() as { bugEntityId: string } | null;
    expect(body).not.toBeNull();
  });

  it('GET /api/memory/reviews/unaddressed returns 200 with findings', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/unaddressed`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/reviews/unaddressed supports filter params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/unaddressed?severity=error&category=logic&daysSinceMin=7&limit=20`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/reviews/history returns 200 with review history', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/reviews/history supports targetFilePath param', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/history?targetFilePath=src/foo.ts&limit=10`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/pipeline/runs/by-day returns 200 with pipeline stats', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/pipeline/runs/by-day`);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ day: string; worstStatus: string }>;
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/pipeline/runs/by-day supports scope and since params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/pipeline/runs/by-day?scope=drift&since=2026-01-01T00:00:00.000Z`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/pipeline/failed returns 200 with failed items', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/pipeline/failed`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/entities/top returns 200 with entities', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/entities/top`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/memory/entities/top supports type and limit params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/entities/top?type=Package&limit=5`);
    expect(res.status).toBe(200);
  });

  it('GET /api/memory/edges/invalidations returns 200 with invalidations', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/edges/invalidations`);
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; reason: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]?.id).toBe('inv-1');
    expect(body[0]?.reason).toBe('superseded');
  });

  it('GET /api/memory/edges/invalidations supports since and limit params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/edges/invalidations?since=2026-01-01T00:00:00.000Z&limit=10`);
    expect(res.status).toBe(200);
  });
});
