// Phase 6 S5-B: GET /api/bus-factor のルーティングとパラメータ検証。
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function seedCommit(
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  author: string,
  filePath: string,
  at: string,
): void {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at, author) VALUES (?, ?, '', ?, ?)`,
    [sessionId, hash, at, author],
  );
  inner.run(`INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`, [
    hash,
    filePath,
  ]);
}

const RECENT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

describe('GET /api/bus-factor (Phase 6 S5-B)', () => {
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    trailDb = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', trailDb, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    trailDb.close();
  });

  it('データが無くても 200 で空配列を返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; totalUnits: number };
    expect(body.entries).toEqual([]);
    expect(body.totalUnits).toBe(0);
  });

  it('ファイル単位の属人度を返す（単独著者は score 1.0）', async () => {
    for (const [i, hash] of ['h1', 'h2', 'h3', 'h4', 'h5'].entries()) {
      seedCommit(trailDb, `s${i}`, hash, 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    }
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor`);
    const body = (await res.json()) as {
      entries: Array<{ unitId: string; score: number | null; topAuthor: string; authorCount: number }>;
      minCommits: number;
    };
    expect(body.minCommits).toBe(5);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].unitId).toBe('packages/trail-core/src/a.ts');
    expect(body.entries[0].score).toBe(1);
    expect(body.entries[0].topAuthor).toBe('taro');
    expect(body.entries[0].authorCount).toBe(1);
  });

  it('minCommits 未満は score が null で返る', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?minCommits=5`);
    const body = (await res.json()) as { entries: Array<{ score: number | null }> };
    expect(body.entries[0].score).toBeNull();
  });

  it('minCommits パラメータが効く', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?minCommits=1`);
    const body = (await res.json()) as { entries: Array<{ score: number | null }>; minCommits: number };
    expect(body.minCommits).toBe(1);
    expect(body.entries[0].score).toBe(1);
  });

  it('windowDays より古いコミットは除外される', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', '2020-01-01T00:00:00.000Z');
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?windowDays=30`);
    const body = (await res.json()) as { entries: unknown[]; windowDays: number };
    expect(body.windowDays).toBe(30);
    expect(body.entries).toEqual([]);
  });

  it('includeRows=1 で生行を返す（C4 要素単位の再集計用）', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/b.ts', RECENT);
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?includeRows=1`);
    const body = (await res.json()) as {
      rows: Array<{ filePath: string; author: string; commitHash: string }>;
      rowsTruncated: boolean;
    };
    expect(body.rows).toHaveLength(2);
    expect(body.rows.every((r) => r.commitHash === 'h1' && r.author === 'Taro')).toBe(true);
    expect(body.rowsTruncated).toBe(false);
  });

  it('includeRows なしでは rows を返さない（既定は軽い応答）', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor`);
    expect(await res.json()).not.toHaveProperty('rows');
  });

  it('不正なパラメータは既定値へクランプされる（500 にしない）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?windowDays=abc&minCommits=-5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { windowDays: number; minCommits: number };
    expect(body.windowDays).toBe(365);
    expect(body.minCommits).toBe(1);
  });
});
