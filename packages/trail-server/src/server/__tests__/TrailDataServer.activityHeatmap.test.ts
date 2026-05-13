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
    `INSERT INTO messages (uuid, session_id, parent_uuid, type, timestamp, subagent_type)
     VALUES ('m1', 's1', NULL, 'assistant', ?, 'general-purpose')`,
    [recent],
  );
  inner(db).run(
    `INSERT INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking, is_error, error_type, timestamp
     ) VALUES ('s1', 'm1', 0, 0, 'Edit', 'src/auth.ts', NULL, NULL, NULL, 0, NULL, 0, 0, NULL, ?)`,
    [recent],
  );
};

describe('GET /api/activity-heatmap', () => {
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

  it('returns heatmap with session-file mode', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/activity-heatmap?mode=session-file&period=30d`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('session-file');
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.cells)).toBe(true);
  });

  it('rejects missing mode with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('mode');
  });

  it('rejects invalid mode with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activity-heatmap?mode=foo`);
    expect(res.status).toBe(400);
  });
});
