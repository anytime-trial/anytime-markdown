import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import type { MemoryDbConnection } from '../../../src/db/connection/types';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { linkAddresses } from '../../../src/ingest/review/linkAddresses';
import { entityId } from '../../../src/canonical/entityId';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_NAME = 'anytime-markdown';
const TS_BASE = '2026-01-01T00:00:00.000Z';
// 1 day after base
const TS_PLUS_1 = '2026-01-02T00:00:00.000Z';
// 31 days after base (outside default 30-day window)
const TS_PLUS_31 = '2026-02-01T00:00:00.000Z';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath(suffix = '') {
  return path.join(
    os.tmpdir(),
    `la-test-${process.pid}-${Date.now()}${suffix}.db`
  );
}

function makeLogger() {
  return { warn: jest.fn() };
}

type SetupResult = {
  db: MemoryDbConnection;
  findingId: string;
  findingEntityId: string;
  reviewEntityId: string;
  trailHandle: BetterSqlite3MemoryDb;
  close: () => void;
};

async function buildSetup(opts: {
  findingText: string;
  severity: 'info' | 'warn' | 'error';
  targetFilePath: string | null;
  addressedAt?: string | null;
  commitFile?: string;
  commitMessage?: string;
  commitAt?: string;
  repoName?: string;
  reviewedAt?: string;
  findingRecordedAt?: string;
  /** finding に記録する対象リポジトリ。null なら未解決（照合対象外）を表す。 */
  targetRepo?: string | null;
}): Promise<SetupResult> {
  const {
    findingText,
    severity,
    targetFilePath,
    addressedAt = null,
    commitFile,
    commitMessage,
    commitAt,
    repoName = REPO_NAME,
    reviewedAt = TS_BASE,
    findingRecordedAt = TS_BASE,
    targetRepo = repoName ?? REPO_NAME,
  } = opts;

  const tmpPath = makeTmpPath();

  // 1. Open trail-caravan-book DB
  const { db, close: closeMain } = await openMemoryCoreDb(tmpPath);

  // 2. Build trail DB in-memory
  // Phase H-4: trail.session_commits / commit_files から repo_name 列を撤去した。repo 帰属は repo_id で
  // 表現し、linkAddresses は trail.repos を JOIN して repo_name → repo_id を解決する。
  const trailHandle: BetterSqlite3MemoryDb = BetterSqlite3MemoryDb.openInMemory();
  trailHandle.run('PRAGMA foreign_keys = ON');
  trailHandle.run(`CREATE TABLE repos (
    repo_id INTEGER PRIMARY KEY,
    repo_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT`);
  trailHandle.run(
    `INSERT INTO repos (repo_name, created_at) VALUES (?, '2026-01-01T00:00:00.000Z')`,
    [repoName]
  );
  const repoIdRow = trailHandle.exec('SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
  const repoId = Number(repoIdRow[0]?.values?.[0]?.[0] ?? 0);
  trailHandle.run(`CREATE TABLE session_commits (
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    repo_id INTEGER NOT NULL
  ) STRICT`);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    file_path TEXT NOT NULL,
    repo_id INTEGER NOT NULL
  ) STRICT`);

  if (commitFile && commitMessage && commitAt) {
    const hash = 'abc123def456';
    trailHandle.run(
      `INSERT INTO session_commits (commit_hash, commit_message, committed_at, repo_id) VALUES (?, ?, ?, ?)`,
      [hash, commitMessage, commitAt, repoId]
    );
    trailHandle.run(
      `INSERT INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)`,
      [hash, commitFile, repoId]
    );
  }

  attachTrailDbFromHandle(db, trailHandle);

  // 3. Insert prerequisite memory_entities for review entity
  const reviewEntityId = entityId('Concept', 'test-review-entity');
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, 'Test Review', ?, ?, ?)`,
    [reviewEntityId, 'test-review-entity', TS_BASE, TS_BASE, TS_BASE]
  );

  // 4. Insert memory_reviews
  const reviewId = 'rv-test-1';
  db.run(
    `INSERT OR IGNORE INTO memory_reviews
       (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, 'review_doc', 'review/test.md', ?, 'code', 'Test Review', ?, ?)`,
    [reviewId, reviewEntityId, reviewedAt, TS_BASE]
  );

  // 5. Insert memory_entities for finding entity (using Concept as allowed type)
  const findingCanonicalName = `test-finding-${Date.now()}`;
  const findingEntityId = entityId('Concept', findingCanonicalName);
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, 'Test Finding', ?, ?, ?)`,
    [findingEntityId, findingCanonicalName, TS_BASE, TS_BASE, TS_BASE]
  );

  // 6. Insert memory_review_findings
  const findingId = 'rf-test-1';
  if (addressedAt !== null) {
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_repo, severity, finding_text, recorded_at, addressed_at, addressed_commit_sha)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'already-addressed-sha')`,
      [findingId, reviewId, findingEntityId, targetFilePath, targetRepo, severity, findingText, TS_BASE, addressedAt]
    );
  } else {
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_repo, severity, finding_text, recorded_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [findingId, reviewId, findingEntityId, targetFilePath, targetRepo, severity, findingText, findingRecordedAt]
    );
  }

  return {
    db,
    findingId,
    findingEntityId,
    reviewEntityId,
    trailHandle,
    close: () => {
      trailHandle.close();
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('linkAddresses', () => {
  // Test 1: Happy path
  test('happy path — matching commit sets addressed fields and inserts edge', async () => {
    const { db, findingId, findingEntityId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, logger });

    expect(result.findings_linked).toBe(1);
    expect(result.edges_inserted).toBe(1);

    // Check addressed_commit_sha and addressed_at are set
    const rows = db.exec(
      `SELECT addressed_commit_sha, addressed_at FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    const values = rows[0]?.values[0];
    expect(values?.[0]).toBe('abc123def456');
    expect(values?.[1]).not.toBeNull();
    expect(typeof values?.[1]).toBe('string');

    // Check edge exists
    const commitEntityId = entityId('Commit', 'abc123def456');
    const edges = db.exec(
      `SELECT COUNT(*) FROM memory_edges WHERE predicate='addresses' AND subject_entity_id=? AND object_entity_id=?`,
      [commitEntityId, findingEntityId]
    );
    expect(edges[0]?.values[0][0]).toBe(1);

    // Verify edge metadata
    const edgeRows = db.exec(
      `SELECT subject_entity_id, predicate, object_entity_id,
              confidence, confidence_label, modality, source_type, source_ref
       FROM memory_edges WHERE predicate = 'addresses'`
    );
    expect(edgeRows[0]?.values?.length).toBe(1);
    const [subjectId, predicate, objectId, confidence, confidenceLabel, modality, sourceType, sourceRef] = edgeRows[0]!.values[0]!;
    expect(predicate).toBe('addresses');
    expect(objectId).toBe(findingEntityId);
    expect(confidence).toBeCloseTo(0.7, 5);
    expect(confidenceLabel).toBe('INFERRED');
    expect(modality).toBe('asserted');
    expect(sourceType).toBe('review');
    expect(sourceRef).toBe(`review_finding#${findingId}`);

    close();
  }, 30000);

  // Test 2: No keyword match
  test('no keyword match — commit is skipped', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'chore: update deps',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain NULL
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // Test 3: Outside window
  test('outside window — commit beyond windowDays is not linked', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_31,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, windowDays: 30, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain NULL
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // Regression: コミット窓は recorded_at(ingest 時刻) ではなく reviewed_at(実レビュー時刻) を
  // アンカーにする。一括 re-ingest で recorded_at が後ろ倒しされても、reviewed_at 直後に行われた
  // 修正コミットを取りこぼさない（linkPrecedesBugs と同じ不具合が linkAddresses に残っていた）。
  test('regression — anchors window on reviewed_at, not recorded_at', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      reviewedAt: TS_BASE, // 実レビューは 01-01
      findingRecordedAt: TS_PLUS_31, // 一括 ingest は 02-01（後ろ倒し）
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1, // 修正は reviewed_at 直後(01-02)＝recorded_at より前
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, windowDays: 30, logger });

    // recorded_at アンカーのバグでは window=[02-01, 03-03] となり 01-02 のコミットを取りこぼし 0 になる。
    expect(result.findings_linked).toBe(1);
    expect(result.edges_inserted).toBe(1);
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBe('abc123def456');

    close();
  }, 30000);

  // Test 4: Severity 'info' excluded
  test('severity info — finding is not processed', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'info',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  // Test 5: target_file_path IS NULL
  test('target_file_path null — finding is excluded', async () => {
    const { db, close } = await buildSetup({
      findingText: 'some finding text',
      severity: 'warn',
      targetFilePath: null,
      commitFile: 'src/foo.ts',
      commitMessage: 'fix: some finding text',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  // Test 6: Already addressed
  test('already addressed — finding is not re-processed', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      addressedAt: TS_BASE, // already set
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
    });

    const logger = makeLogger();
    const result = linkAddresses({ db, logger });

    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    // addressed_commit_sha should remain the original value
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBe('already-addressed-sha');

    close();
  }, 30000);
  // ── commit_message のフルメッセージ化に伴う境界 ──────────────────────────────
  //
  // session_commits.commit_message は件名 1 行からフルメッセージ（件名＋本文）へ
  // 変わった。照合対象が数百文字へ広がるため、「トップ 3 キーワードのうち 1 語でも
  // 当たれば +2（受理閾値）」だと無関係なコミットまでリンクされる。一致数に比例する
  // 配点でその境界を固定する。
  //
  // topKeywords は `[^a-z0-9\s]` を除去するため、キーワード規則は ASCII の指摘でしか
  // 発火しない。この境界を検査するテストは必ず ASCII で書く（日本語で書くと
  // キーワード一致が常に 0 件になり、配点を変えても落ちない fail-open なテストになる）。

  test('本文に指摘のキーワードが 2 語以上そろえばリンクされる', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'cache invalidation condition is inverted',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: [
        'fix(core/logic): rework the cache guard',
        '',
        'The invalidation branch was inverted so the cache was always refetched.',
      ].join('\n'),
      commitAt: TS_PLUS_1,
    });

    const result = linkAddresses({ db, logger: makeLogger() });
    expect(result.findings_linked).toBe(1);

    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBe('abc123def456');

    close();
  }, 30000);

  test('本文にキーワードが 1 語しか一致しないコミットはリンクされない', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'cache invalidation condition is inverted',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: [
        'refactor(ui): align the button padding',
        '',
        'The layout condition was wrong for narrow screens, so the padding',
        'differed per page. Unrelated to the finding above.',
      ].join('\n'),
      commitAt: TS_PLUS_1,
    });

    const result = linkAddresses({ db, logger: makeLogger() });
    expect(result.findings_linked).toBe(0);
    expect(result.edges_inserted).toBe(0);

    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId]
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // ── 誤リンク防止（本変更の中核）────────────────────────────────────────────
  //
  // caravan-book.db は複数ワークスペースのレビューを集約している。かつては
  // 呼び出し元の単一 repoName で照合していたため、リポジトリ名を含まない相対パス
  // (src/hooks/useHydrated.ts 等) は別リポジトリの同名ファイルを触ったコミットへ
  // 誤リンクし得た。target_repo で絞ることで塞ぐ。

  test('別リポジトリの同名ファイルを触ったコミットへ誤リンクしない', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      // コミットは anytime-markdown 側にある
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
      repoName: REPO_NAME,
      // 指摘の対象は別リポジトリ（anytime-trade）の同名ファイル
      targetRepo: 'anytime-trade',
    });

    const result = linkAddresses({ db, logger: makeLogger() });

    expect(result.findings_linked).toBe(0);
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId],
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  test('target_repo が未解決(NULL)の finding は照合対象から外れる', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'src/foo.ts',
      commitFile: 'src/foo.ts',
      commitMessage: 'fix(css): border 1px に変更',
      commitAt: TS_PLUS_1,
      targetRepo: null,
    });

    const result = linkAddresses({ db, logger: makeLogger() });

    expect(result.findings_linked).toBe(0);
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId],
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // ── ディレクトリ指定 ────────────────────────────────────────────────────────
  //
  // 実データの 107 件がディレクトリ指定で、完全一致では永久に当たらなかった。
  // 前方一致で拾うが、特定性が低いぶん受理スコアの閾値を 1 段上げている。

  test('ディレクトリ指定は配下ファイルのコミットに前方一致でリンクする', async () => {
    const { db, findingId, close } = await buildSetup({
      // スコア 3 に届く本文（20 文字の抜粋がコミットメッセージに含まれる）
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'packages/markdown-viewer',
      commitFile: 'packages/markdown-viewer/src/index.ts',
      commitMessage: 'fix(css): border 1px fix ne needed border button element',
      commitAt: TS_PLUS_1,
    });

    const result = linkAddresses({ db, logger: makeLogger() });

    expect(result.findings_linked).toBe(1);
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId],
    );
    expect(rows[0]?.values[0][0]).not.toBeNull();

    close();
  }, 30000);

  test('ディレクトリ指定の前方一致がセグメント境界を越えない', async () => {
    const { db, findingId, close } = await buildSetup({
      findingText: 'border 1px fix needed for the button element',
      severity: 'warn',
      targetFilePath: 'packages/markdown-viewer',
      // 別パッケージ（markdown-viewer-extra）のファイル
      commitFile: 'packages/markdown-viewer-extra/src/index.ts',
      commitMessage: 'fix(css): border 1px fix needed for the button element',
      commitAt: TS_PLUS_1,
    });

    const result = linkAddresses({ db, logger: makeLogger() });

    expect(result.findings_linked).toBe(0);
    const rows = db.exec(
      `SELECT addressed_commit_sha FROM memory_review_findings WHERE id = ?`,
      [findingId],
    );
    expect(rows[0]?.values[0][0]).toBeNull();

    close();
  }, 30000);

  // 除外の可観測化。母集合から外れた指摘を黙って捨てると、Flight Record 上の
  // 「未対処」が対処漏れなのか記録漏れなのか区別できない。
  describe('除外件数の集計', () => {
    test('severity=info は severity_info として数える（母集合には入れない）', async () => {
      const { db, close } = await buildSetup({
        findingText: 'ここは info の指摘',
        severity: 'info',
        targetFilePath: 'src/foo.ts',
      });

      const result = linkAddresses({ db, logger: makeLogger() });

      expect(result.candidates).toBe(0);
      expect(result.skipped).toEqual({ severity_info: 1, no_target_path: 0, unresolved_repo: 0 });

      close();
    }, 30000);

    test('対象パスの欠落と対象リポジトリ未解決を別々に数える', async () => {
      const noPath = await buildSetup({
        findingText: '対象が書かれていない指摘',
        severity: 'error',
        targetFilePath: null,
      });
      expect(linkAddresses({ db: noPath.db, logger: makeLogger() }).skipped).toEqual({
        severity_info: 0,
        no_target_path: 1,
        unresolved_repo: 0,
      });
      noPath.close();

      const noRepo = await buildSetup({
        findingText: 'パスはあるがリポジトリが解決できない指摘',
        severity: 'error',
        targetFilePath: 'src/foo.ts',
        targetRepo: null,
      });
      expect(linkAddresses({ db: noRepo.db, logger: makeLogger() }).skipped).toEqual({
        severity_info: 0,
        no_target_path: 0,
        unresolved_repo: 1,
      });
      noRepo.close();
    }, 30000);

    test('母集合に入ったが一致コミットが無い指摘は no_matching_commit で数える', async () => {
      const { db, close } = await buildSetup({
        findingText: 'border 1px fix needed for the button element',
        severity: 'warn',
        targetFilePath: 'src/foo.ts',
        commitFile: 'src/foo.ts',
        commitMessage: 'chore: 無関係なコミット',
        commitAt: TS_PLUS_1,
      });

      const result = linkAddresses({ db, logger: makeLogger() });

      expect(result.candidates).toBe(1);
      expect(result.findings_linked).toBe(0);
      expect(result.no_matching_commit).toBe(1);
      expect(result.skipped).toEqual({ severity_info: 0, no_target_path: 0, unresolved_repo: 0 });

      close();
    }, 30000);

    test('candidates と skipped の合計が未対処の総件数と一致する（不変条件）', async () => {
      // countSkips は母集合クエリと別の SELECT で、条件が独立に保守されている。
      // 片方だけ変えると合計が母数と合わなくなるので、その不整合をここで捕まえる。
      const { db, findingId, close } = await buildSetup({
        findingText: 'border 1px fix needed for the button element',
        severity: 'warn',
        targetFilePath: 'src/foo.ts',
      });

      const extras: ReadonlyArray<[string, string, string | null, string | null]> = [
        ['rf-extra-info', 'info', 'src/foo.ts', REPO_NAME],
        ['rf-extra-nopath', 'error', null, null],
        ['rf-extra-norepo', 'error', 'src/bar.ts', null],
      ];
      const base = db.exec(`SELECT review_id, finding_entity_id FROM memory_review_findings WHERE id = ?`, [findingId]);
      const reviewId = String(base[0].values[0][0]);
      const entityId = String(base[0].values[0][1]);
      let index = 1;
      for (const [id, severity, path, repo] of extras) {
        db.run(
          `INSERT INTO memory_review_findings
             (id, review_id, finding_entity_id, finding_index,
              target_file_path, target_repo, severity, finding_text, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'x', '2026-04-20T00:00:00.000Z')`,
          [id, reviewId, entityId, index++, path, repo, severity],
        );
      }

      const result = linkAddresses({ db, logger: makeLogger() });
      // linkAddresses はリンクした指摘へ addressed_at を書くため、母数は残数 + リンク数。
      const totalRow = db.exec(`SELECT COUNT(*) FROM memory_review_findings WHERE addressed_at IS NULL`);
      const remaining = Number(totalRow[0].values[0][0]);
      const skipped = result.skipped!;
      expect(result.candidates + skipped.severity_info + skipped.no_target_path + skipped.unresolved_repo).toBe(
        remaining + result.findings_linked,
      );
      expect(skipped).toEqual({ severity_info: 1, no_target_path: 1, unresolved_repo: 1 });
      expect(result.candidates).toBe(1);

      close();
    }, 30000);

    test('集計結果をログへ 1 行残す', async () => {
      const { db, close } = await buildSetup({
        findingText: 'ここは info の指摘',
        severity: 'info',
        targetFilePath: 'src/foo.ts',
      });

      const logger = makeLogger();
      linkAddresses({ db, logger });

      const summary = logger.warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('candidates='));
      expect(summary).toContain('candidates=0');
      expect(summary).toContain('info=1');

      close();
    }, 30000);
  });
});
