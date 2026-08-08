import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from '../../../src/db/connection/types';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { resolveReviewTargets } from '../../../src/ingest/review/resolveReviewTargets';
import { entityId } from '../../../src/canonical/entityId';

const TS = '2026-01-01T00:00:00.000Z';

function makeLogger() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

interface ReviewSpec {
  readonly id: string;
  readonly sourceKind: 'review_doc' | 'session';
  readonly sourceRef: string;
  /** 事前に workspace を入れておく場合。省略時は '' (未解決)。 */
  readonly workspace?: string;
  readonly findings: ReadonlyArray<{ id: string; targetFilePath: string | null }>;
}

interface FixtureOptions {
  readonly repos: Record<string, string[]>;
  /** session_id → repo_name。source_kind='session' の解決に使う。 */
  readonly sessions?: Record<string, string>;
  readonly reviews: ReadonlyArray<ReviewSpec>;
}

async function buildFixture(opts: FixtureOptions): Promise<{ db: MemoryDbConnection; close: () => void }> {
  const tmpPath = path.join(os.tmpdir(), `rrt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const { db, close: closeMain } = await openMemoryCoreDb(tmpPath);

  const trail = BetterSqlite3MemoryDb.openInMemory();
  trail.run(`CREATE TABLE activity_repos (
    repo_id INTEGER PRIMARY KEY, repo_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  ) STRICT`);
  trail.run(`CREATE TABLE activity_commit_files (
    id INTEGER PRIMARY KEY, commit_hash TEXT NOT NULL, file_path TEXT NOT NULL, repo_id INTEGER NOT NULL
  ) STRICT`);
  trail.run(`CREATE TABLE activity_sessions (
    id TEXT PRIMARY KEY, repo_id INTEGER
  ) STRICT`);

  const repoIds: Record<string, number> = {};
  let hash = 0;
  for (const [repoName, files] of Object.entries(opts.repos)) {
    trail.run(`INSERT INTO activity_repos (repo_name, created_at) VALUES (?, ?)`, [repoName, TS]);
    const row = trail.exec('SELECT repo_id FROM activity_repos WHERE repo_name = ?', [repoName]);
    const repoId = Number(row[0]?.values?.[0]?.[0] ?? 0);
    repoIds[repoName] = repoId;
    for (const file of files) {
      trail.run(`INSERT INTO activity_commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`, [
        `c${hash++}`, file, repoId,
      ]);
    }
  }
  for (const [sessionId, repoName] of Object.entries(opts.sessions ?? {})) {
    trail.run(`INSERT INTO activity_sessions (id, repo_id) VALUES (?, ?)`, [sessionId, repoIds[repoName]]);
  }

  attachTrailDbFromHandle(db, trail);

  for (const review of opts.reviews) {
    const reviewEntity = entityId('Concept', `rev-${review.id}`);
    db.run(
      `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
      [reviewEntity, `rev-${review.id}`, review.id, TS, TS, TS],
    );
    db.run(
      `INSERT INTO caravan_reviews (id, source_kind, source_ref, review_entity_id, target_kind, title, workspace, reviewed_at, recorded_at)
       VALUES (?, ?, ?, ?, 'code', ?, ?, ?, ?)`,
      [review.id, review.sourceKind, review.sourceRef, reviewEntity, review.id, review.workspace ?? '', TS, TS],
    );
    let index = 0;
    for (const finding of review.findings) {
      const findingEntity = entityId('Concept', `f-${finding.id}`);
      db.run(
        `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Concept', ?, ?, ?, ?, ?)`,
        [findingEntity, `f-${finding.id}`, finding.id, TS, TS, TS],
      );
      db.run(
        `INSERT INTO caravan_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, severity, finding_text, recorded_at)
         VALUES (?, ?, ?, ?, ?, 'warn', 'text', ?)`,
        [finding.id, review.id, findingEntity, index++, finding.targetFilePath, TS],
      );
    }
  }

  return {
    db,
    close: () => {
      trail.close();
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch { /* 一時ファイルは残っても害が無い */ }
    },
  };
}

function readFinding(db: MemoryDbConnection, id: string) {
  const rows = db.exec(`SELECT target_file_path, target_repo FROM caravan_review_findings WHERE id = ?`, [id]);
  const value = rows[0]?.values?.[0] ?? [];
  return { path: value[0] === null || value[0] === undefined ? null : String(value[0]),
           repo: value[1] === null || value[1] === undefined ? null : String(value[1]) };
}

function readWorkspace(db: MemoryDbConnection, id: string): string {
  const rows = db.exec(`SELECT workspace FROM caravan_reviews WHERE id = ?`, [id]);
  return String(rows[0]?.values?.[0]?.[0] ?? '');
}

