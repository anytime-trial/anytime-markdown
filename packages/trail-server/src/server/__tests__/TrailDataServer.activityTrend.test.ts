const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const inner = (db: TrailDatabase): SqlJsDb => (db as unknown as { db: SqlJsDb }).db;

const seed = (db: TrailDatabase): void => {
  const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  inner(db).run(
    `INSERT INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES ('s1', 's1', 'r', '0', '', '', '', '', 0, '', 0, '')`,
  );
  inner(db).run(
    `INSERT INTO session_commits (session_id, commit_hash, committed_at)
     VALUES ('s1', 'h1', ?)`,
    [recent],
  );
  inner(db).run(
    `INSERT INTO commit_files (commit_hash, file_path) VALUES ('h1', 'a.ts')`,
  );

  // current_graphs を seed し、loadCurrentC4Model() の trailToC4 経由で
  // pkg_core / pkg_core/x / file::a.ts の C4 要素を生成させる。
  const graph = {
    nodes: [
      {
        id: 'file::a.ts',
        label: 'a.ts',
        type: 'file' as const,
        filePath: 'packages/core/src/x/a.ts',
        line: 0,
      },
    ],
    edges: [],
    metadata: {
      projectRoot: 'packages/core',
      analyzedAt: new Date().toISOString(),
      fileCount: 1,
    },
  };
  db.saveCurrentGraph(graph, '', 'h1', 'tmp');
};

describe('GET /api/activity-trend', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    seed(db);
    server = new TrailDataServer('/tmp', db, '/tmp');
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('returns single-series trend for component element', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/activity-trend?elementId=pkg_core/x&period=30d&granularity=commit`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('single-series');
    expect(Array.isArray(body.buckets)).toBe(true);
    const totals = body.buckets.reduce((s: number, b: { count: number }) => s + b.count, 0);
    expect(totals).toBeGreaterThanOrEqual(1);
  });

  it('rejects missing elementId with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-trend?period=30d`);
    expect(res.status).toBe(400);
  });

  it('rejects malformed elementId with 400', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/activity-trend?elementId=evil$$&period=30d`,
    );
    expect(res.status).toBe(400);
  });
});
