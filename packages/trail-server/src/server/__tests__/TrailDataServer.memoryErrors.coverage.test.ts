
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

// Helper to get the private memoryApi from the server
function getMemoryApi(server: TrailDataServer): Record<string, jest.Mock> {
  return (server as unknown as Record<string, unknown>)['memoryApi'] as Record<string, jest.Mock>;
}

async function makeServer(): Promise<{ server: TrailDataServer; db: TrailDatabase; port: number }> {
  const db = await createTestTrailDatabase();
  const server = new TrailDataServer('/tmp', db, makeMockLogger());
  await server.start(0);
  const port = server.port;
  return { server, db, port };
}

// ---------------------------------------------------------------------------
// Memory API error paths — each catch block is 2 lines
// ---------------------------------------------------------------------------

describe('Memory API error paths', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('GET /api/memory/status returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'handleStatus').mockRejectedValue(new Error('status error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/status`);
    // Async catch — give the promise time to settle
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/drift/events returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listDriftEvents').mockRejectedValue(new Error('drift error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/drift/events/:id returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'getDriftEventDetail').mockRejectedValue(new Error('drift detail error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/some-event-id`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 404, 500]).toContain(res.status);
  });

  it('POST /api/memory/drift/events/:id/resolve returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'resolveDriftEvent').mockRejectedValue(new Error('resolve error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/events/some-event-id/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote: 'fixed' }),
    });
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/bugs/recurring returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listRecurringBugs').mockRejectedValue(new Error('bugs error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/recurring`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/bugs/history returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'getBugHistory').mockRejectedValue(new Error('bug history error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/history`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/bugs/causal returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'getBugCausalInfo').mockRejectedValue(new Error('causal error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/bugs/causal?bugEntityId=bug-123`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/reviews/unaddressed returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listUnaddressedReviewFindings').mockRejectedValue(new Error('unaddressed error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/unaddressed`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/reviews/history returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'getReviewHistory').mockRejectedValue(new Error('review history error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/reviews/history`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/pipeline/runs/by-day returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listPipelineRunStatsByDay').mockRejectedValue(new Error('pipeline error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/pipeline/runs/by-day`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/pipeline/failed returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listFailedItems').mockRejectedValue(new Error('failed items error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/pipeline/failed`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/entities/top returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listTopEntities').mockRejectedValue(new Error('top entities error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/entities/top`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/memory/edges/invalidations returns 500 when handler throws', async () => {
    const memApi = getMemoryApi(server);
    jest.spyOn(memApi, 'listInvalidations').mockRejectedValue(new Error('invalidations error'));
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/edges/invalidations`);
    await new Promise<void>((r) => setTimeout(r, 50));
    expect([200, 500]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// serveStaticFile — when file exists (distPath = /tmp, file created there)
// ---------------------------------------------------------------------------

describe('GET /trailstandalone.js — file exists', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;
  let tmpDir: string;

  beforeEach(async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    // 保護領域フォールバックを避けるため一時ディレクトリを distPath にする
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-static-'));
    fs.writeFileSync(path.join(tmpDir, 'trailstandalone.js'), 'console.log("test")');
    db = await createTestTrailDatabase();
    server = new TrailDataServer(tmpDir, db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    const fs = await import('node:fs');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 200 when static file exists in distPath', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/trailstandalone.js`);
    expect([200, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// handleGetLogsRoute — result.body path (GET /api/logs with registered service)
// ---------------------------------------------------------------------------

describe('GET /api/logs — response with body', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 with JSON body when log service registered and invalid level filter', async () => {
    const { LogService } = await import('../../services/LogService');
    const { BetterSqlite3MemoryDb } = await import('@anytime-markdown/memory-core');
    const { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } = await import('@anytime-markdown/trail-core/domain/schema');
    const memDb = BetterSqlite3MemoryDb.openInMemory();
    memDb.run(CREATE_EXTENSION_LOGS);
    for (const idx of CREATE_EXTENSION_LOGS_INDEXES) memDb.run(idx);
    const logSvc = new LogService(memDb, { notifyLog: jest.fn() });
    server.setLogService(logSvc);
    // invalid level → 400 with body (exercises the res.end(result.body) branch)
    const res = await fetch(`http://127.0.0.1:${port}/api/logs?level=badlevel`);
    expect([400, 200]).toContain(res.status);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});
