// Phase 6 S5-C: GET /api/memory/drift/by-day（FR-26）。
// memory_drift_events を実 fixture で作り、JST 境界・0 埋め・未解決累計を API 経由で固定する。
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

type DriftHistoryPoint = {
  date: string;
  detectedCount: number;
  resolvedCount: number;
  unresolvedCumulative: number;
};

function buildMemoryDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(`CREATE TABLE memory_drift_events (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    conversation_value TEXT,
    spec_value TEXT,
    code_value TEXT,
    drift_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_note TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}'
  ) STRICT`);
  const ins = db.prepare(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at)
     VALUES (?, 'ent-1', 'p', ?, ?, ?, ?)`,
  );
  // JST 2026-07-01 に 2 件検知（うち 1 件は 07-03 に解決）
  ins.run('d1', 'spec_vs_code', 'error', '2026-07-01T03:00:00.000Z', '2026-07-03T03:00:00.000Z');
  ins.run('d2', 'spec_vs_code', 'warn', '2026-07-01T04:00:00.000Z', null);
  // UTC では 07-01 だが JST では 07-02（境界の検証）
  ins.run('d3', 'conversation_vs_spec', 'error', '2026-07-01T15:30:00.000Z', null);
  db.close();
}

describe('GET /api/memory/drift/by-day (Phase 6 S5-C)', () => {
  let tmpDir: string;
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-history-test-'));
    buildMemoryDb(path.join(tmpDir, 'memory-core.db'));
    trailDb = await createTestTrailDatabase();
    server = new TrailDataServer(
      '/tmp',
      trailDb,
      makeMockLogger(),
      undefined,
      path.join(tmpDir, 'memory-core.db'),
    );
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    trailDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function getPoints(query = ''): Promise<DriftHistoryPoint[]> {
    const res = await fetch(`http://127.0.0.1:${port}/api/memory/drift/by-day${query}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { points: DriftHistoryPoint[] }).points;
  }

  it('JST 日次で検知数・解決数・未解決累計を返し、0 件の日も 0 で埋まる', async () => {
    const points = await getPoints();
    expect(points.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(points[0]).toEqual({
      date: '2026-07-01',
      detectedCount: 2,
      resolvedCount: 0,
      unresolvedCumulative: 2,
    });
    // UTC 07-01T15:30 は JST では 07-02
    expect(points[1].detectedCount).toBe(1);
    expect(points[2]).toEqual({
      date: '2026-07-03',
      detectedCount: 0,
      resolvedCount: 1,
      unresolvedCumulative: 2,
    });
  });

  it('driftType でフィルタできる', async () => {
    const points = await getPoints('?driftType=conversation_vs_spec');
    expect(points.reduce((sum, p) => sum + p.detectedCount, 0)).toBe(1);
  });

  it('severity でフィルタできる', async () => {
    const points = await getPoints('?severity=warn');
    expect(points.reduce((sum, p) => sum + p.detectedCount, 0)).toBe(1);
  });

  it('since / until で範囲を固定でき、範囲内に検知が無くても系列を返す', async () => {
    const points = await getPoints(
      '?since=2026-08-01T00:00:00.000Z&until=2026-08-03T00:00:00.000Z',
    );
    expect(points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(points.every((p) => p.detectedCount === 0 && p.resolvedCount === 0)).toBe(true);
    // fixture の d2 / d3 は範囲開始前に検知され未解決のまま。バックログとして繰り越す
    // （0 から始めると「未解決が無い」と誤読させる。cross-review 指摘の是正）
    expect(points.every((p) => p.unresolvedCumulative === 2)).toBe(true);
  });

  it('範囲開始前から未解決のドリフトが累計の初期値に繰り越される（cross-review 指摘）', async () => {
    // d1 は 07-03 に解決済みのため繰り越さず、d2 / d3 の 2 件だけが残る
    const points = await getPoints('?since=2026-07-10T00:00:00.000Z&until=2026-07-11T00:00:00.000Z');
    expect(points[0].unresolvedCumulative).toBe(2);
  });

  it('memory.db 不在でも 200 で空配列に縮退する', async () => {
    const server2 = new TrailDataServer(
      '/tmp',
      trailDb,
      makeMockLogger(),
      undefined,
      path.join(tmpDir, 'no-such.db'),
    );
    await server2.start(0);
    try {
      const res = await fetch(`http://127.0.0.1:${server2.port}/api/memory/drift/by-day`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { points: unknown[] }).points).toEqual([]);
    } finally {
      await server2.stop();
    }
  });
});
