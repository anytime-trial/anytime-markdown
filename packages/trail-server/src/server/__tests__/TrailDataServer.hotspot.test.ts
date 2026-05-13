// __non_webpack_require__ はwebpackグローバル。テスト環境では sql-asm.js を直接ロードするよう差し替え
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  // 実際の trail-core/c4 を読み込みつつ fetchC4Model だけ noop に差し替える
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
     ) VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
    ['s1', 's1'],
  );
  inner(db).run(
    `INSERT INTO session_commits (session_id, commit_hash, committed_at)
     VALUES ('s1', 'h1', ?)`,
    [recent],
  );
  inner(db).run(
    `INSERT INTO commit_files (commit_hash, file_path) VALUES ('h1', 'a.ts')`,
  );
};

describe('GET /api/hotspot', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    seed(db);
    server = new TrailDataServer('/tmp', db);
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('returns hotspot files with default period and granularity', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe('30d');
    expect(body.granularity).toBe('commit');
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files.find((r: { filePath: string }) => r.filePath === 'a.ts')).toBeDefined();
  });

  it('rejects invalid period with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?period=12h`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('period');
  });

  it('rejects invalid granularity with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/hotspot?granularity=foo`);
    expect(res.status).toBe(400);
  });
});
