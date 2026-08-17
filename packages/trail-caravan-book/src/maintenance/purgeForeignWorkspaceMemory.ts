/**
 * 自ワークスペース限定へ切り替える**前**に取り込まれた、他ワークスペース由来の記憶を
 * 数える／削除する保守処理。
 *
 * 取込フィルタ（`memory.workspaceScope`）は今後の取込にしか効かない。既に
 * `caravan_episodes` / `caravan_edges` / `caravan_reviews` に入っている他ワークスペース
 * 由来の行はそのまま残るため、この一回限りの片付けを別に用意する。
 *
 * 削除は永続データの破棄なので、**数える関数と削除する関数を分ける**。呼び出し側は
 * 件数を人へ提示し、承認を得てから `unsafePurgeForeignWorkspaceMemory` を呼ぶ。
 */

import type { CaravanDbConnection } from '../db/connection/types';
import { noopLogger, type CaravanLogger } from '../logger';
import type { MemoryWorkspaceScope } from '../ingest/workspaceScope';

/** 他ワークスペース由来として数えた行数。削除後は「実際に削除した行数」。 */
export interface ForeignWorkspaceMemoryCounts {
  /** 会話エピソード（caravan_episodes）。 */
  episodes: number;
  /** エピソード由来のエッジ（caravan_edges の source_type='conversation'）。 */
  edges: number;
  /** エピソードとエンティティの紐付け（caravan_episode_entities）。 */
  episodeEntities: number;
  /** レビュー会話（caravan_reviews の source_kind='session'）。 */
  reviews: number;
  /** 上記レビューにぶら下がる指摘（caravan_review_findings）。 */
  reviewFindings: number;
  /**
   * owner 行を失った Review / ReviewFinding エンティティ（caravan_entities）。
   * レビュー取込だけが作る非共有ノードなので、owner が消えたら知識グラフから外す。
   */
  reviewEntities: number;
  /** 上記エンティティを端点に持っていたエッジ（`addresses` / `precedes` / `flagged` 等）。 */
  reviewEdges: number;
  /**
   * owner を失っているが、まだ他テーブル（bug_fixes / spec_doc_entities / drift_events）
   * から参照されているため**残した** Review / ReviewFinding エンティティ。
   * これらの FK は ON DELETE 指定を持たないので、消すと参照側が壊れる。
   */
  retainedReviewEntities: number;
  /**
   * 削除するエピソードを根本原因として指していた **自ワークスペースの** バグ修正行
   * （caravan_bug_fixes.root_cause_episode_id）。行は消さず参照だけ外す。
   */
  detachedBugFixLinks: number;
  /** 削除するレビューを指していたレビュー実行行（caravan_review_runs.review_id）。同じく参照だけ外す。 */
  detachedReviewRunLinks: number;
  /**
   * `workspace` 列が空でワークスペースを判定できないレビュー会話。**削除対象に含めない**。
   * `resolveReviewTargets` は失敗時 fail-open で 0 件のまま進むため、未解決は起こり得る。
   * エピソード側の `unresolvedEpisodes` と対称に、残した事実を承認者へ見せるために数える。
   */
  unresolvedReviews: number;
  /**
   * activity.db に対応セッションが無く、どのワークスペースのものか判定できなかった
   * エピソード数。**削除対象に含めない**（activity.db 側の刈り込みで元が消えただけの
   * 自ワークスペース分を巻き添えにしないため）。
   */
  unresolvedEpisodes: number;
}

export interface ForeignWorkspaceMemoryInput {
  /** caravan-book.db 接続。activity.db が "trail" として ATTACH 済みであること。 */
  db: CaravanDbConnection;
  /** 残す側のワークスペース。`all_workspaces` を渡すと対象 0 件になる。 */
  scope: MemoryWorkspaceScope;
  logger?: CaravanLogger;
}

/**
 * 他ワークスペース由来のエピソード id を列挙する SQL。
 *
 * `NOT IN`（自ワークスペースのセッション集合）ではなく、
 * 「activity.db に居て、かつ repo が違う」を明示的に書く。前者だと activity.db に
 * 存在しないセッション（刈り込み済み・別マシン由来）まで「他ワークスペース」に化ける。
 */
const FOREIGN_EPISODE_IDS_SQL = `
  SELECT e.id
    FROM caravan_episodes e
    JOIN trail.activity_sessions s ON s.id = e.session_id
    JOIN trail.activity_repos r ON r.repo_id = s.repo_id
   WHERE r.repo_name <> ?`;

