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

  it('debrief ブロック付き transcript は self 自己評価が反映される（FR-6）', async () => {
    const transcriptPath = path.join(tmpDir, 'debrief.jsonl');
    const debrief =
      '完了しました。\n\n```debrief\n{"outcome":"partial","unresolvedItems":["残タスク A"],"nextConcerns":["懸念 B"]}\n```';
    fs.writeFileSync(
      transcriptPath,
      [
        transcriptLine({ type: 'user', timestamp: '2026-07-17T00:00:00.000Z' }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-07-17T00:01:00.000Z',
          message: { content: [{ type: 'text', text: debrief }] },
        }),
      ].join('\n'),
    );

    const post = await postReview({
      sessionId: 'sess-self',
      transcriptPath,
      cwd: '/ws',
      endedAt: '2026-07-17T00:02:00.000Z',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?sessionId=sess-self`);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    const review = body.flightReviews[0];
    expect(review?.['outcome']).toBe('partial');
    expect(review?.['outcomeSource']).toBe('self');
    expect(review?.['unresolvedItems']).toBe('["残タスク A"]');
    expect(review?.['nextConcerns']).toBe('["懸念 B"]');
  });

  it('破損 debrief は無視され機械集計のみで記録される（FR-7）', async () => {
    const transcriptPath = path.join(tmpDir, 'broken-debrief.jsonl');
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-07-17T00:01:00.000Z',
        message: { content: [{ type: 'text', text: '```debrief\n{broken\n```' }] },
      }),
    );
    const post = await postReview({
      sessionId: 'sess-broken',
      transcriptPath,
      cwd: '/ws',
      endedAt: '2026-07-17T00:02:00.000Z',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?sessionId=sess-broken`);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    expect(body.flightReviews[0]?.['outcome']).toBe('unknown');
    expect(body.flightReviews[0]?.['outcomeSource']).toBe('machine');
  });

  it('user-feedback POST は該当プロンプトのみ記録し、再送で重複しない（FR-9 / FR-10）', async () => {
    const payload = {
      sessionId: 'sess-fb',
      occurredAt: '2026-07-17T00:00:00.000Z',
      prompt: 'A ではなく B で実装して',
    };
    const post1 = await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(post1.status).toBe(200);
    expect(((await post1.json()) as { recorded: boolean }).recorded).toBe(true);

    // 再送
    await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // 非該当プロンプト（プレフィルタ誤送信の想定）はサーバー再判定で破棄
    const post3 = await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, prompt: '新しいページを追加して' }),
    });
    expect(((await post3.json()) as { recorded: boolean }).recorded).toBe(false);

    const list = await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback?sessionId=sess-fb`);
    const body = (await list.json()) as { userFeedback: Array<Record<string, unknown>> };
    expect(body.userFeedback).toHaveLength(1);
    expect(body.userFeedback[0]?.['matchedPattern']).toBe('ではなく');
  });

  it('ユーザー訂正 + 失敗連鎖が lesson_candidates に入る（FR-11）', async () => {
    await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess-lesson',
        occurredAt: '2026-07-17T00:00:00.000Z',
        prompt: 'やり直してください',
      }),
    });
    const transcriptPath = path.join(tmpDir, 'lesson.jsonl');
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-07-17T00:00:10.000Z',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
              { type: 'tool_use', id: 't2', name: 'Bash', input: {} },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          timestamp: '2026-07-17T00:00:20.000Z',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 't1', is_error: true },
              { type: 'tool_result', tool_use_id: 't2', is_error: true },
            ],
          },
        }),
      ].join('\n'),
    );
    const post = await postReview({
      sessionId: 'sess-lesson',
      transcriptPath,
      cwd: '/ws',
      endedAt: '2026-07-17T00:02:00.000Z',
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/flight-reviews?sessionId=sess-lesson`);
    const body = (await res.json()) as { flightReviews: Array<Record<string, unknown>> };
    const candidates = JSON.parse((body.flightReviews[0]?.['lessonCandidates'] as string) ?? '[]') as Array<{
      kind: string;
    }>;
    expect(candidates.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['tool_failure_chain', 'user_correction']),
    );
  });

  it('user-feedback POST も非 JSON Content-Type を 415 で拒否する（CSRF ガード）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/user-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ sessionId: 'x', occurredAt: '2026-07-17T00:00:00.000Z', prompt: 'やり直し' }),
    });
    expect(res.status).toBe(415);
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
