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

const insertRelease = (db: TrailDatabase, overrides: Partial<Record<string, unknown>> = {}): void => {
  const row = {
    tag: 'v1.0.0',
    released_at: '2026-05-01T00:00:00.000Z',
    prev_tag: null,
    repo_name: 'r',
    package_tags: '[]',
    commit_count: 1,
    files_changed: 1,
    lines_added: 10,
    lines_deleted: 2,
    total_lines: 1234,
    feat_count: 1,
    fix_count: 0,
    refactor_count: 0,
    test_count: 0,
    other_count: 0,
    affected_packages: '[]',
    duration_days: 0,
    ...overrides,
  };
  inner(db).run(
    `INSERT INTO releases (
       tag, released_at, prev_tag, repo_name, package_tags,
       commit_count, files_changed, lines_added, lines_deleted,
       total_lines,
       feat_count, fix_count, refactor_count, test_count, other_count,
       affected_packages, duration_days
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.tag, row.released_at, row.prev_tag, row.repo_name, row.package_tags,
      row.commit_count, row.files_changed, row.lines_added, row.lines_deleted,
      row.total_lines,
      row.feat_count, row.fix_count, row.refactor_count, row.test_count, row.other_count,
      row.affected_packages, row.duration_days,
    ],
  );
};

describe('GET /api/trail/releases', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db);
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('returns releases with totalLines so the front-end ReleasesPanel does not crash on render', async () => {
    insertRelease(db, { total_lines: 1234 });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/releases`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReadonlyArray<Record<string, unknown>>;

    expect(body).toHaveLength(1);
    const row = body[0];
    // totalLines を返さないと ReleasesPanel の fmtNum(release.totalLines) が
    // undefined.toLocaleString() で TypeError になり React ツリーが落ちる。
    expect(row).toHaveProperty('totalLines');
    expect(row.totalLines).toBe(1234);
    expect(typeof row.totalLines).toBe('number');
  });

  it('falls back totalLines to 0 when DB row predates the total_lines migration', async () => {
    insertRelease(db, { total_lines: 0 });

    const res = await fetch(`http://127.0.0.1:${port}/api/trail/releases`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReadonlyArray<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].totalLines).toBe(0);
  });
});