/** どのワークスペースか判定できないエピソード数（activity.db に対応行が無い）。 */
const UNRESOLVED_EPISODE_COUNT_SQL = `
  SELECT COUNT(*)
    FROM caravan_episodes e
   WHERE NOT EXISTS (
     SELECT 1 FROM trail.activity_sessions s
      JOIN trail.activity_repos r ON r.repo_id = s.repo_id
     WHERE s.id = e.session_id)`;

/** 他ワークスペース由来のレビュー会話 id。`workspace` 列は resolveReviewTargets が埋める。 */
const FOREIGN_REVIEW_IDS_SQL = `
  SELECT id FROM caravan_reviews
   WHERE source_kind = 'session' AND workspace <> '' AND workspace <> ?`;

/** `workspace` が空でワークスペースを判定できないレビュー会話（削除対象外）。 */
const UNRESOLVED_REVIEW_COUNT_SQL = `
  SELECT COUNT(*) FROM caravan_reviews
   WHERE source_kind = 'session' AND (workspace IS NULL OR workspace = '')`;

/**
 * owner 行を失った Review / ReviewFinding エンティティ。
 *
 * `valid_until IS NULL` に限るのは、`runReviewBackfill` の空殻除去が「行は消し、
 * エンティティは valid_until で無効化して残す」という**意図的な soft delete** を
 * しているため。そこを一緒に hard delete すると、本変更の範囲を越えて既存の
 * 無効化方式を壊す。
 *
 * bug_fixes / spec_doc_entities / drift_events から参照されているものも除く。
 * これらの FK は ON DELETE 指定を持たないので、消すと参照側が壊れる。
 */
const ORPHAN_REVIEW_ENTITY_IDS_SQL = `
  SELECT e.id FROM caravan_entities e
   WHERE e.type IN ('Review', 'ReviewFinding')
     AND e.valid_until IS NULL
     AND NOT EXISTS (SELECT 1 FROM caravan_reviews r WHERE r.review_entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM caravan_review_findings f WHERE f.finding_entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM caravan_bug_fixes b WHERE b.bug_entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM caravan_spec_doc_entities s WHERE s.entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM caravan_drift_events d WHERE d.subject_entity_id = e.id)`;

/** owner を失っているが他テーブルから参照されているため残す Review / ReviewFinding。 */
const RETAINED_REVIEW_ENTITY_COUNT_SQL = `
  SELECT COUNT(*) FROM caravan_entities e
   WHERE e.type IN ('Review', 'ReviewFinding')
     AND e.valid_until IS NULL
     AND NOT EXISTS (SELECT 1 FROM caravan_reviews r WHERE r.review_entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM caravan_review_findings f WHERE f.finding_entity_id = e.id)
     AND (EXISTS (SELECT 1 FROM caravan_bug_fixes b WHERE b.bug_entity_id = e.id)
       OR EXISTS (SELECT 1 FROM caravan_spec_doc_entities s WHERE s.entity_id = e.id)
       OR EXISTS (SELECT 1 FROM caravan_drift_events d WHERE d.subject_entity_id = e.id))`;

function emptyCounts(): ForeignWorkspaceMemoryCounts {
  return {
    episodes: 0,
    edges: 0,
    episodeEntities: 0,
    reviews: 0,
    reviewFindings: 0,
    reviewEntities: 0,
    reviewEdges: 0,
    retainedReviewEntities: 0,
    detachedBugFixLinks: 0,
    detachedReviewRunLinks: 0,
    unresolvedReviews: 0,
    unresolvedEpisodes: 0,
  };
}

function scalar(db: CaravanDbConnection, sql: string, params: readonly string[]): number {
  const rows = db.exec(sql, params);
  return (rows[0]?.values?.[0]?.[0] as number | undefined) ?? 0;
}

/**
 * 他ワークスペース由来の記憶を**数えるだけ**。書き込みは一切しない。
 *
 * 承認前の判断材料を作るために使う。
 */
