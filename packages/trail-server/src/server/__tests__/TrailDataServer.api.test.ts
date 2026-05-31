
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { fetchC4Model } from '@anytime-markdown/trail-core/c4';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

describe('GET /api/trail/search', () => {
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

  it('returns 400 when q param is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/search`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Missing query parameter/i);
  });

  it('returns 400 when q param is empty string', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/search?q=`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with results array for valid query', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/search?q=hello`);
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
  });
});

describe('GET /api/trail/analytics', () => {
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

  it('returns 200 with analytics data', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/analytics`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body).toBe('object');
  });
});

describe('GET /api/trail/cost-optimization', () => {
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

  it('returns 200 with cost optimization data', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/cost-optimization`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body).toBe('object');
  });
});

describe('GET /api/trail/combined', () => {
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

  it('returns 200 with combined data (default period)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/combined`);
    expect(res.status).toBe(200);
  });

  it('returns 200 with combined data (week period)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/combined?period=week&rangeDays=90`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/trail/quality-metrics', () => {
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

  it('returns 400 when from and to params are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/quality-metrics`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/from and to/i);
  });

  it('returns 400 when to is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/quality-metrics?from=2026-01-01T00:00:00.000Z`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with quality metrics data when from and to are provided', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/quality-metrics?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/trail/deployment-frequency', () => {
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

  it('returns 400 when from and to are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with time series data when params are valid', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('accepts week bucket', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency?from=${from}&to=${to}&bucket=week`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/trail/deployment-frequency-quality', () => {
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

  it('returns 400 when from and to are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with result data when valid params given', async () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-12-31T23:59:59.000Z';
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/deployment-frequency-quality?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/temporal-coupling', () => {
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

  it('returns 400 when repo param is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/repo/i);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test&granularity=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/granularity/i);
  });

  it('returns 200 with edges for valid repo', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test-repo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { edges: unknown[]; granularity: string };
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.granularity).toBe('commit');
  });

  it('returns 200 with directional edges', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/temporal-coupling?repo=test&directional=true`);
    expect(res.status).toBe(200);
    const body = await res.json() as { directional: boolean };
    expect(body.directional).toBe(true);
  });
});

describe('POST /api/trail/token-budget', () => {
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

  it('returns 400 when sessionId is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when sessionId is invalid', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '../../etc/passwd' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 with valid sessionId', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/token-budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'valid-session-123' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('POST /api/message-commits', () => {
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

  it('returns 400 when required fields are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageUuid: 'uuid-1' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 and stores message commit with all required fields', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageUuid: 'msg-uuid-001',
        sessionId: 'sess-001',
        commitHash: 'abc123def456',
        matchConfidence: 'realtime',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('HTTP rate limiting', () => {
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

  it('returns 429 after exceeding rate limit', async () => {
    // Rate limit is 60 req/sec. Send 61 rapid requests.
    const requests = Array.from({ length: 61 }, () =>
      fetch(`http://127.0.0.1:${port}/api/trail/sessions`),
    );
    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);
    expect(statuses).toContain(429);
  });
});

describe('404 for unknown routes', () => {
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

  it('returns 404 for unknown route', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/nonexistent/route`);
    expect(res.status).toBe(404);
  });
});

describe('GET / (standalone HTML)', () => {
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

  it('returns 200 HTML for root path', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const text = await res.text();
    expect(text).toContain('<html');
  });
});

describe('POST /api/analyze/* — handler not registered', () => {
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

  it('returns 503 when onAnalyzeCurrentCode is not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('returns 503 when onAnalyzeReleaseCode is not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('returns 503 when onAnalyzeAll is not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/all`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('GET /api/analyze/status returns inProgress null when idle', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as { inProgress: null };
    expect(body.inProgress).toBeNull();
  });
});

describe('POST /api/analyze/current — handler registered', () => {
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

  it('calls handler and returns result', async () => {
    server.onAnalyzeCurrentCode = jest.fn().mockResolvedValue({ ok: true });
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 409 when analysis already in progress', async () => {
    let resolveAnalysis!: () => void;
    const analysisPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveAnalysis = () => resolve({ ok: true });
    });
    server.onAnalyzeCurrentCode = jest.fn().mockReturnValue(analysisPromise);

    // fire-and-forget first request (keep it pending)
    void fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });

    // small wait to let the first request start
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(res2.status).toBe(409);

    resolveAnalysis();
  });
});

