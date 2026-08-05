jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

describe('/api/trail/instructions', () => {
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

  function declare(payload: Record<string, unknown>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/api/trail/instructions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  function recordSession(sessionId: string, endedAt: string): void {
    db.upsertFlightReviewFromMachine({
      sessionId,
      workspacePath: '/anytime-markdown',
      startedAt: null,
      endedAt,
      durationSeconds: 600,
      toolCallCount: 3,
      toolFailureCount: 0,
      reworkCount: 0,
    });
  }

  it('mode=new で指示を開き、一覧へ 1 行として現れる', async () => {
    recordSession('s1', '2026-08-05T01:00:00.000Z');

    const res = await declare({
      mode: 'new',
      sessionId: 's1',
      summary: 'Flight Record を作る',
      originPrompt: 'Flight Review を指示単位にして',
      workspacePath: '/anytime-markdown',
    });
    expect(res.status).toBe(200);
    const { instructionId } = (await res.json()) as { instructionId: string };
    expect(instructionId).not.toBe('');

    const listRes = await fetch(`http://127.0.0.1:${port}/api/trail/instructions`);
    const { instructions } = (await listRes.json()) as { instructions: Array<Record<string, unknown>> };
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.['summary']).toBe('Flight Record を作る');
    expect(instructions[0]?.['sessionCount']).toBe(1);
    expect(instructions[0]?.['workspaceName']).toBe('anytime-markdown');
  });

  it('mode=continue で 2 セッション目を同じ行へ畳む', async () => {
    recordSession('s1', '2026-08-05T01:00:00.000Z');
    recordSession('s2', '2026-08-05T04:00:00.000Z');
    const opened = await declare({
      mode: 'new', sessionId: 's1', summary: '継続する作業', workspacePath: '/anytime-markdown',
    });
    const { instructionId } = (await opened.json()) as { instructionId: string };

    const res = await declare({ mode: 'continue', sessionId: 's2', instructionId });
    expect(res.status).toBe(200);

    const listRes = await fetch(`http://127.0.0.1:${port}/api/trail/instructions`);
    const { instructions } = (await listRes.json()) as { instructions: Array<Record<string, unknown>> };
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.['sessionCount']).toBe(2);
    expect(instructions[0]?.['durationSeconds']).toBe(1200);
  });

  it('存在しない指示への継続宣言は 404（黙って新規作成しない）', async () => {
    const res = await declare({ mode: 'continue', sessionId: 's2', instructionId: 'missing' });
    expect(res.status).toBe(404);
  });

  it('mode=new で summary が無ければ 400', async () => {
    const res = await declare({ mode: 'new', sessionId: 's1', workspacePath: '/ws' });
    expect(res.status).toBe(400);
  });

  it('未知の mode は 400', async () => {
    const res = await declare({ mode: 'reopen', sessionId: 's1' });
    expect(res.status).toBe(400);
  });

  it('不正な outcome フィルタは 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/instructions?outcome=bogus`);
    expect(res.status).toBe(400);
  });

  it('/open は未完了の指示だけを返し、close 後は消える', async () => {
    const opened = await declare({
      mode: 'new', sessionId: 's1', summary: '進行中', workspacePath: '/anytime-markdown',
    });
    const { instructionId } = (await opened.json()) as { instructionId: string };

    const before = await fetch(`http://127.0.0.1:${port}/api/trail/instructions/open`);
    expect(((await before.json()) as { instructions: unknown[] }).instructions).toHaveLength(1);

    expect((await declare({ mode: 'close', instructionId })).status).toBe(200);

    const after = await fetch(`http://127.0.0.1:${port}/api/trail/instructions/open`);
    expect(((await after.json()) as { instructions: unknown[] }).instructions).toHaveLength(0);
  });

  it('/open は :id パターンに食われない', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/instructions/open`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('instructions');
  });

  it('所属セッションを sequence 順に返す', async () => {
    recordSession('s1', '2026-08-05T01:00:00.000Z');
    recordSession('s2', '2026-08-05T04:00:00.000Z');
    const opened = await declare({
      mode: 'new', sessionId: 's1', summary: '2 セッション', workspacePath: '/anytime-markdown',
    });
    const { instructionId } = (await opened.json()) as { instructionId: string };
    await declare({ mode: 'continue', sessionId: 's2', instructionId });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/instructions/${instructionId}/sessions`);
    const { sessions } = (await res.json()) as { sessions: Array<{ sessionId: string; sequence: number }> };
    expect(sessions.map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('宣言の無いセッションも 1 行として一覧に残る（既存記録を消さない）', async () => {
    recordSession('lonely', '2026-08-05T01:00:00.000Z');

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/instructions`);
    const { instructions } = (await res.json()) as { instructions: Array<Record<string, unknown>> };
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.['instructionId']).toBe('lonely');
  });
});
