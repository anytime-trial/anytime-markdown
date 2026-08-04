jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import type { RouteDescriptor } from '../routing';
import { TrailDataServer } from '../TrailDataServer';

/**
 * ルート台帳のゴールデンマスター。
 *
 * `handleHttp` の if 連鎖をルートテーブルへ移した際、旧実装（コミット 926a6e8ca）の
 * 判定条件から機械抽出した 105 経路とこの一覧が完全一致することを確認して固定した。
 * 経路の追加・削除・メソッド変更はここを更新しないと通らない（無言の経路欠落を防ぐ）。
 */
const EXPECTED_ROUTES: RouteDescriptor[] = [
  { method: "*", kind: "exact", path: "/" },
  { method: "*", kind: "exact", path: "/trailstandalone.js" },
  { method: "*", kind: "exact", path: "/trailstandalone.js.map" },
  { method: "GET", kind: "exact", path: "/api/trail/sessions" },
  { method: "GET", kind: "exact", path: "/api/trail/search" },
  { method: "POST", kind: "exact", path: "/api/trail/refresh" },
  { method: "GET", kind: "exact", path: "/api/trail/prompts" },
  { method: "GET", kind: "exact", path: "/api/trail/analytics" },
  { method: "GET", kind: "exact", path: "/api/trail/cost-optimization" },
  { method: "GET", kind: "exact", path: "/api/trail/releases" },
  { method: "GET", kind: "exact", path: "/api/trail/combined" },
  { method: "GET", kind: "exact", path: "/api/trail/quality-metrics" },
  { method: "GET", kind: "exact", path: "/api/trail/deployment-frequency" },
  { method: "GET", kind: "exact", path: "/api/trail/deployment-frequency-quality" },
  { method: "GET", kind: "pattern", path: "^\\/api\\/trail\\/sessions\\/([^/]+)\\/commits$" },
  { method: "GET", kind: "pattern", path: "^\\/api\\/trail\\/sessions\\/([^/]+)\\/tool-metrics$" },
  { method: "GET", kind: "pattern", path: "^\\/api\\/trail\\/days\\/([^/]+)\\/tool-metrics$" },
  { method: "GET", kind: "pattern", path: "^\\/api\\/trail\\/sessions\\/([^/]+)$" },
  { method: "POST", kind: "exact", path: "/api/analyze/current" },
  { method: "POST", kind: "exact", path: "/api/analyze/release" },
  { method: "POST", kind: "exact", path: "/api/analyze/commit" },
  { method: "POST", kind: "exact", path: "/api/analyze/all" },
  { method: "GET", kind: "exact", path: "/api/analyze/status" },
  { method: "POST", kind: "exact", path: "/api/analyze-all/pause" },
  { method: "POST", kind: "exact", path: "/api/analyze-all/resume" },
  { method: "GET", kind: "exact", path: "/api/analyze-all/status" },
  { method: "POST", kind: "exact", path: "/api/trail/token-budget" },
  { method: "POST", kind: "exact", path: "/api/trail/safe-points" },
  { method: "GET", kind: "exact", path: "/api/trail/safe-points" },
  { method: "POST", kind: "exact", path: "/api/trail/emergency-log" },
  { method: "GET", kind: "exact", path: "/api/trail/emergency-log" },
  { method: "POST", kind: "exact", path: "/api/trail/flight-reviews" },
  { method: "GET", kind: "exact", path: "/api/trail/flight-reviews" },
  { method: "PATCH", kind: "pattern", path: "^\\/api\\/trail\\/flight-reviews\\/([^/]+)$" },
  { method: "POST", kind: "exact", path: "/api/trail/user-feedback" },
  { method: "GET", kind: "exact", path: "/api/trail/user-feedback" },
  { method: "POST", kind: "exact", path: "/api/trail/acceptance" },
  { method: "GET", kind: "exact", path: "/api/trail/acceptance" },
  { method: "GET", kind: "exact", path: "/api/trail/acceptance/miss-rate" },
  { method: "POST", kind: "exact", path: "/api/message-commits" },
  { method: "GET", kind: "exact", path: "/api/trail/emergency-state" },
  { method: "POST", kind: "exact", path: "/api/trail/emergency/kill-switch" },
  { method: "POST", kind: "exact", path: "/api/trail/emergency/release" },
  { method: "POST", kind: "exact", path: "/api/trail/emergency/rollback" },
  { method: "POST", kind: "exact", path: "/api/logs" },
  { method: "GET", kind: "exact", path: "/api/logs" },
  { method: "GET", kind: "exact", path: "/api/trace/list" },
  { method: "GET", kind: "exact", path: "/api/trace/file" },
  { method: "GET", kind: "exact", path: "/api/config/commit-categories" },
  { method: "GET", kind: "exact", path: "/api/config/tool-categories" },
  { method: "GET", kind: "exact", path: "/api/config/skill-categories" },
  { method: "GET", kind: "exact", path: "/api/c4/releases" },
  { method: "GET", kind: "exact", path: "/api/c4/model" },
  { method: "GET", kind: "exact", path: "/api/c4/communities" },
  { method: "GET", kind: "exact", path: "/api/c4/dsm" },
  { method: "GET", kind: "exact", path: "/api/c4/tree" },
  { method: "GET", kind: "exact", path: "/api/c4/doc-links" },
  { method: "GET", kind: "exact", path: "/api/docs-index" },
  { method: "GET", kind: "exact", path: "/api/c4/coverage" },
  { method: "GET", kind: "exact", path: "/api/c4/file-analysis" },
  { method: "GET", kind: "exact", path: "/api/c4/function-analysis" },
  { method: "GET", kind: "exact", path: "/api/c4/complexity" },
  { method: "GET", kind: "exact", path: "/api/c4/exports" },
  { method: "GET", kind: "exact", path: "/api/c4/functions" },
  { method: "GET", kind: "exact", path: "/api/c4/flowchart" },
  { method: "GET", kind: "exact", path: "/api/c4/sequence" },
  { method: "GET", kind: "exact", path: "/api/c4/function-graph" },
  { method: "GET", kind: "exact", path: "/api/c4/call-hierarchy" },
  { method: "POST", kind: "exact", path: "/api/c4/communities/upsert-summaries" },
  { method: "POST", kind: "exact", path: "/api/c4/communities/upsert-mappings" },
  { method: "POST", kind: "exact", path: "/api/c4/manual-elements" },
  { method: "PATCH", kind: "pattern", path: "^\\/api\\/c4\\/manual-elements\\/([^/]+)$" },
  { method: "DELETE", kind: "pattern", path: "^\\/api\\/c4\\/manual-elements\\/([^/]+)$" },
  { method: "GET", kind: "exact", path: "/api/c4/manual-relationships" },
  { method: "POST", kind: "exact", path: "/api/c4/manual-relationships" },
  { method: "DELETE", kind: "pattern", path: "^\\/api\\/c4\\/manual-relationships\\/([^/]+)$" },
  { method: "GET", kind: "exact", path: "/api/c4/manual-groups" },
  { method: "POST", kind: "exact", path: "/api/c4/manual-groups" },
  { method: "PATCH", kind: "pattern", path: "^\\/api\\/c4\\/manual-groups\\/([^/]+)$" },
  { method: "DELETE", kind: "pattern", path: "^\\/api\\/c4\\/manual-groups\\/([^/]+)$" },
  { method: "GET", kind: "exact", path: "/api/code-graph" },
  { method: "GET", kind: "exact", path: "/api/code-graph/releases" },
  { method: "GET", kind: "exact", path: "/api/code-graph/commits" },
  { method: "GET", kind: "exact", path: "/api/code-graph/query" },
  { method: "GET", kind: "exact", path: "/api/code-graph/explain" },
  { method: "GET", kind: "exact", path: "/api/code-graph/path" },
  { method: "GET", kind: "exact", path: "/api/temporal-coupling" },
  { method: "GET", kind: "exact", path: "/api/defect-risk" },
  { method: "GET", kind: "exact", path: "/api/bus-factor" },
  { method: "GET", kind: "exact", path: "/api/hotspot" },
  { method: "GET", kind: "exact", path: "/api/alignment" },
  { method: "GET", kind: "exact", path: "/api/activity-heatmap" },
  { method: "GET", kind: "exact", path: "/api/activity-trend" },
  { method: "GET", kind: "exact", path: "/api/author-heatmap" },
  { method: "GET", kind: "exact", path: "/api/memory/rationale" },
  { method: "GET", kind: "exact", path: "/api/memory/status" },
  { method: "GET", kind: "exact", path: "/api/memory/drift/by-day" },
  { method: "GET", kind: "exact", path: "/api/memory/drift/events" },
  { method: "GET", kind: "prefix", path: "/api/memory/drift/events/" },
  { method: "POST", kind: "prefix", path: "/api/memory/drift/events/" },
  { method: "GET", kind: "exact", path: "/api/memory/bugs/recurring" },
  { method: "GET", kind: "exact", path: "/api/memory/bugs/history" },
  { method: "GET", kind: "exact", path: "/api/memory/bugs/causal" },
  { method: "GET", kind: "exact", path: "/api/memory/reviews/unaddressed" },
  { method: "GET", kind: "exact", path: "/api/memory/reviews/history" },
  { method: "GET", kind: "exact", path: "/api/memory/pipeline/runs/by-day" },
  { method: "GET", kind: "exact", path: "/api/memory/pipeline/failed" },
  { method: "GET", kind: "exact", path: "/api/memory/entities/top" },
  { method: "GET", kind: "exact", path: "/api/memory/edges/invalidations" },
];

