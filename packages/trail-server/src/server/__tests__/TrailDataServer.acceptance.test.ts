jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

const T0 = '2026-07-18T10:00:00.000Z';

describe('/api/trail/acceptance', () => {
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

  function postRecord(payload: Record<string, unknown>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/api/trail/acceptance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  it('受入記録を UPSERT し GET で取得できる', async () => {
    const post = await postRecord({
      commitSha: 'abc1234',
      route: 'machine',
      verdict: 'pass',
      decidedBy: 'farm',
      decidedAt: T0,
      failedTests: [],
      vrtDiff: false,
      quarantinedCount: 1,
      farmRunRef: 'test-results/run-1',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/acceptance?commitSha=abc1234`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { acceptanceRecords: Array<Record<string, unknown>> };
    expect(body.acceptanceRecords).toHaveLength(1);
    const rec = body.acceptanceRecords[0];
    expect(rec?.['route']).toBe('machine');
    expect(rec?.['verdict']).toBe('pass');
    expect(rec?.['decidedBy']).toBe('farm');
    expect(rec?.['quarantinedCount']).toBe(1);
    expect(rec?.['farmRunRef']).toBe('test-results/run-1');
  });

  it('同一 (commitSha, route) の再送は行を増やさず更新する', async () => {
    await postRecord({ commitSha: 'dup1', route: 'human', verdict: 'pending', decidedBy: 'human' });
    await postRecord({ commitSha: 'dup1', route: 'human', verdict: 'pass', decidedBy: 'human', decidedAt: T0 });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/acceptance?commitSha=dup1`);
    const body = (await res.json()) as { acceptanceRecords: Array<Record<string, unknown>> };
    expect(body.acceptanceRecords).toHaveLength(1);
    expect(body.acceptanceRecords[0]?.['verdict']).toBe('pass');
  });

  it('必須フィールド不足・列挙外の値は 400', async () => {
    const missing = await postRecord({ route: 'machine', verdict: 'pass', decidedBy: 'farm' });
    expect(missing.status).toBe(400);
    const badRoute = await postRecord({ commitSha: 'x', route: 'yolo', verdict: 'pass', decidedBy: 'farm' });
    expect(badRoute.status).toBe(400);
    const badVerdict = await postRecord({ commitSha: 'x', route: 'auto', verdict: 'maybe', decidedBy: 'farm' });
    expect(badVerdict.status).toBe(400);
    const badFailedTests = await postRecord({ commitSha: 'x', route: 'auto', verdict: 'pass', decidedBy: 'farm', failedTests: [1] });
    expect(badFailedTests.status).toBe(400);
  });

  it('GET の route フィルタ列挙外は 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/acceptance?route=yolo`);
    expect(res.status).toBe(400);
  });

  it('miss-rate は全 3 経路を返し、windowDays 域外は 400', async () => {
    await postRecord({ commitSha: 'mr1', route: 'machine', verdict: 'pass', decidedBy: 'farm', decidedAt: T0 });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/acceptance/miss-rate?windowDays=7`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { missRates: Array<Record<string, unknown>> };
    expect(body.missRates).toHaveLength(3);
    const machine = body.missRates.find((r) => r['route'] === 'machine');
    expect(machine?.['acceptedCount']).toBe(1);
    expect(machine?.['windowDays']).toBe(7);

    const bad = await fetch(`http://127.0.0.1:${port}/api/trail/acceptance/miss-rate?windowDays=0`);
    expect(bad.status).toBe(400);
  });
});
