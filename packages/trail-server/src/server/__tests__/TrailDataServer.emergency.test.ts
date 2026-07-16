jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

const SAFE_POINT = {
  createdAt: '2026-07-16T10:00:00.000Z',
  commitHash: 'a'.repeat(40),
  branch: 'develop',
  worktree: '/ws',
  label: 'before refactor',
  source: 'manual',
  sessionId: 'sess-1',
};

const EVENT = {
  occurredAt: '2026-07-16T10:00:00.000Z',
  event: 'kill_switch_on',
  reason: 'manual stop',
  actor: 'human',
  sessionId: null,
  detailJson: '{"via":"command"}',
};

describe('/api/trail/safe-points and /api/trail/emergency-log', () => {
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

  it('POST then GET safe-points round-trips', async () => {
    const post = await fetch(`http://127.0.0.1:${port}/api/trail/safe-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SAFE_POINT),
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/safe-points`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { safePoints: Array<Record<string, unknown>> };
    expect(body.safePoints).toHaveLength(1);
    expect(body.safePoints[0]?.['commitHash']).toBe('a'.repeat(40));
    expect(body.safePoints[0]?.['label']).toBe('before refactor');
    expect(body.safePoints[0]?.['source']).toBe('manual');
  });

  it('POST safe-points returns 400 when required fields are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/safe-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: 'develop' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST safe-points returns 400 for malformed JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/safe-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    expect(res.status).toBe(400);
  });

  it('POST then GET emergency-log round-trips', async () => {
    const post = await fetch(`http://127.0.0.1:${port}/api/trail/emergency-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(EVENT),
    });
    expect(post.status).toBe(200);

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/emergency-log`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.['event']).toBe('kill_switch_on');
    expect(body.events[0]?.['reason']).toBe('manual stop');
  });

  it('POST emergency-log returns 400 for an unknown event kind', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/emergency-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...EVENT, event: 'not_a_kind' }),
    });
    expect(res.status).toBe(400);
  });
});
