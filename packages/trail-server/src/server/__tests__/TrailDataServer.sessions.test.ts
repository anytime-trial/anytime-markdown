
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

function insertSession(db: TrailDatabase, overrides: Partial<Record<string, unknown>> = {}): void {
  const row = {
    id: 'sess-001',
    slug: 'test-slug',
    git_branch: 'main',
    repo_name: 'test-repo',
    model: 'claude-3',
    version: '1.0',
    start_time: '2026-05-01T00:00:00.000Z',
    end_time: '2026-05-01T01:00:00.000Z',
    message_count: 10,
    file_path: '/tmp/sess-001.jsonl',
    file_size: 1234,
    imported_at: '2026-05-01T01:00:00.000Z',
    ...overrides,
  };
  // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(row.repo_name);
  inner(db).run(
    `INSERT INTO sessions (id, slug, git_branch, repo_id, model, version, start_time, end_time,
       message_count, file_path, file_size, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.slug, row.git_branch, repoId, row.model, row.version,
      row.start_time, row.end_time, row.message_count, row.file_path, row.file_size, row.imported_at,
    ],
  );
}

describe('GET /api/trail/sessions', () => {
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

  it('returns empty sessions array when no sessions exist', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions).toHaveLength(0);
  });

  it('returns session data when sessions exist', async () => {
    insertSession(db);
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions: Array<Record<string, unknown>> };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]?.id).toBe('sess-001');
    expect(body.sessions[0]?.repoName).toBe('test-repo');
  });

  it('returns session with usage fields (default 0 when not set)', async () => {
    insertSession(db);
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions`);
    const body = await res.json() as { sessions: Array<Record<string, unknown>> };
    const session = body.sessions[0] as Record<string, unknown>;
    expect(session['usage']).toMatchObject({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
    });
  });

  it('supports branch filter param', async () => {
    insertSession(db, {
      id: 'sess-branch', slug: 'slug-b', git_branch: 'feature/test',
      file_path: '/tmp/sess-b.jsonl',
    });
    insertSession(db, {
      id: 'sess-main', slug: 'slug-m', git_branch: 'main',
      file_path: '/tmp/sess-m.jsonl',
    });
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions?branch=feature/test`);
    const body = await res.json() as { sessions: Array<Record<string, unknown>> };
    expect(body.sessions.every((s) => s['gitBranch'] === 'feature/test')).toBe(true);
  });
});

describe('GET /api/trail/sessions/:id', () => {
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

  it('returns 404 when session not found', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('returns session with messages when exists', async () => {
    insertSession(db);
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/sess-001`);
    expect(res.status).toBe(200);
    const body = await res.json() as { session: Record<string, unknown>; messages: unknown[] };
    expect(body.session).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
  });
});

describe('GET /api/trail/sessions/:id/commits', () => {
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

  it('returns empty commits array for unknown session', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/unknown-session/commits`);
    expect(res.status).toBe(200);
    const body = await res.json() as { commits: unknown[] };
    expect(body.commits).toHaveLength(0);
  });
});

describe('GET /api/trail/sessions/:id/tool-metrics', () => {
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

  it('returns tool metrics (empty) for unknown session', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/trail/sessions/unknown-sess/tool-metrics`);
    expect(res.status).toBe(200);
  });
});