describe('GET /api/analyze-all/* — runner not registered', () => {
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

  it('returns 503 for pause when runner not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('returns 503 for resume when runner not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/resume`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('returns 503 for status when runner not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/status`);
    expect(res.status).toBe(503);
  });
});

describe('GET /api/logs — service not registered', () => {
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

  it('returns 503 for GET /api/logs when log service not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/logs`);
    expect(res.status).toBe(503);
  });

  it('returns 503 for POST /api/logs when log service not set', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/logs`, { method: 'POST' });
    expect(res.status).toBe(503);
  });
});

describe('GET /api/config/*', () => {
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

  it('returns commit categories', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config/commit-categories`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: Record<string, number>; categories: Record<string, string> };
    expect(typeof body.entries).toBe('object');
    expect(typeof body.categories).toBe('object');
  });

  it('returns tool categories', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config/tool-categories`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: Record<string, number>; categories: Record<string, string> };
    expect(typeof body.entries).toBe('object');
  });

  it('returns skill categories', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config/skill-categories`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: Record<string, number>; categories: Record<string, string> };
    expect(typeof body.entries).toBe('object');
  });
});

describe('TrailDataServer — server lifecycle', () => {
  it('isRunning is false before start', async () => {
    const db = await createTestTrailDatabase();
    const server = new TrailDataServer('/tmp', db, makeMockLogger());
    expect(server.isRunning).toBe(false);
    await server.start(0);
    expect(server.isRunning).toBe(true);
    await server.stop();
    expect(server.isRunning).toBe(false);
    db.close();
  });

  it('port returns non-zero after start', async () => {
    const db = await createTestTrailDatabase();
    const server = new TrailDataServer('/tmp', db, makeMockLogger());
    expect(server.port).toBe(0);
    await server.start(0);
    expect(server.port).toBeGreaterThan(0);
    await server.stop();
    db.close();
  });
});

describe('GET /api/config/commit-categories — configPaths override (gitRoot 非依存)', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = mkdtempSync(join(tmpdir(), 'trail-configpaths-'));
    // gitRoot とは無関係な場所にカスタム設定を置き、configPaths で直接指定する。
    const file = join(tmpDir, 'custom-commit-categories.json');
    writeFileSync(
      file,
      JSON.stringify({ entries: { zzcustom: { category: 2 } }, categories: { '2': 'CustomLabel' } }),
      'utf-8',
    );
    // gitRoot は渡さない (第4引数 undefined) → configPaths が効いていることを確認できる。
    server = new TrailDataServer('/tmp', db, makeMockLogger(), undefined, undefined, {
      configPaths: { commitCategories: file },
    });
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('configPaths.commitCategories のファイルから読む', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/config/commit-categories`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Record<string, number>; categories: Record<string, string> };
    expect(body.entries['zzcustom']).toBe(2);
    expect(body.categories['2']).toBe('CustomLabel');
  });
});

describe('GET /api/c4/tree — defaultRepoName 注入 (gitRoot basename 非依存)', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    // gitRoot の basename は 'wrong-repo' だが、defaultRepoName で 'injected-repo' を注入する。
    server = new TrailDataServer('/tmp', db, makeMockLogger(), '/tmp/wrong-repo', undefined, {
      defaultRepoName: 'injected-repo',
    });
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('fetchC4Model を gitRoot basename ではなく注入 defaultRepoName で呼ぶ', async () => {
    (fetchC4Model as jest.Mock).mockClear();
    (fetchC4Model as jest.Mock).mockResolvedValue(undefined);
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/tree`);
    expect(res.status).toBe(204);
    expect(fetchC4Model).toHaveBeenCalled();
    // 3 番目の引数 (repoName) が注入値であること。
    expect((fetchC4Model as jest.Mock).mock.calls[0][2]).toBe('injected-repo');
  });
});

describe('GET /api/trace/list — traceDir 注入 (gitRoot 非依存)', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = mkdtempSync(join(tmpdir(), 'trail-tracedir-'));
    // gitRoot とは無関係な trace dir を注入し、そこに trace ファイルを置く。
    const traceDir = join(tmpDir, 'custom-trace');
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, 'sample.json'), JSON.stringify({ ok: true }), 'utf-8');
    server = new TrailDataServer('/tmp', db, makeMockLogger(), '/tmp/wrong-repo', undefined, { traceDir });
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('注入 traceDir のファイルを一覧する (gitRoot basename ではなく)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trace/list`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body.some((t) => t.name === 'sample.json')).toBe(true);
  });
});
