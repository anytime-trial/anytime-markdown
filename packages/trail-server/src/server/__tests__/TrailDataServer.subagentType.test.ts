// /api/temporal-coupling integration test for granularity=subagentType
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => ({ fetchC4Model: jest.fn() }));

import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const seedSubagentTypeData = (db: TrailDatabase): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'test-repo', '0', '', '', ?, '', 0, '', 0, '')`,
    ['s1', 's1', isoDaysAgo(1)],
  );
  inner.run(
    `INSERT INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'test-repo', '0', '', '', ?, '', 0, '', 0, '')`,
    ['s2', 's2', isoDaysAgo(2)],
  );
  inner.run(
    `INSERT INTO messages (uuid, session_id, parent_uuid, type, timestamp, subagent_type)
     VALUES ('m1', 's1', NULL, 'assistant', '2026-04-29T00:00:00.000Z', 'Explore')`,
  );
  inner.run(
    `INSERT INTO messages (uuid, session_id, parent_uuid, type, timestamp, subagent_type)
     VALUES ('m2', 's2', NULL, 'assistant', '2026-04-29T00:00:00.000Z', 'code-reviewer')`,
  );
  for (const [sid, mid, idx, tool, file] of [
    ['s1', 'm1', 0, 'Edit', 'src/auth.ts'],
    ['s1', 'm1', 1, 'Edit', 'src/login.ts'],
    ['s2', 'm2', 0, 'Write', 'src/auth.ts'],
    ['s2', 'm2', 1, 'Edit', 'src/login.ts'],
  ] as const) {
    inner.run(
      `INSERT INTO message_tool_calls (
         session_id, message_uuid, turn_index, call_index, tool_name, file_path,
         command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking, is_error, error_type, timestamp
       ) VALUES (?, ?, 0, ?, ?, ?, NULL, NULL, NULL, 0, NULL, 0, 0, NULL, '2026-04-29T00:00:00.000Z')`,
      [sid, mid, idx, tool, file],
    );
  }
};

describe('GET /api/temporal-coupling?granularity=subagentType', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    seedSubagentTypeData(db);
    server = new TrailDataServer('/tmp', db);
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('returns edges with granularity=subagentType in the response', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/temporal-coupling?repo=test-repo&granularity=subagentType&minChange=1&threshold=0`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      granularity: string;
      edges: Array<{ source: string; target: string; coChangeCount: number; jaccard: number }>;
      totalPairs: number;
    };
    expect(body.granularity).toBe('subagentType');
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0]).toMatchObject({
      source: 'src/auth.ts',
      target: 'src/login.ts',
      coChangeCount: 2,
      jaccard: 1.0,
    });
    expect(body.totalPairs).toBe(1);
  });

  it('returns 400 for invalid granularity values', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/temporal-coupling?repo=test-repo&granularity=bogus`,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/granularity/);
  });

  it('still accepts legacy commit/session granularities', async () => {
    for (const g of ['commit', 'session'] as const) {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/temporal-coupling?repo=test-repo&granularity=${g}&minChange=1&threshold=0`,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { granularity: string };
      expect(body.granularity).toBe(g);
    }
  });
});
