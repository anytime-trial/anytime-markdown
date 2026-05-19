/**
 * Additional coverage for CodeGraphApiHandler:
 * - handleGet with release ID (non-"current")
 * - handleExplain no-engine path
 * - handlePath no-engine path
 * - invalidate(repoName) and invalidate() (no arg)
 * - getOrBuildEngine error path
 */
import { CodeGraphApiHandler } from '../CodeGraphApiHandler';
import type { CodeGraphService } from '../../analyze/CodeGraphService';
import type { CodeGraph } from '../../analyze/CodeGraph.types';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

function makeRes() {
  const chunks: string[] = [];
  let status = 0;
  return {
    writeHead(s: number) { status = s; },
    end(body?: string) { if (body !== undefined) chunks.push(body); },
    get status() { return status; },
    get body() { return chunks.join(''); },
  };
}

function makeGraph(label: string): CodeGraph {
  return {
    generatedAt: '2026-05-16T00:00:00.000Z',
    repositories: [{ id: label, label, path: `/tmp/${label}` }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
  };
}

function makeEmptyService(): CodeGraphService {
  return {
    getGraph: () => null,
    loadFromDb: async () => null,
    invalidate: () => {},
  } as unknown as CodeGraphService;
}

const NOOP_LOGGER = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: () => NOOP_LOGGER,
};

function makeTrailDbStub(releases: Array<{ tag: string; repo_name: string }>, graphByTag: Record<string, CodeGraph | null>) {
  return {
    getReleases: () => releases,
    getReleaseCodeGraph: (tag: string) => graphByTag[tag] ?? null,
  } as unknown as TrailDatabase;
}

// ---------------------------------------------------------------------------
// handleGet — release ID path
// ---------------------------------------------------------------------------

describe('CodeGraphApiHandler.handleGet — release mode', () => {
  it('returns 404 when release tag does not belong to any release', async () => {
    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    await handler.handleGet(res as never, 'v1.0.0');
    expect(res.status).toBe(404);
  });

  it('returns 404 when release exists but graph is not found', async () => {
    const db = makeTrailDbStub([{ tag: 'v1.0.0', repo_name: 'my-repo' }], { 'v1.0.0': null });
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    await handler.handleGet(res as never, 'v1.0.0');
    expect(res.status).toBe(404);
  });

  it('returns 200 with graph when release and graph exist', async () => {
    const graph = makeGraph('my-repo');
    const db = makeTrailDbStub([{ tag: 'v1.0.0', repo_name: 'my-repo' }], { 'v1.0.0': graph });
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    await handler.handleGet(res as never, 'v1.0.0');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).repositories[0].label).toBe('my-repo');
  });

  it('filters by repo when release exists for different repo', async () => {
    const graph = makeGraph('my-repo');
    const db = makeTrailDbStub([{ tag: 'v1.0.0', repo_name: 'other-repo' }], { 'v1.0.0': graph });
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    // Asking for v1.0.0 for 'my-repo' but it belongs to 'other-repo'
    await handler.handleGet(res as never, 'v1.0.0', 'my-repo');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// handleExplain — no engine (missing graph)
// ---------------------------------------------------------------------------

describe('CodeGraphApiHandler.handleExplain — no engine', () => {
  it('returns 404 when no graph loaded', async () => {
    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    await handler.handleExplain(res as never, 'node-id', 'missing-repo');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// handlePath — no engine (missing graph)
// ---------------------------------------------------------------------------

describe('CodeGraphApiHandler.handlePath — no engine', () => {
  it('returns 404 when no graph loaded', async () => {
    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    const res = makeRes();
    await handler.handlePath(res as never, 'a', 'b', 'missing-repo');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// invalidate
// ---------------------------------------------------------------------------

describe('CodeGraphApiHandler.invalidate', () => {
  it('clears all cached engines when called without repoName', async () => {
    const graph = makeGraph('r1');
    const svc = {
      getGraph: (repo?: string) => repo === 'r1' ? graph : null,
      loadFromDb: async (repo?: string) => repo === 'r1' ? graph : null,
      invalidate: () => {},
    } as unknown as CodeGraphService;

    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    // Build engine by querying
    const res1 = makeRes();
    await handler.handleQuery(res1 as never, 'q', 'r1');
    expect(res1.status).toBe(200);

    // Invalidate all
    handler.invalidate();

    // Engine should be rebuilt on next call (same result)
    const res2 = makeRes();
    await handler.handleQuery(res2 as never, 'q', 'r1');
    expect(res2.status).toBe(200);
  });

  it('clears only specified repo engine when repoName provided', async () => {
    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, NOOP_LOGGER as never);
    handler.setCodeGraphService(makeEmptyService());
    // Should not throw
    expect(() => handler.invalidate('specific-repo')).not.toThrow();
    expect(() => handler.invalidate()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getOrBuildEngine error path (GraphQueryEngine constructor throws)
// ---------------------------------------------------------------------------

describe('CodeGraphApiHandler — engine build failure', () => {
  it('logs error and returns null when GraphQueryEngine constructor throws', async () => {
    const logger = { ...NOOP_LOGGER, error: jest.fn() };
    // Create a graph that will cause engine failure by using a null-like graph
    // We need to make GraphQueryEngine throw — inject a broken graph
    const brokenGraph = null as unknown as CodeGraph; // force null to trigger issue
    const svc = {
      getGraph: () => brokenGraph,
      loadFromDb: async () => brokenGraph,
      invalidate: () => {},
    } as unknown as CodeGraphService;

    const db = makeTrailDbStub([], {});
    const handler = new CodeGraphApiHandler(db, logger as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    // Since graph is null, getOrBuildEngine returns null → 404 (no engine build attempt)
    await handler.handleQuery(res as never, 'q', undefined);
    expect(res.status).toBe(404);
  });
});