export function countForeignWorkspaceMemory(
  input: ForeignWorkspaceMemoryInput,
): ForeignWorkspaceMemoryCounts {
  const { db, scope } = input;
  const counts = emptyCounts();
  if (scope.kind === 'all_workspaces') return counts;
  const repoName = scope.repoName;

  counts.episodes = scalar(db, `SELECT COUNT(*) FROM (${FOREIGN_EPISODE_IDS_SQL})`, [repoName]);
  counts.unresolvedEpisodes = scalar(db, UNRESOLVED_EPISODE_COUNT_SQL, []);
  counts.edges = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_edges
      WHERE source_type = 'conversation' AND source_ref IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  counts.episodeEntities = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_episode_entities
      WHERE episode_id IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  counts.reviews = scalar(db, `SELECT COUNT(*) FROM (${FOREIGN_REVIEW_IDS_SQL})`, [repoName]);
  counts.reviewFindings = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_review_findings
      WHERE review_id IN (${FOREIGN_REVIEW_IDS_SQL})`,
    [repoName],
  );
  counts.detachedBugFixLinks = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_bug_fixes
      WHERE root_cause_episode_id IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  counts.detachedReviewRunLinks = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_review_runs
      WHERE review_id IN (${FOREIGN_REVIEW_IDS_SQL})`,
    [repoName],
  );
  counts.unresolvedReviews = scalar(db, UNRESOLVED_REVIEW_COUNT_SQL, []);

  // Review / ReviewFinding エンティティは削除対象のレビュー行が消えて初めて孤立する。
  // 削除前の時点で数えられるのは「今すでに孤立しているもの」＝過去の削除の取りこぼし
  // だけなので、これから孤立する分を足して提示する（承認者へ過小提示しないため）。
  const willOrphan = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_entities e
      WHERE e.valid_until IS NULL
        AND (e.id IN (SELECT review_entity_id FROM caravan_reviews
                       WHERE id IN (${FOREIGN_REVIEW_IDS_SQL}))
          OR e.id IN (SELECT finding_entity_id FROM caravan_review_findings
                       WHERE review_id IN (${FOREIGN_REVIEW_IDS_SQL})))`,
    [repoName, repoName],
  );
  counts.reviewEntities = scalar(db, `SELECT COUNT(*) FROM (${ORPHAN_REVIEW_ENTITY_IDS_SQL})`, []) + willOrphan;
  counts.reviewEdges = scalar(
    db,
    `SELECT COUNT(*) FROM caravan_edges
      WHERE subject_entity_id IN (${ORPHAN_REVIEW_ENTITY_IDS_SQL})
         OR object_entity_id IN (${ORPHAN_REVIEW_ENTITY_IDS_SQL})`,
    [],
  );
  counts.retainedReviewEntities = scalar(db, RETAINED_REVIEW_ENTITY_COUNT_SQL, []);
  return counts;
}

/**
 * 他ワークスペース由来の記憶を**削除する**（不可逆）。
 *
 * 呼び出し前に {@link countForeignWorkspaceMemory} の結果を人へ提示し、承認を得ること。
 * 名前の `unsafe` はその手順を飛ばせないようにするための印である。
 *
 * 全文をひとつのトランザクションで囲む。7 つ以上の文を素で並べると、途中の
 * `SQLITE_BUSY`（本番 DB はパイプラインが常時触っている）で「参照だけ NULL になり、
 * 指していた行は残る」という復元手段の無い中途半端な状態が確定する。
 * **呼び出し側でトランザクションを張らないこと**（入れ子の BEGIN はエラーになる）。
 *
 * 消すもの:
 * - 他ワークスペース由来のエピソード・会話由来エッジ・エピソード↔エンティティ
 * - 他ワークスペース由来のレビュー会話とその指摘
 * - owner 行を失った Review / ReviewFinding エンティティとその端点エッジ
 *
 * 消さないもの:
 * - File / Concept / Commit 等のエンティティ: 正規化された共有ノードで、コード・
 *   バグ履歴・仕様の各取込からも作られる。会話由来のエッジが消えて孤立しても、
 *   ノード自体を消すと他ソースの参照を壊す。Review / ReviewFinding はレビュー取込
 *   だけが作る非共有ノードなので、この理由は当てはまらず削除する。
 * - `valid_until` が入った Review エンティティ（`runReviewBackfill` の空殻除去による
 *   意図的な soft delete）。
 * - bug_fixes / spec_doc_entities / drift_events から参照されているエンティティ。
 * - どのワークスペースか判定できないエピソード・レビュー（activity.db に対応セッションが
 *   無い / `workspace` 未解決）。件数は `unresolved*` で返す。
 *
 * FTS5 索引（`caravan_episodes_fts` / `caravan_entities_fts`）はトリガを持たない外部
 * 再構築方式のため、削除後に索引を作り直すまで消えた行が残る。呼び出し側の責務。
 */
export function unsafePurgeForeignWorkspaceMemory(
  input: ForeignWorkspaceMemoryInput,
): ForeignWorkspaceMemoryCounts {
  const { db, scope } = input;
  const logger = input.logger ?? noopLogger;
  const deleted = emptyCounts();
  if (scope.kind === 'all_workspaces') {
    logger.info('[anytime-memory] purgeForeignWorkspaceMemory: scope=all のため削除対象なし');
    return deleted;
  }
  const repoName = scope.repoName;

  db.run('BEGIN IMMEDIATE');
  try {
    purgeInTransaction(db, repoName, deleted);
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }

  logger.info(
    `[anytime-memory] purgeForeignWorkspaceMemory: episodes=${deleted.episodes} ` +
      `edges=${deleted.edges} episode_entities=${deleted.episodeEntities} ` +
      `reviews=${deleted.reviews} findings=${deleted.reviewFindings} ` +
      `review_entities=${deleted.reviewEntities} review_edges=${deleted.reviewEdges} ` +
      `detached_bug_fix_links=${deleted.detachedBugFixLinks} ` +
      `detached_review_run_links=${deleted.detachedReviewRunLinks} ` +
      `(残した: 判定不能エピソード=${deleted.unresolvedEpisodes} / 未解決レビュー=` +
      `${deleted.unresolvedReviews} / 参照ありレビューエンティティ=${deleted.retainedReviewEntities}。` +
      `FTS 索引は別途再構築が必要)`,
  );
  return deleted;
}

/** {@link unsafePurgeForeignWorkspaceMemory} の本体。トランザクション内でのみ呼ぶ。 */
function purgeInTransaction(
  db: CaravanDbConnection,
  repoName: string,
  deleted: ForeignWorkspaceMemoryCounts,
): void {
  // 先に「消さない行から消す行への参照」を外す。caravan_bug_fixes.root_cause_episode_id と
  // caravan_review_runs.review_id は ON DELETE 指定を持たない FK なので、外さずに削除すると
  // SQLITE_CONSTRAINT_FOREIGNKEY で丸ごと失敗する（本番データで実測: bug_fixes 24 行）。
  // 行そのものは自ワークスペースの記録なので消さず、参照だけ NULL にする。
  db.run(
    `UPDATE caravan_bug_fixes SET root_cause_episode_id = NULL
      WHERE root_cause_episode_id IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  deleted.detachedBugFixLinks = db.getRowsModified();

  db.run(
    `UPDATE caravan_review_runs SET review_id = NULL
      WHERE review_id IN (${FOREIGN_REVIEW_IDS_SQL})`,
    [repoName],
  );
  deleted.detachedReviewRunLinks = db.getRowsModified();

  // 削除順は参照の葉から。findings → reviews、edges / episode_entities → episodes。
  db.run(
    `DELETE FROM caravan_review_findings WHERE review_id IN (${FOREIGN_REVIEW_IDS_SQL})`,
    [repoName],
  );
  deleted.reviewFindings = db.getRowsModified();

  db.run(`DELETE FROM caravan_reviews WHERE id IN (${FOREIGN_REVIEW_IDS_SQL})`, [repoName]);
  deleted.reviews = db.getRowsModified();

  // レビュー行が消えて孤立した Review / ReviewFinding エンティティと、その端点エッジ。
  // エッジを先に消すのは、エンティティ削除に伴う object_entity_id の ON DELETE SET NULL が
  // `CHECK (object_entity_id IS NOT NULL OR object_literal IS NOT NULL)` を破るため
  // （SET NULL は CHECK を回避しない）。
  db.run(
    `DELETE FROM caravan_edges
      WHERE subject_entity_id IN (${ORPHAN_REVIEW_ENTITY_IDS_SQL})
         OR object_entity_id IN (${ORPHAN_REVIEW_ENTITY_IDS_SQL})`,
    [],
  );
  deleted.reviewEdges = db.getRowsModified();

  deleted.retainedReviewEntities = scalar(db, RETAINED_REVIEW_ENTITY_COUNT_SQL, []);
  db.run(`DELETE FROM caravan_entities WHERE id IN (${ORPHAN_REVIEW_ENTITY_IDS_SQL})`, []);
  deleted.reviewEntities = db.getRowsModified();

  db.run(
    `DELETE FROM caravan_edges
      WHERE source_type = 'conversation' AND source_ref IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  deleted.edges = db.getRowsModified();

  db.run(
    `DELETE FROM caravan_episode_entities WHERE episode_id IN (${FOREIGN_EPISODE_IDS_SQL})`,
    [repoName],
  );
  deleted.episodeEntities = db.getRowsModified();

  db.run(`DELETE FROM caravan_episodes WHERE id IN (${FOREIGN_EPISODE_IDS_SQL})`, [repoName]);
  deleted.episodes = db.getRowsModified();

  deleted.unresolvedEpisodes = scalar(db, UNRESOLVED_EPISODE_COUNT_SQL, []);
  deleted.unresolvedReviews = scalar(db, UNRESOLVED_REVIEW_COUNT_SQL, []);
}
