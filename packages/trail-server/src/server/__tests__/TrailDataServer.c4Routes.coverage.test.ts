
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

// ---------------------------------------------------------------------------
// Helper: create server + start
// ---------------------------------------------------------------------------

async function makeServer(): Promise<{ server: TrailDataServer; db: TrailDatabase; port: number }> {
  const db = await createTestTrailDatabase();
  const server = new TrailDataServer('/tmp', db, makeMockLogger());
  await server.start(0);
  const port = server.port;
  return { server, db, port };
}

// ---------------------------------------------------------------------------
// GET /api/c4/model
// ---------------------------------------------------------------------------

describe('GET /api/c4/model', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });

  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 204 when no model is available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/model`);
    expect(res.status).toBe(204);
  });

  it('returns 204 for a specific release that does not exist', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/model?release=v1.0.0`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/releases
// ---------------------------------------------------------------------------

describe('GET /api/c4/releases', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with releases array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/releases`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/dsm
// ---------------------------------------------------------------------------

describe('GET /api/c4/dsm', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 204 when no matrix is available (current)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/dsm`);
    expect(res.status).toBe(204);
  });

  it('returns 204 for specific release', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/dsm?release=v1.0.0`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/tree
// ---------------------------------------------------------------------------

describe('GET /api/c4/tree', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 204 when no model is available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/tree`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/coverage
// ---------------------------------------------------------------------------

describe('GET /api/c4/coverage', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with null matrices when no model available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/coverage`);
    expect(res.status).toBe(200);
    const body = await res.json() as { coverageMatrix: null; coverageDiff: null };
    expect(body.coverageMatrix).toBeNull();
    expect(body.coverageDiff).toBeNull();
  });

  it('returns 200 for specific release with no model', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/coverage?release=v1.0.0`);
    expect(res.status).toBe(200);
    const body = await res.json() as { coverageMatrix: null };
    expect(body.coverageMatrix).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/complexity
// ---------------------------------------------------------------------------

describe('GET /api/c4/complexity', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 when no model available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/complexity`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // complexityMatrix may be null or a populated object depending on DB state
    expect(typeof body).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/exports
// ---------------------------------------------------------------------------

describe('GET /api/c4/exports', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with empty symbols when model not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/exports?componentId=pkg_foo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { symbols: unknown[] };
    expect(Array.isArray(body.symbols)).toBe(true);
  });

  it('returns 200 with empty symbols when componentId is empty', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/exports`);
    expect(res.status).toBe(200);
    const body = await res.json() as { symbols: unknown[] };
    expect(Array.isArray(body.symbols)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/functions
// ---------------------------------------------------------------------------

describe('GET /api/c4/functions', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when elementId is empty', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/functions`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/elementId/i);
  });

  it('returns 200 with empty symbols when model not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/functions?elementId=pkg_foo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { symbols: unknown[] };
    expect(Array.isArray(body.symbols)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/flowchart
// ---------------------------------------------------------------------------

describe('GET /api/c4/flowchart', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with empty graph when model not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/flowchart?componentId=pkg_foo&symbolId=bar`);
    expect(res.status).toBe(200);
    const body = await res.json() as { graph: { nodes: unknown[]; edges: unknown[] } };
    expect(Array.isArray(body.graph.nodes)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/sequence
// ---------------------------------------------------------------------------

describe('GET /api/c4/sequence', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when elementId is empty', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/sequence`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/elementId/i);
  });

  it('returns 200 with empty model when model not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/sequence?elementId=pkg_foo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { participants: unknown[] };
    expect(Array.isArray(body.participants)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/call-hierarchy
// ---------------------------------------------------------------------------

describe('GET /api/c4/call-hierarchy', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when file and fn are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/call-hierarchy`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/file and fn/i);
  });

  it('returns 400 for invalid direction', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/call-hierarchy?file=foo.ts&fn=bar&direction=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/direction/i);
  });

  it('returns 400 for invalid scope', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/call-hierarchy?file=foo.ts&fn=bar&direction=callees&scope=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/scope/i);
  });

  it('returns 503 when graph not available', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/call-hierarchy?file=foo.ts&fn=bar&direction=callees`);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/graph not available/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/file-analysis
// ---------------------------------------------------------------------------

describe('GET /api/c4/file-analysis', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when repo is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/repo/i);
  });

  it('returns 200 with empty entries when repo provided', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=test-repo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it('returns 200 for specific tag', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=test-repo&tag=v1.0.0`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/function-analysis
// ---------------------------------------------------------------------------

describe('GET /api/c4/function-analysis', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    mockedFetchC4Model.mockResolvedValue(null);
    ({ server, db, port } = await makeServer());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when repo is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/repo/i);
  });

  it('returns 200 with empty entries when repo provided (current)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=test-repo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it('returns 200 for specific tag', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=test-repo&tag=v1.0.0`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/doc-links
// ---------------------------------------------------------------------------

describe('GET /api/c4/doc-links', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with doc links array', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/doc-links`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/communities
// ---------------------------------------------------------------------------

describe('GET /api/c4/communities', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with communities', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/communities?repo=test-repo`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/c4/manual-elements, /api/c4/manual-relationships, /api/c4/manual-groups
// ---------------------------------------------------------------------------

describe('GET /api/c4/manual-elements and related', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('GET /api/c4/manual-relationships returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-relationships?repo=test-repo`);
    expect([200, 400]).toContain(res.status);
  });

  it('GET /api/c4/manual-groups returns 200 or 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/manual-groups?repo=test-repo`);
    expect([200, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trace/list
// ---------------------------------------------------------------------------

describe('GET /api/trace/list', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with empty array when trace dir does not exist', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/list`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trace/file
// ---------------------------------------------------------------------------

describe('GET /api/trace/file', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 when name is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/file`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid file name/i);
  });

  it('returns 400 for path traversal attempt', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/file?name=../etc/passwd.json`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-json file', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/file?name=foo.txt`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when trace file does not exist', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/file?name=nonexistent.json`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/hotspot
// ---------------------------------------------------------------------------

describe('GET /api/hotspot', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 400 for invalid period', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?period=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/period/i);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?granularity=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/granularity/i);
  });

  it('returns 200 with hotspot data for valid params', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?period=7d&granularity=commit`);
    expect(res.status).toBe(200);
    const body = await res.json() as { period: string; files: unknown[] };
    expect(body.period).toBe('7d');
    expect(Array.isArray(body.files)).toBe(true);
  });

  it('returns 200 for period=all', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?period=all`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for session granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?granularity=session`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/defect-risk
// ---------------------------------------------------------------------------

describe('GET /api/defect-risk', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200 with defect risk data', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/defect-risk`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[]; windowDays: number };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.windowDays).toBe('number');
  });

  it('returns 200 with custom window and halfLife', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/defect-risk?windowDays=30&halfLifeDays=45`);
    expect(res.status).toBe(200);
    const body = await res.json() as { windowDays: number; halfLifeDays: number };
    expect(body.windowDays).toBe(30);
    expect(body.halfLifeDays).toBe(45);
  });

  it('returns 200 with repo filter', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/defect-risk?repo=test-repo`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/docs-index
// ---------------------------------------------------------------------------

describe('GET /api/docs-index', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/docs-index`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/code-graph
// ---------------------------------------------------------------------------

describe('GET /api/code-graph', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 200, 204 or 404 for current release', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph`);
    expect([200, 204, 404]).toContain(res.status);
  });

  it('returns 200, 204 or 404 for specific repo', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph?repo=test-repo`);
    expect([200, 204, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/code-graph/query
// ---------------------------------------------------------------------------

describe('GET /api/code-graph/query', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns valid status for query', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/query?q=test`);
    expect([200, 400, 204, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/code-graph/explain
// ---------------------------------------------------------------------------

describe('GET /api/code-graph/explain', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns valid status for id query', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/explain?id=pkg_foo`);
    expect([200, 404, 204, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/code-graph/path
// ---------------------------------------------------------------------------

describe('GET /api/code-graph/path', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns valid response for path query', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/path?from=pkg_a&to=pkg_b`);
    expect([200, 404, 204, 400]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

describe('static file serving', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => { ({ server, db, port } = await makeServer()); });
  afterEach(async () => { await server.stop(); db.close(); });

  it('returns 404 for missing trailstandalone.js', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/trailstandalone.js`);
    expect(res.status).toBe(404);
  });
});