describe('resolveReviewTargets', () => {
  let fixture: { db: MemoryDbConnection; close: () => void };
  afterEach(() => fixture?.close());

  it('session レビューのワークスペースをセッションのリポジトリから解決する', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'], 'anytime-trade': ['src/y.ts'] },
      sessions: { 'sess-1': 'anytime-trade' },
      reviews: [{ id: 'r1', sourceKind: 'session', sourceRef: 'sess-1#msg-1', findings: [{ id: 'f1', targetFilePath: 'src/y.ts' }] }],
    });

    const result = resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readWorkspace(fixture.db, 'r1')).toBe('anytime-trade');
    expect(readFinding(fixture.db, 'f1')).toEqual({ path: 'src/y.ts', repo: 'anytime-trade' });
    expect(result.targetsResolved).toBe(1);
  });

  // 退行防止: 未解決行を既定値で一括フォールバックしてはならない。
  // `WHERE workspace = ''` だけで絞ると DB 内の未解決行全部が対象になり、
  // 複数ワークスペースを集約している caravan-book.db では他ワークスペース由来の
  // 行まで取込側のワークスペースとして刻印される。その値は同名ファイルの
  // 優先先に使われるため、塞いだはずの誤リンクを別経路から再導入する。
  // 取込側のワークスペースが自明な経路(review_doc / agent)は取込処理が
  // 自分の書いた行にだけ設定する責務を持つ。
  it('session 以外の未解決行を既定値で一括フォールバックしない', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: 'packages/a/src/x.ts' }] }],
    });

    resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readWorkspace(fixture.db, 'r1')).toBe('');
  });

  it('workspace が設定済みの review_doc はその値で解決する', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', workspace: 'anytime-markdown', findings: [{ id: 'f1', targetFilePath: 'packages/a/src/x.ts' }] }],
    });

    resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1').repo).toBe('anytime-markdown');
  });

  // 退行防止: session のワークスペースが引けないとき、取込側のワークスペースで
  // 埋めてはならない。埋めると「別ワークスペースの指摘」を自分のものとして誤表示する。
  // 元の実装は trail 参照つき UPDATE が attach ガードで必ず失敗し、この誤表示に倒れていた。
  it('セッションが引けない session レビューは既定値で埋めず未解決のまま残す', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      sessions: {},
      reviews: [{ id: 'r1', sourceKind: 'session', sourceRef: 'unknown-sess#msg-1', findings: [] }],
    });

    resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readWorkspace(fixture.db, 'r1')).toBe('');
  });

  it('行番号サフィックスを落として正規化する', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: 'packages/a/src/x.ts:24, 48' }] }],
    });

    const result = resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1')).toEqual({ path: 'packages/a/src/x.ts', repo: 'anytime-markdown' });
    expect(result.pathsNormalized).toBe(1);
  });

  it('絶対パスをリポジトリ相対へ畳む', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'], 'anytime-markdown-docs': ['proposal/y.ja.md'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: '/Shared/anytime-markdown-docs/proposal/y.ja.md' }] }],
    });

    resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1')).toEqual({ path: 'proposal/y.ja.md', repo: 'anytime-markdown-docs' });
  });

  it('パスとして成立しない値は NULL へ落とす', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: 'node --test scripts/x.test.mjs' }] }],
    });

    const result = resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1')).toEqual({ path: null, repo: null });
    expect(result.pathsRejected).toBe(1);
  });

  it('解決できないパスは正規化だけして target_repo は NULL のままにする', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: 'packages/a/src/never-committed.ts:9' }] }],
    });

    const result = resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1')).toEqual({ path: 'packages/a/src/never-committed.ts', repo: null });
    expect(result.targetsResolved).toBe(0);
  });

  it('2 回実行しても結果が変わらない（冪等）', async () => {
    fixture = await buildFixture({
      repos: { 'anytime-markdown': ['packages/a/src/x.ts'] },
      reviews: [{ id: 'r1', sourceKind: 'review_doc', sourceRef: 'review/x.md', findings: [{ id: 'f1', targetFilePath: 'packages/a/src/x.ts:24' }] }],
    });

    resolveReviewTargets({ db: fixture.db, logger: makeLogger() });
    const first = readFinding(fixture.db, 'f1');
    const second = resolveReviewTargets({ db: fixture.db, logger: makeLogger() });

    expect(readFinding(fixture.db, 'f1')).toEqual(first);
    // 解決済みの行は再処理されない。
    expect(second.targetsResolved).toBe(0);
    expect(second.pathsNormalized).toBe(0);
  });
});
