// Phase 6 S5-B: GET /api/bus-factor のルーティングとパラメータ検証。
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { TrailGraph } from '@anytime-markdown/trail-core';

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

/** unit=c4 の集約先を作るための最小コードグラフ（packages/a に 2 ファイル） */
const fixtureGraph: TrailGraph = {
  nodes: [
    { id: 'file::packages/a/src/a.ts', label: 'a.ts', type: 'file', filePath: 'packages/a/src/a.ts', line: 1 },
    { id: 'file::packages/a/src/b.ts', label: 'b.ts', type: 'file', filePath: 'packages/a/src/b.ts', line: 1 },
  ],
  edges: [],
  metadata: { projectRoot: '/tmp/repo', analyzedAt: '2026-07-18T00:00:00.000Z', fileCount: 2 },
};

describe('GET /api/bus-factor (Phase 6 S5-B)', () => {
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    trailDb = await createTestTrailDatabase();
    // gitRoot を渡すと defaultRepo()='repo' となり、unit=c4 が現在の C4 モデルを解決できる
    server = new TrailDataServer('/tmp', trailDb, makeMockLogger(), '/tmp/repo');
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

  it('生行（rows）は返さない（集約はサーバー側で完結する）', async () => {
    seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/trail-core/src/a.ts', RECENT);
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor`);
    const body = await res.json();
    expect(body).not.toHaveProperty('rows');
    expect(body).not.toHaveProperty('rowsTruncated');
  });

  describe('unit=c4（サーバー側 C4 集約）', () => {
    type C4Body = {
      unit: string;
      c4ModelAvailable: boolean;
      entries: Array<{ unitId: string; totalCommits: number; authorCount: number; score: number | null }>;
    };

    it('C4 要素単位の属人度を返す（unit=file とは unitId の粒度が変わる）', async () => {
      for (const [i, hash] of ['h1', 'h2', 'h3', 'h4', 'h5'].entries()) {
        seedCommit(trailDb, `s${i}`, hash, 'Taro', 'packages/a/src/a.ts', RECENT);
      }
      trailDb.saveCurrentGraph(fixtureGraph, '/tmp/repo/tsconfig.json', 'commit-1', 'repo');

      const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?unit=c4`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as C4Body;
      expect(body.unit).toBe('c4');
      expect(body.c4ModelAvailable).toBe(true);
      const fileEntry = body.entries.find((e) => e.unitId === 'file::packages/a/src/a.ts');
      expect(fileEntry?.totalCommits).toBe(5);
      expect(fileEntry?.score).toBe(1);
    });

    it('同一コミットが要素内の複数ファイルを触っても 1 コミットとして数える', async () => {
      // ファイル単位の結果を足し合わせる方式なら 10 になるところを、要素単位の再集計では 5 に保つ
      for (const [i, hash] of ['h1', 'h2', 'h3', 'h4', 'h5'].entries()) {
        seedCommit(trailDb, `s${i}`, hash, 'Taro', 'packages/a/src/a.ts', RECENT);
        seedCommit(trailDb, `s${i}`, hash, 'Taro', 'packages/a/src/b.ts', RECENT);
      }
      trailDb.saveCurrentGraph(fixtureGraph, '/tmp/repo/tsconfig.json', 'commit-1', 'repo');

      const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?unit=c4`);
      const body = (await res.json()) as C4Body;
      const parents = body.entries.filter((e) => !e.unitId.startsWith('file::'));
      expect(parents.length).toBeGreaterThan(0);
      for (const parent of parents) {
        expect(parent.totalCommits).toBe(5);
      }
    });

    it('C4 モデルが無ければ c4ModelAvailable=false と空配列を返す（誤った集約を出さない）', async () => {
      seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/a/src/a.ts', RECENT);
      const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?unit=c4`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as C4Body;
      expect(body.c4ModelAvailable).toBe(false);
      expect(body.entries).toEqual([]);
    });

    it('unit 未指定はファイル単位（既定の互換動作）', async () => {
      seedCommit(trailDb, 's1', 'h1', 'Taro', 'packages/a/src/a.ts', RECENT);
      trailDb.saveCurrentGraph(fixtureGraph, '/tmp/repo/tsconfig.json', 'commit-1', 'repo');
      const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor`);
      const body = (await res.json()) as C4Body;
      expect(body.unit).toBe('file');
      expect(body).not.toHaveProperty('c4ModelAvailable');
      expect(body.entries.map((e) => e.unitId)).toEqual(['packages/a/src/a.ts']);
    });
  });

  it('不正なパラメータは既定値へクランプされる（500 にしない）', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/bus-factor?windowDays=abc&minCommits=-5`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { windowDays: number; minCommits: number };
    expect(body.windowDays).toBe(365);
    expect(body.minCommits).toBe(1);
  });
});
