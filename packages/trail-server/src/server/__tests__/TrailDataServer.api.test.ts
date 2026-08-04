
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

  it('passes workspace query param through to getCombinedData', async () => {
    const spy = jest.spyOn(db, 'getCombinedData');
    const res = await fetch(
      `http://127.0.0.1:${port}/api/trail/combined?period=day&rangeDays=30&workspace=anytime-markdown`,
    );
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('day', 30, 'anytime-markdown');
  });

  it('treats empty workspace param as no filter', async () => {
    const spy = jest.spyOn(db, 'getCombinedData');
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/combined?workspace=`);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('day', 30, undefined);
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

  // CSRF 対策: 永続書込 POST はクロスサイトの simple request（text/plain）を Content-Type ガードで拒否する。
  it('rejects a non-JSON Content-Type with 415', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/message-commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        messageUuid: 'msg-uuid-002',
        sessionId: 'sess-002',
        commitHash: 'deadbeef',
        matchConfidence: 'realtime',
      }),
    });
    expect(res.status).toBe(415);
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

// tags はここで落とすと「黙って全量洗い替え」になり、オンデマンド生成が既存キャッシュを
// 消す事故に化ける。ボディ → ハンドラ引数の受け渡しを固定する。
describe('POST /api/analyze/release — tags', () => {
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

  it('body の tags をハンドラへ渡す', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 1, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['v1.19.1', 'v1.19.0'] }),
    });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({ tags: ['v1.19.1', 'v1.19.0'] });
  });

  it('body 無しなら tags は undefined（＝全量洗い替え）', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 0, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({ tags: undefined });
  });

  it('tags が配列でなければ 400 で弾き、ハンドラを呼ばない', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 0, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: 'v1.19.1' }),
    });

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  // マージ前レビュー（Claude / Codex 双方が独立に指摘）: 壊れた JSON を空ボディと同一視すると
  // 「tags を送ったが壊れていた」要求が全量洗い替えとして実行され、既存グラフを全部消す。
  it('壊れた JSON ボディは 400 で弾き、全量洗い替えへ落とさない', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 0, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"tags": ["v1.19.1"',
    });

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('JSON オブジェクトでないボディ（配列・スカラ）も 400 で弾く', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 0, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    for (const body of ['["v1.19.1"]', '"v1.19.1"', 'null']) {
      const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(res.status).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('tags の要素に文字列以外・空文字が混ざれば 400 で弾く', async () => {
    const handler = jest.fn().mockResolvedValue({ releaseCount: 0, durationMs: 1 });
    server.onAnalyzeReleaseCode = handler;

    for (const tags of [['v1.19.1', 42], ['v1.19.1', '']]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/analyze/release`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      expect(res.status).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();
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

describe('GET /api/code-graph/releases', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  /** sql.js の生ハンドルへ直接投入する（公開 API に releases の書き込み口が無いため）。 */
  const rawRun = (sql: string, params: ReadonlyArray<unknown>): void => {
    (db as unknown as { db: { run: (s: string, p?: ReadonlyArray<unknown>) => void } }).db.run(sql, params);
  };

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    rawRun('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
      1, 'anytime-markdown', '2026-01-01T00:00:00.000Z',
    ]);
    // released_at 昇順と release_id 昇順が食い違う実データを再現する。
    rawRun('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
      'v1.15.0', '2026-07-17T21:46:09.000Z', 1,
    ]);
    rawRun('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
      'v1.14.0', '2026-07-17T07:38:41.000Z', 1,
    ]);
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('repo 指定で released_at 昇順のリリース一覧を返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/releases?repo=anytime-markdown`);
    expect(res.status).toBe(200);
    const body = await res.json() as { releases: Array<{ tag: string; releasedAt: string; hasGraph: boolean }> };
    expect(body.releases.map((r) => r.tag)).toEqual(['v1.14.0', 'v1.15.0']);
    expect(body.releases.every((r) => r.hasGraph === false)).toBe(true);
  });

  it('repo 省略時は全リポジトリを混ぜず空配列を返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/releases`);
    expect(res.status).toBe(200);
    const body = await res.json() as { releases: unknown[] };
    expect(body.releases).toEqual([]);
  });

  it('未知の repo は 200 と空配列を返す（グラフ描画を壊さない）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/releases?repo=unknown`);
    expect(res.status).toBe(200);
    const body = await res.json() as { releases: unknown[] };
    expect(body.releases).toEqual([]);
  });

  it('グラフ本体を応答に含めない', async () => {
    // 在庫が 0 件だと SELECT に graph_json を足しても応答に現れず、検知力が消える。
    // 実際に 1 本保存してから検査する。
    db.saveReleaseCodeGraph('v1.14.0', {
      generatedAt: '2026-07-17T07:38:41.000Z',
      repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
      nodes: [{
        id: 'r:a', label: 'a', repo: 'r', package: 'p', fileType: 'code',
        community: 0, communityLabel: 'c', x: 0, y: 0, size: 1,
      }],
      edges: [],
      communities: { 0: 'c' },
      godNodes: [],
    });
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph/releases?repo=anytime-markdown`);
    const body = await res.json() as { releases: Array<{ tag: string; hasGraph: boolean }> };
    expect(body.releases.find((r) => r.tag === 'v1.14.0')?.hasGraph).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('graph_json');
    expect(text).not.toContain('"nodes"');
  });
});

describe('Snapshot per Commit の API', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  const rawRun = (sql: string, params: ReadonlyArray<unknown>): void => {
    (db as unknown as { db: { run: (s: string, p?: ReadonlyArray<unknown>) => void } }).db.run(sql, params);
  };

  const graph = {
    generatedAt: '2026-08-04T00:00:00.000Z',
    repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
    nodes: [{
      id: 'r:a', label: 'a', repo: 'r', package: 'p', fileType: 'code' as const,
      community: 0, communityLabel: 'c', x: 0, y: 0, size: 1,
    }],
    edges: [],
    communities: { 0: 'c' },
    godNodes: [],
  };

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    rawRun('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
      1, 'anytime-markdown', '2026-01-01T00:00:00.000Z',
    ]);
    rawRun('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
      'v1.0.0', '2026-07-01T00:00:00.000Z', 1,
    ]);
    rawRun('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
      'v1.1.0', '2026-07-10T00:00:00.000Z', 1,
    ]);
    rawRun("INSERT OR IGNORE INTO sessions (id, start_time) VALUES ('s1', '2026-01-01T00:00:00.000Z')", []);
    rawRun(
      `INSERT OR IGNORE INTO session_commits
         (session_id, commit_hash, commit_message, author, committed_at, repo_id)
       VALUES ('s1', 'abc1234', 'work', 'a', '2026-07-05T00:00:00.000Z', 1)`,
      [],
    );
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('GET /api/code-graph?commit= はそのコミットのグラフを返す', async () => {
    db.saveCommitCodeGraph('abc1234', 'anytime-markdown', graph, 30);
    const res = await fetch(
      `http://127.0.0.1:${port}/api/code-graph?commit=abc1234&repo=anytime-markdown`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { nodes: Array<{ id: string }> };
    expect(body.nodes.map((n) => n.id)).toEqual(['r:a']);
  });

  it('未生成のコミットは 404 を返す', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/code-graph?commit=abc1234&repo=anytime-markdown`,
    );
    expect(res.status).toBe(404);
  });

  // repo 省略を「どれでもよい」と解釈すると別リポジトリのグラフを返し得る。
  it('commit 指定で repo 省略は 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph?commit=abc1234`);
    expect(res.status).toBe(400);
  });

  it('release と commit の同時指定は 400', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/code-graph?commit=abc1234&release=v1.0.0&repo=anytime-markdown`,
    );
    expect(res.status).toBe(400);
  });

  it('commit も release も無ければ従来どおり current を返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph`);
    // current のグラフは未生成なので 404。400 にはならない（既存の振る舞い）。
    expect(res.status).toBe(404);
  });

  it('GET /api/code-graph/commits は区間のコミットを在庫つきで返す', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/code-graph/commits?repo=anytime-markdown&to=v1.1.0&from=v1.0.0`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: Array<{ sha: string; hasGraph: boolean; subject: string }> };
    expect(body.commits.map((c) => c.sha)).toEqual(['abc1234']);
    expect(body.commits[0]?.hasGraph).toBe(false);
    expect(body.commits[0]?.subject).toBe('work');
  });

  it('GET /api/code-graph/commits はグラフ本体を含めない', async () => {
    db.saveCommitCodeGraph('abc1234', 'anytime-markdown', graph, 30);
    const res = await fetch(
      `http://127.0.0.1:${port}/api/code-graph/commits?repo=anytime-markdown&to=v1.1.0&from=v1.0.0`,
    );
    const body = await res.json() as { commits: Array<{ hasGraph: boolean }> };
    expect(body.commits[0]?.hasGraph).toBe(true);
    expect(JSON.stringify(body)).not.toContain('"nodes"');
  });

  it('GET /api/code-graph/commits は repo / to 欠落を 400 で断る', async () => {
    const noRepo = await fetch(`http://127.0.0.1:${port}/api/code-graph/commits?to=v1.1.0`);
    const noTo = await fetch(`http://127.0.0.1:${port}/api/code-graph/commits?repo=anytime-markdown`);
    expect(noRepo.status).toBe(400);
    expect(noTo.status).toBe(400);
  });

  it('POST /api/analyze/commit はハンドラ未登録なら 503', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: 'abc1234', repo: 'anytime-markdown' }),
    });
    expect(res.status).toBe(503);
  });

  it('POST /api/analyze/commit は sha / repo を必須にする', async () => {
    server.onAnalyzeCommitCode = async () => ({ sha: 'x', nodeCount: 0, edgeCount: 0, durationMs: 0 });
    for (const body of [{}, { sha: 'abc1234' }, { repo: 'anytime-markdown' }, { sha: '', repo: 'r' }]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/analyze/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
  });

  // sha は git へそのまま渡り worktree のパスにもなる。
  it('POST /api/analyze/commit は 16 進でない sha を断る', async () => {
    server.onAnalyzeCommitCode = async () => ({ sha: 'x', nodeCount: 0, edgeCount: 0, durationMs: 0 });
    for (const sha of ['--upload-pack=evil', '../../etc', 'HEAD', 'zzzzzzz']) {
      const res = await fetch(`http://127.0.0.1:${port}/api/analyze/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha, repo: 'anytime-markdown' }),
      });
      expect([sha, res.status]).toEqual([sha, 400]);
    }
  });

  it('POST /api/analyze/commit は登録済みハンドラへ sha と repo を渡す', async () => {
    const seen: Array<{ sha: string; repo: string }> = [];
    server.onAnalyzeCommitCode = async (req) => {
      seen.push(req);
      return { sha: req.sha, nodeCount: 1, edgeCount: 0, durationMs: 1 };
    };
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: 'abc1234', repo: 'anytime-markdown' }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ sha: 'abc1234', repo: 'anytime-markdown' }]);
  });
});

describe('GET /api/code-graph?release= のリポジトリ帰属', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  const rawRun = (sql: string, params: ReadonlyArray<unknown>): void => {
    (db as unknown as { db: { run: (s: string, p?: ReadonlyArray<unknown>) => void } }).db.run(sql, params);
  };

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    for (const [id, name] of [[1, 'repo-a'], [2, 'repo-b']] as Array<[number, string]>) {
      rawRun('INSERT OR IGNORE INTO repos (repo_id, repo_name, created_at) VALUES (?, ?, ?)', [
        id, name, '2026-01-01T00:00:00.000Z',
      ]);
      // タグは repo をまたいで衝突し得る（releases の一意制約は UNIQUE (repo_id, tag)）。
      rawRun('INSERT OR IGNORE INTO releases (tag, released_at, repo_id) VALUES (?, ?, ?)', [
        'v1.0.0', '2026-03-01T00:00:00.000Z', id,
      ]);
    }
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('repo 省略で release を指定したら 400 を返す（どのリポジトリか決まらない）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/code-graph?release=v1.0.0`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/repo is required/i);
  });

  it('同名タグでも指定した repo のグラフだけを返す', async () => {
    const nodeFor = (id: string) => ({
      id, label: id, repo: 'r', package: 'p', fileType: 'code' as const,
      community: 0, communityLabel: 'c', x: 0, y: 0, size: 1,
    });
    // repo-b 側にだけ在庫を作る。tag だけで解決すると repo-a の release_id を掴んで 404 になる。
    const bId = (db as unknown as { db: { exec: (s: string, p?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }> } })
      .db.exec('SELECT r.release_id FROM releases r JOIN repos p ON p.repo_id = r.repo_id WHERE p.repo_name = ?', ['repo-b']);
    expect(bId[0]?.values?.[0]?.[0]).toBeDefined();
    rawRun(
      `INSERT OR REPLACE INTO release_code_graphs (release_id, graph_json, generated_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [
        Number(bId[0].values[0][0]),
        JSON.stringify({
          generatedAt: '2026-03-01T00:00:00.000Z',
          repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
          nodes: [nodeFor('r:only-in-b')],
          edges: [],
          communities: {},
          godNodes: [],
        }),
        '2026-03-01T00:00:00.000Z',
        '2026-03-01T00:00:00.000Z',
      ],
    );

    const inB = await fetch(`http://127.0.0.1:${port}/api/code-graph?release=v1.0.0&repo=repo-b`);
    expect(inB.status).toBe(200);
    const graph = await inB.json() as { nodes: Array<{ id: string }> };
    expect(graph.nodes.map((n) => n.id)).toEqual(['r:only-in-b']);

    // repo-a には在庫が無い。tag だけで解決していると repo-b のグラフが漏れる。
    const inA = await fetch(`http://127.0.0.1:${port}/api/code-graph?release=v1.0.0&repo=repo-a`);
    expect(inA.status).toBe(404);
  });
});
