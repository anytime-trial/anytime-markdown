// SQL 文が実 SQLite で実行できることだけを固定するテスト。
//
// Why not 偽リーダで足りないか: 偽リーダは SQL 文字列を受け取って捨てるため、SQL の構文エラー・
// 窓関数の非対応・列名の取り違えを一切検知しない。ここで実行可能性だけを押さえ、判定分岐の網羅は
// 偽リーダ側が持つ。
//
// **参照先スキーマの改名はここでは検知しない。** 下の CREATE 文は正本からの手写しなので、
// production 側でテーブル・列が改名されれば fixture も旧名のままとなり、本テストは green のまま
// D2・D3 だけが恒久的に「測定不能」へ落ちる。検知したい場合は、正本と識別子を突合する
// 別ゲートをリポジトリ側へ置くこと（本テストは配布物なのでリポジトリ構造へ依存させない）。
//
// ランタイムは node:sqlite（Node 22 以降に同梱。本リポジトリの .node-version は 24）。
// better-sqlite3 は本パッケージの依存に無いため、宣言していない依存をテストへ持ち込まない。
const { DatabaseSync } = require('node:sqlite');

const { INGEST_SQL, PIPELINE_SQL } = require('./ingest-wiring-collect.cjs');
const { summarizeSkipStreaks } = require('./ingest-wiring-collect.cjs');

/** スキーマの正本（trail-activity の tables.ts / caravan-book の migration）から必要列だけを写す。 */
function createActivityDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  db.exec(`CREATE TABLE activity_session_commits (
    session_id TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    committed_at TEXT,
    repo_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, repo_id, commit_hash)
  ) STRICT`);
  return db;
}

function createCaravanDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE caravan_pipeline_runs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','success','partial','error','skipped')),
    error_detail TEXT NOT NULL DEFAULT ''
  ) STRICT`);
  return db;
}

describe('INGEST_SQL', () => {
  let db;

  beforeEach(() => {
    db = createActivityDb();
    db.exec("INSERT INTO activity_repos VALUES (1, 'anytime-markdown', '2026-01-01T00:00:00Z')");
    db.exec("INSERT INTO activity_repos VALUES (2, 'other-repo', '2026-01-01T00:00:00Z')");
    db.exec("INSERT INTO activity_session_commits VALUES ('s1', 'aaa', '2026-09-01T00:00:00.000Z', 1)");
    db.exec("INSERT INTO activity_session_commits VALUES ('s2', 'bbb', '2026-09-05T00:00:00.000Z', 1)");
    db.exec("INSERT INTO activity_session_commits VALUES ('s3', 'ccc', '2026-09-10T00:00:00.000Z', 2)");
  });

  afterEach(() => db.close());

  it('実スキーマに対して実行でき、指定リポジトリの最新 committed_at を last 列で返す', () => {
    const rows = db.prepare(INGEST_SQL.replace('$repoName', '?')).all('anytime-markdown');
    expect(rows[0].last).toBe('2026-09-05T00:00:00.000Z');
  });

  it('該当リポジトリが無ければ last は null（行が 0 件ではない）', () => {
    const rows = db.prepare(INGEST_SQL.replace('$repoName', '?')).all('no-such-repo');
    expect(rows).toHaveLength(1);
    expect(rows[0].last).toBeNull();
  });

  it('フォールバック側の全リポジトリ集計も実行できる', () => {
    const rows = db.prepare('SELECT MAX(committed_at) AS last FROM activity_session_commits').all();
    expect(rows[0].last).toBe('2026-09-10T00:00:00.000Z');
  });

  it('リテラル埋め込み形（sqlite3 CLI 経路）でも実行できる', () => {
    const rows = db.prepare(INGEST_SQL.replace('$repoName', () => "'anytime-markdown'")).all();
    expect(rows[0].last).toBe('2026-09-05T00:00:00.000Z');
  });
});

describe('PIPELINE_SQL', () => {
  let db;

  afterEach(() => db.close());

  it('実スキーマに対して実行でき、scope ごとに新しい順で最大 50 行を返す', () => {
    db = createCaravanDb();
    const insert = db.prepare('INSERT INTO caravan_pipeline_runs VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < 60; i += 1) {
      insert.run(`r${i}`, 'conversation_incremental', `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:0${i % 10}Z`, 'skipped', 'skipped: llm_unavailable — chat x');
    }
    insert.run('other', 'code_incremental', '2026-09-01T00:00:00Z', 'success', '');

    const rows = db.prepare(PIPELINE_SQL).all();
    const conversation = rows.filter((r) => r.scope === 'conversation_incremental');
    expect(conversation).toHaveLength(50);
    expect(rows.some((r) => r.scope === 'code_incremental')).toBe(true);

    // 取得した行をそのまま集計器へ通せること（列名の契約）。
    const [top] = summarizeSkipStreaks(rows);
    expect(top).toMatchObject({ scope: 'conversation_incremental', skipStreak: 50 });
    expect(top.reasonCodes).toEqual(['llm_unavailable']);
  });

  it('行が 1 件も無くても実行できる', () => {
    db = createCaravanDb();
    expect(db.prepare(PIPELINE_SQL).all()).toEqual([]);
  });
});
