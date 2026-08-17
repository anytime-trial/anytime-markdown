/**
 * E2E: CaravanDbSession の scope メソッドが run*Incremental を忠実にラップし、
 * 実 trail-caravan-book DB に正しい出力を生成することを検証する (LEP Step 3b 出力一致)。
 *
 * conversation scope を対象に、first-run backfill 経路 → incremental 経路 (cursor 前進)
 * を通す。LLM 非依存 scope (drift) も空 DB で no-op 完走することを確認する。
 */

import { createOllamaClient } from '@anytime-markdown/agent-core';

import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import type { CaravanBookDb } from '../../src/db/connection';
import type { CaravanLogger } from '../../src/logger';
import { CaravanDbSession } from '../../src/service/CaravanDbSession';
import { startMockOllama, type MockOllamaServer } from './mockOllama';

const silentLogger: CaravanLogger = { info: () => {}, error: () => {} };

function makeTrailDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  // repo は正規化テーブル側にある（activity_sessions の repo_name 列は Phase H-4 で撤去済み）。
  // ワークスペース限定はこの JOIN を通るので、fixture もその形にしないと経路を検査できない。
  db.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE
  ) STRICT`);
  db.run(`CREATE TABLE activity_sessions (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL DEFAULT '',
    repo_id INTEGER REFERENCES activity_repos(repo_id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'claude_code'
      CHECK (source IN ('claude_code','codex','gemini','cursor','other'))
  ) STRICT`);
  // レビュー取込が参照する列まで含めた最小 fixture（本番 trail.activity_messages は 37 列）。
  // tool_calls / subagent_type / skill が欠けると parseReviewSessions の SELECT が
  // SQL エラーになり、失敗が catch で握り潰されて経路ごと黙って死ぬ。
  db.run(`CREATE TABLE activity_messages (
    uuid TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL, timestamp TEXT, text_content TEXT, user_content TEXT,
    tool_calls TEXT, subagent_type TEXT, skill TEXT,
    is_sidechain INTEGER NOT NULL DEFAULT 0
  ) STRICT`);
  return db;
}

/** repo 名から repo_id を採番（同名は再利用）する。 */
function repoIdFor(db: BetterSqlite3CaravanDb, repoName: string): number {
  db.run(`INSERT OR IGNORE INTO activity_repos (repo_name) VALUES (?)`, [repoName]);
  const rows = db.exec(`SELECT repo_id FROM activity_repos WHERE repo_name = ?`, [repoName]);
  return rows[0].values[0][0] as number;
}

function insertPair(
  db: BetterSqlite3CaravanDb,
  sid: string,
  ts: string,
  userText: string,
  repoName = 'repo',
): void {
  db.run(`INSERT INTO activity_sessions (id, repo_id) VALUES (?, ?)`, [sid, repoIdFor(db, repoName)]);
  db.run(
    `INSERT INTO activity_messages (uuid, session_id, type, timestamp, text_content, user_content) VALUES (?,?,?,?,?,?)`,
    [`${sid}-u`, sid, 'user', ts, null, userText],
  );
  db.run(
    `INSERT INTO activity_messages (uuid, session_id, type, timestamp, text_content, user_content) VALUES (?,?,?,?,?,?)`,
    [`${sid}-a`, sid, 'assistant', ts.replace('00.000', '30.000'), 'ok', null],
  );
}

async function makeCaravanDb(): Promise<CaravanBookDb> {
  const rawDb = BetterSqlite3CaravanDb.openInCaravan();
  rawDb.run('PRAGMA foreign_keys = ON');
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);
  return { db: rawDb, save: () => {}, close: () => rawDb.close() };
}

describe('E2E: CaravanDbSession scope methods', () => {
  let mock: MockOllamaServer;
  beforeAll(async () => {
    mock = await startMockOllama();
  });
  afterAll(async () => {
    await mock.close();
  });

  test('runConversation: first-run backfill creates edge, second run advances cursor with no-op', async () => {
    const memDb = await makeCaravanDb();
    const trailDb = makeTrailDb();
    // 直近の timestamp (backfill window 内)。backfillDays を大きくして date 依存を排除。
    const now = new Date();
    const ts = new Date(now.getTime() - 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
    insertPair(trailDb, 'sess-1', ts, 'I prefer TypeScript');
    attachTrailDbFromHandle(memDb.db, trailDb);

    mock.setResponses([
      {
        generate: JSON.stringify({
          summary: 'User prefers TypeScript',
          entities: [
            { type: 'Person', name: 'user', aliases: [], tags: [], attributes: {} },
            { type: 'Library', name: 'TypeScript', aliases: [], tags: [], attributes: {} },
          ],
          relations: [
            { subject: { type: 'Person', name: 'user' }, predicate: 'prefers', object: { type: 'Library', name: 'TypeScript' } },
          ],
          questions: [],
        }),
      },
    ]);

    const ollama = createOllamaClient({ baseUrl: mock.baseUrl });
    const session = new CaravanDbSession({
      memDb,
      ollama,
      logger: silentLogger,
      gitRoot: '/tmp/repo',
      backfillDays: 36500,
    });

    const r1 = await session.runConversation();
    expect(r1.status).toBe('success');
    expect(r1.scope).toBe('conversation_incremental');

    const edges = memDb.db.exec(`SELECT predicate FROM caravan_edges WHERE valid_to IS NULL`);
    expect(edges[0]?.values?.some((row) => row[0] === 'prefers')).toBe(true);

    const state1 = memDb.db.exec(
      `SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = 'conversation_incremental'`,
    );
    const lastAt1 = state1[0].values[0][0] as string;
    expect(lastAt1 > '1970-01-01T00:00:00.000Z').toBe(true);

    // second run: cursor set → incremental 経路で no-op
    mock.setResponses([{ generate: JSON.stringify({ summary: 'x', entities: [], relations: [], questions: [] }) }]);
    const r2 = await session.runConversation();
    expect(r2.status).toBe('success');
    expect(r2.itemsProcessed).toBe(0);

    trailDb.close();
    memDb.close();
  }, 30000);

  test.each([
    { mode: undefined, label: '既定 (未指定 = own)', expectForeign: false },
    { mode: 'own' as const, label: "'own'", expectForeign: false },
    { mode: 'all' as const, label: "'all'", expectForeign: true },
  ])(
    'runConversation: workspaceScopeMode=$label で他ワークスペースのセッションを取り込むかが決まる',
    async ({ mode, expectForeign }) => {
      const memDb = await makeCaravanDb();
      const trailDb = makeTrailDb();
      const ts = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
      insertPair(trailDb, 'sess-own', ts, 'I prefer TypeScript', 'repo');
      insertPair(trailDb, 'sess-foreign', ts, 'I prefer Ruby', 'other-repo');
      attachTrailDbFromHandle(memDb.db, trailDb);

      // 全エピソードへ同じ抽出結果を返す（どの会話が処理されたかは episodes の session_id で見る）。
      mock.setResponses(
        Array.from({ length: 4 }, () => ({
          generate: JSON.stringify({ summary: 's', entities: [], relations: [], questions: [] }),
        })),
      );

      const session = new CaravanDbSession({
        memDb,
        ollama: createOllamaClient({ baseUrl: mock.baseUrl }),
        logger: silentLogger,
        gitRoot: '/tmp/repo',
        backfillDays: 36500,
        ...(mode ? { workspaceScopeMode: mode } : {}),
      });

      const result = await session.runConversation();
      expect(result.status).toBe('success');

      const rows = memDb.db.exec(`SELECT DISTINCT session_id FROM caravan_episodes`);
      const sessionIds = (rows[0]?.values ?? []).map((r) => r[0] as string).sort();
      expect(sessionIds).toEqual(expectForeign ? ['sess-foreign', 'sess-own'] : ['sess-own']);

      trailDb.close();
      memDb.close();
    },
    30000,
  );

  test('runDrift: empty DB completes without error (LLM-free, pure SQL)', async () => {
    const memDb = await makeCaravanDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(memDb.db, trailDb);
    const session = new CaravanDbSession({
      memDb,
      ollama: createOllamaClient({ baseUrl: mock.baseUrl }),
      logger: silentLogger,
      gitRoot: '/tmp/repo',
    });
    const r = await session.runDrift();
    expect(r.scope).toBe('drift_detection');
    expect(r.status).not.toBe('error');
    trailDb.close();
    memDb.close();
  }, 30000);
});