describe('TrailDataServer route table', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
  });
  afterEach(async () => { await server.stop(); db.close(); });

  it('registers exactly the routes the if-chain handled', () => {
    expect(server.listRoutes()).toEqual(EXPECTED_ROUTES);
  });

  it('registers no duplicate method+path pair', () => {
    const keys = server.listRoutes().map((r) => `${r.method} ${r.kind} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps prefix routes reachable behind their exact sibling', () => {
    const table = server.listRoutes();
    expect(table).toContainEqual({ method: 'GET', kind: 'exact', path: '/api/memory/drift/events' });
    expect(table).toContainEqual({ method: 'GET', kind: 'prefix', path: '/api/memory/drift/events/' });
    expect(table).toContainEqual({ method: 'POST', kind: 'prefix', path: '/api/memory/drift/events/' });
  });
});

// ---------------------------------------------------------------------------
// リファクタ前に HTTP テストの無かった 3 経路（ルーティング到達の確認）
// ---------------------------------------------------------------------------

describe('routes without prior HTTP coverage', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;
  let distDir: string;

  beforeEach(async () => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-route-table-'));
    fs.writeFileSync(path.join(distDir, 'trailstandalone.js.map'), '{"version":3}');
    db = await createTestTrailDatabase();
    server = new TrailDataServer(distDir, db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });
  afterEach(async () => {
    await server.stop();
    db.close();
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('GET /api/alignment reaches the alignment handler', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/alignment`);
    // gitRoot 未設定のテスト構成では 409 + JSON 本文を返す。ルータの 404（本文・
    // Content-Type なし）と区別できる形で、ハンドラまで到達したことを確認する。
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });

  it('POST /api/trail/refresh reaches importAll', async () => {
    // 実データの全取り込みは重く副作用も大きいため、DB 側の入口だけ差し替えて経路を確認する。
    const importAll = jest.fn().mockResolvedValue({ sessions: 0 });
    (db as unknown as { importAll: unknown }).importAll = importAll;

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/refresh`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(importAll).toHaveBeenCalledTimes(1);
  });

  it('GET /trailstandalone.js.map serves the source map', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/trailstandalone.js.map`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.text()).toBe('{"version":3}');
  });

  it('returns 404 for an unregistered path', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
