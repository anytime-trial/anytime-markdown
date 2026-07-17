jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

function transcriptLine(opts: {
  type?: string;
  timestamp: string;
  content?: unknown[];
}): string {
  return JSON.stringify({
    type: opts.type ?? 'assistant',
    timestamp: opts.timestamp,
    message: { content: opts.content ?? [] },
  });
}

describe('/api/trail/flight-reviews', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-review-test-'));
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function postReview(payload: Record<string, unknown>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  it('transcript を集計して flight_reviews へ記録し、GET で取得できる', async () => {
    const transcriptPath = path.join(tmpDir, 'session.jsonl');
    fs.writeFileSync(
      transcriptPath,
      [
        transcriptLine({ type: 'user', timestamp: '2026-07-17T00:00:00.000Z' }),
        transcriptLine({
          timestamp: '2026-07-17T00:00:30.000Z',
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'Edit', input: { file_path: '/a.ts' } },
            { type: 'tool_use', id: 'tu_2', name: 'Edit', input: { file_path: '/a.ts' } },
          ],
        }),
        transcriptLine({
          type: 'user',
          timestamp: '2026-07-17T00:01:00.000Z',
          content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: true }],
        }),
      ].join('\n'),
    );

    const post = await postReview({
      sessionId: 'sess-1',
      transcriptPath,
      cwd: '/ws',
      endedAt: '2026-07-17T00:02:00.000Z',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    expect(body.flightReviews).toHaveLength(1);
    const review = body.flightReviews[0];
    expect(review?.['sessionId']).toBe('sess-1');
    expect(review?.['outcome']).toBe('unknown');
    expect(review?.['outcomeSource']).toBe('machine');
    expect(review?.['startedAt']).toBe('2026-07-17T00:00:00.000Z');
    // transcript 末尾の timestamp が ended_at になる（payload の endedAt は縮退用）
    expect(review?.['endedAt']).toBe('2026-07-17T00:01:00.000Z');
    expect(review?.['durationSeconds']).toBe(60);
    expect(review?.['toolCallCount']).toBe(2);
    expect(review?.['toolFailureCount']).toBe(1);
    expect(review?.['reworkCount']).toBe(1);
  });

  it('transcript が読めない場合も最小行を記録する（fail-open。FR-4）', async () => {
    const post = await postReview({
      sessionId: 'sess-2',
      transcriptPath: path.join(tmpDir, 'missing.jsonl'),
      cwd: '/ws',
      endedAt: '2026-07-17T01:00:00.000Z',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?sessionId=sess-2`);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    expect(body.flightReviews).toHaveLength(1);
    expect(body.flightReviews[0]?.['startedAt']).toBeNull();
    expect(body.flightReviews[0]?.['endedAt']).toBe('2026-07-17T01:00:00.000Z');
    expect(body.flightReviews[0]?.['toolCallCount']).toBe(0);
  });

  it('再送で行が重複しない（UPSERT 冪等。FR-2）', async () => {
    const payload = { sessionId: 'sess-3', cwd: '/ws', endedAt: '2026-07-17T02:00:00.000Z' };
    expect((await postReview(payload)).status).toBe(200);
    expect((await postReview(payload)).status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?sessionId=sess-3`);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    expect(body.flightReviews).toHaveLength(1);
  });

  it('sessionId / endedAt 欠落は 400', async () => {
    expect((await postReview({ cwd: '/ws' })).status).toBe(400);
    expect((await postReview({ sessionId: 'x' })).status).toBe(400);
  });

  it('GET は since / until / limit でフィルタできる（FR-5）', async () => {
    for (const [id, endedAt] of [
      ['s1', '2026-07-17T09:00:00.000Z'],
      ['s2', '2026-07-17T10:00:00.000Z'],
      ['s3', '2026-07-17T11:00:00.000Z'],
    ] as const) {
      expect((await postReview({ sessionId: id, endedAt })).status).toBe(200);
    }
    const since = await fetch(
      `http://127.0.0.1:${port}/api/trail/flight-reviews?since=2026-07-17T10:00:00.000Z`,
    );
    expect(((await since.json()) as { flightReviews: unknown[] }).flightReviews).toHaveLength(2);
    const limited = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?limit=1`);
    const limitedBody = (await limited.json()) as { flightReviews: Array<Record<string, unknown>> };
    expect(limitedBody.flightReviews).toHaveLength(1);
    expect(limitedBody.flightReviews[0]?.['sessionId']).toBe('s3');
  });

  it('POST は非 JSON Content-Type を 415 で拒否する（CSRF ガード）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ sessionId: 'x', endedAt: '2026-07-17T00:00:00.000Z' }),
    });
    expect(res.status).toBe(415);
  });
});
