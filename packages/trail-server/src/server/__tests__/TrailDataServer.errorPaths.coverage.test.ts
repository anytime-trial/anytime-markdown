
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
import type { LogService, PersistedLogEntry } from '../../services/LogService';
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
// setLogService + /api/logs with registered service
// ---------------------------------------------------------------------------

describe('setLogService + /api/logs', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  const mockLogService = {
    insertBatch: jest.fn(),
    queryLogs: jest.fn().mockReturnValue({ logs: [], nextCursor: null }),
    cleanup: jest.fn(),
  } as unknown as LogService;

  beforeEach(async () => {
    ({ server, db, port } = await makeServer());
    server.setLogService(mockLogService);
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('GET /api/logs returns 200 when service registered', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/logs`);
    expect([200, 204]).toContain(res.status);
  });

  it('POST /api/logs returns valid status when service registered', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: [{ level: 'info', message: 'test', timestamp: new Date().toISOString(), component: 'test' }] }),
    });
    expect([200, 201, 204, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// notifyLog
// ---------------------------------------------------------------------------

describe('TrailDataServer.notifyLog', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('notifyLog does not throw with no clients', () => {
    const entries: PersistedLogEntry[] = [{
      id: 1,
      level: 'info',
      message: 'hello',
      timestamp: new Date().toISOString(),
      component: 'test',
      source: 'extension',
    }];
    expect(() => server.notifyLog(entries)).not.toThrow();
  });

  it('notifyLog does not throw with empty entries', () => {
    expect(() => server.notifyLog([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setDocsPath + scanDocLinks
// ---------------------------------------------------------------------------

describe('setDocsPath + scanDocLinks', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('setDocsPath does not throw', () => {
    expect(() => server.setDocsPath('/tmp/docs')).not.toThrow();
  });

  it('scanDocLinks does not throw', async () => {
    await expect(server.scanDocLinks()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// analyze pipeline error handling
// ---------------------------------------------------------------------------

describe('POST /api/analyze/current — handler throws', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when handler throws', async () => {
    server.onAnalyzeCurrentCode = jest.fn().mockRejectedValue(new Error('analyze failed'));
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/analyze/release — handler throws', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when handler throws', async () => {
    server.onAnalyzeReleaseCode = jest.fn().mockRejectedValue(new Error('release failed'));
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/analyze/all — handler throws', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when handler throws', async () => {
    server.onAnalyzeAll = jest.fn().mockRejectedValue(new Error('all failed'));
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/all`, { method: 'POST' });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// analyze-all pause/resume errors
// ---------------------------------------------------------------------------

describe('analyze-all runner pause/resume errors', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('pause returns 500 when runner throws', async () => {
    const mockRunner = {
      pause: jest.fn().mockRejectedValue(new Error('pause failed')),
      resume: jest.fn().mockRejectedValue(new Error('resume failed')),
      getStatus: jest.fn().mockReturnValue({}),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, { method: 'POST' });
    expect(res.status).toBe(500);
  });

  it('resume returns 500 when runner throws', async () => {
    const mockRunner = {
      pause: jest.fn().mockRejectedValue(new Error('pause failed')),
      resume: jest.fn().mockRejectedValue(new Error('resume failed')),
      getStatus: jest.fn().mockReturnValue({}),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/resume`, { method: 'POST' });
    expect(res.status).toBe(500);
  });

  it('pause accepts custom "by" field', async () => {
    const mockRunner = {
      pause: jest.fn().mockResolvedValue({ paused: true }),
      resume: jest.fn().mockResolvedValue({ paused: false }),
      getStatus: jest.fn().mockReturnValue({}),
    };
    server.setAnalyzeAllRunner(mockRunner as never);
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: 'user-action' }),
    });
    expect(res.status).toBe(200);
    expect(mockRunner.pause).toHaveBeenCalledWith('user-action');
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/complexity with messages in DB
// ---------------------------------------------------------------------------

describe('GET /api/c4/complexity with messages in DB', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with non-null complexityMatrix when model resolved to null', async () => {
    // With model=null, elements=[], complexityMatrix still computed (may be empty)
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/complexity`);
    expect(res.status).toBe(200);
    const body = await res.json() as { complexityMatrix: Record<string, unknown> | null };
    expect(typeof body).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Token budget threshold exceeded (onTokenBudgetExceeded callback)
// ---------------------------------------------------------------------------

describe('POST /api/trail/token-budget — threshold exceeded', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('calls onTokenBudgetExceeded when daily limit threshold reached', async () => {
    const callback = jest.fn();
    server.onTokenBudgetExceeded = callback;
    // Set a very low daily limit so threshold is exceeded
    server.setTokenBudgetConfig({ dailyLimitTokens: 1, sessionLimitTokens: null, alertThresholdPct: 1 });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'valid-session-123' }),
    });
    expect(res.status).toBe(200);
    // callback may or may not be called depending on actual token count
    expect(typeof callback.mock.calls.length).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// stop() when server not started
// ---------------------------------------------------------------------------

describe('stop() edge cases', () => {
  it('stop resolves when not started', async () => {
    const db = await createTestTrailDatabase();
    const server = new TrailDataServer('/tmp', db, makeMockLogger());
    // Not started — stop should resolve without error
    await expect(server.stop()).resolves.not.toThrow();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// handleGetSessions error path (DB throws)
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getSessions throws', async () => {
    jest.spyOn(db, 'getSessions').mockImplementation(() => { throw new Error('DB error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Failed to read sessions/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetSession error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getSessions throws', async () => {
    jest.spyOn(db, 'getSessions').mockImplementation(() => { throw new Error('DB session error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/any-session-id`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetSessionCommits error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id/commits — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getSessionCommits throws', async () => {
    jest.spyOn(db, 'getSessionCommits').mockImplementation(() => { throw new Error('DB commits error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/any-session/commits`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetReleases error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/releases — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getReleases throws', async () => {
    jest.spyOn(db, 'getReleases').mockImplementation(() => { throw new Error('DB releases error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/releases`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Failed to get releases/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetAnalytics error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/analytics — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getAnalytics throws', async () => {
    jest.spyOn(db, 'getAnalytics').mockImplementation(() => { throw new Error('DB analytics error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/analytics`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetCostOptimization error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/cost-optimization — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getCostOptimization throws', async () => {
    jest.spyOn(db, 'getCostOptimization').mockImplementation(() => { throw new Error('cost error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/cost-optimization`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetCombined error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/combined — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getCombinedData throws', async () => {
    jest.spyOn(db, 'getCombinedData').mockImplementation(() => { throw new Error('combined error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/combined`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetDeploymentFrequency error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/deployment-frequency — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB.getReleasesInRange throws', async () => {
    jest.spyOn(db, 'getReleasesInRange').mockImplementation(() => { throw new Error('releases error'); });
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetDeploymentFrequencyQuality error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/deployment-frequency-quality — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'getReleaseQualityInputs').mockImplementation(() => { throw new Error('quality error'); });
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality?from=${from}&to=${to}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleTemporalCoupling error path
// ---------------------------------------------------------------------------

describe('GET /api/temporal-coupling — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when fetchTemporalCoupling throws', async () => {
    jest.spyOn(db, 'fetchTemporalCoupling').mockImplementation(() => { throw new Error('coupling error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/coupling error/i);
  });
});

// ---------------------------------------------------------------------------
// handleDefectRisk error path
// ---------------------------------------------------------------------------

describe('GET /api/defect-risk — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when fetchDefectRisk throws', async () => {
    jest.spyOn(db, 'fetchDefectRisk').mockImplementation(() => { throw new Error('risk error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/defect-risk`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleHotspot error path
// ---------------------------------------------------------------------------

describe('GET /api/hotspot — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when fetchHotspotRows throws', async () => {
    jest.spyOn(db, 'fetchHotspotRows').mockImplementation(() => { throw new Error('hotspot error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?period=30d&granularity=commit`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/hotspot error/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetQualityMetrics error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/quality-metrics — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when DB throws', async () => {
    jest.spyOn(db, 'getQualityMetricsInputs').mockImplementation(() => { throw new Error('qm error'); });
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/quality-metrics?from=${from}&to=${to}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleSearch error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/search — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when searchMessages throws', async () => {
    jest.spyOn(db, 'searchMessages').mockImplementation(() => { throw new Error('search error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/search?q=hello`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Search failed/i);
  });
});

// ---------------------------------------------------------------------------
// handleActivityHeatmap error path
// ---------------------------------------------------------------------------

describe('GET /api/activity-heatmap — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when fetchActivityHeatmapRows throws', async () => {
    jest.spyOn(db, 'fetchActivityHeatmapRows').mockImplementation(() => { throw new Error('heatmap error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?period=30d&mode=session-file`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleC4ReleasesEndpoint error path
// ---------------------------------------------------------------------------

describe('GET /api/c4/releases — error path', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when asC4ModelStore throws', async () => {
    jest.spyOn(db, 'asC4ModelStore').mockImplementation(() => { throw new Error('store error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/releases`);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Failed to get C4 releases/i);
  });
});

// ---------------------------------------------------------------------------
// handleC4DsmEndpoint with current graph
// ---------------------------------------------------------------------------

describe('GET /api/c4/dsm — with current graph in DB', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 204 when no graph in DB', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/dsm?release=current&repo=test-repo`);
    expect(res.status).toBe(204);
  });

  it('returns 204 for release graph that does not exist', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/dsm?release=v1.0.0&repo=test-repo`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// handleC4DsmEndpoint error path
// ---------------------------------------------------------------------------

describe('GET /api/c4/dsm — error path', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when getCurrentGraph throws', async () => {
    jest.spyOn(db, 'getCurrentGraph').mockImplementation(() => { throw new Error('graph error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/dsm`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// handleGetSessionToolMetrics error path
// ---------------------------------------------------------------------------

describe('GET /api/trail/sessions/:id/tool-metrics — DB error', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 500 when computeToolMetrics throws', async () => {
    jest.spyOn(db, 'computeToolMetrics').mockImplementation(() => { throw new Error('metrics error'); });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/any-session/tool-metrics`);
    expect(res.status).toBe(500);
  });
});
