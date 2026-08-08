import type { CaravanDbConnection } from '../db/connection/types';
import { parseReviewSessions } from '../ingest/review/parseReviewSession';
import { entityId } from '../canonical/entityId';
import { noopLogger, type CaravanLogger } from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewBackfillResult {
  status: 'success' | 'error';
  /** 全期間の再走査で得たブロック数 */
  parsed_blocks: number;
  /** summary / body_excerpt を補った caravan_reviews 行数 */
  bodies_filled: number;
  /** 削除した空殻（本文なし・指摘なし）の行数 */
  shells_removed: number;
  /** 空殻に対応して無効化した Review entity 数 */
  shell_entities_invalidated: number;
  error_detail: string;
}

export interface ReviewBackfillInput {
  db: CaravanDbConnection;
  recordedAt: string;
  /** 数えるだけで書き込まない（適用前の影響確認用） */
  dryRun?: boolean;
  logger?: CaravanLogger;
}

const EPOCH = '1970-01-01T00:00:00.000Z';

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * 既存の caravan_reviews を全期間の再走査で補修する。
 *
 * runReviewIncremental は `last_processed_at` 以降のメッセージしか読まないため、
 * カーソルより前に作られた行は二度とパーサの出力に現れない。本文列（summary /
 * body_excerpt）を保存するようになっても、既存行は空のまま残り続ける。その一回限りの
 * 是正を担う。
 *
 * やること:
 * - 全期間を再パースし、id が一致する行の空の本文列を埋める
 * - 本文も指摘も無い行（スキル起動だけの痕跡）を削除し、対応する Review entity を
 *   valid_until で無効化する
 *
 * やらないこと:
 * - **新しい review 行を作らない**。ブロック分割の変更で新しい id ができるが、
 *   その登録は findings 抽出（LLM の refineCategories を伴う）を持つ
 *   runReviewIncremental の仕事で、本関数の責務ではない。
 * - **指摘を消さない**。`addressed_commit_sha` を持つ行があり、force 再取込のように
 *   findings を全削除すると対処の記録が失われる。
 */
export function runReviewBackfill(input: ReviewBackfillInput): ReviewBackfillResult {
  const { db, recordedAt } = input;
  const logger = input.logger ?? noopLogger;
  const dryRun = input.dryRun ?? false;

  const result: ReviewBackfillResult = {
    status: 'success',
    parsed_blocks: 0,
    bodies_filled: 0,
    shells_removed: 0,
    shell_entities_invalidated: 0,
    error_detail: '',
  };

  try {
    const sessions = parseReviewSessions({
      db,
      sinceISO: EPOCH,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    result.parsed_blocks = sessions.length;

    // 1. id が一致する行の空の本文列を埋める
    for (const session of sessions) {
      const reviewId = entityId('Review', `${session.session_id}#${session.message_uuid_start}`);
      if (dryRun) {
        const stmt = db.prepare(
          `SELECT 1 FROM caravan_reviews WHERE id = ? AND (summary = '' OR body_excerpt = '') LIMIT 1`,
        );
        try {
          if (stmt.get(reviewId)) result.bodies_filled++;
        } finally {
          stmt.free?.();
        }
        continue;
      }
      // 列ごとに条件を閉じる。OR 条件でヒットした行の、既に埋まっている方を
      // 空文字で潰さないため。
      db.run(
        `UPDATE caravan_reviews
            SET summary      = CASE WHEN summary = '' THEN ? ELSE summary END,
                body_excerpt = CASE WHEN body_excerpt = '' THEN ? ELSE body_excerpt END
          WHERE id = ? AND (summary = '' OR body_excerpt = '')`,
        [session.summary, session.body_excerpt, reviewId],
      );
      result.bodies_filled += db.getRowsModified();
    }

    // 2. 本文も指摘も無い行は「レビュー結果ではない」ので落とす。
    //    手順 1 の後に判定するので、パーサが本文を出せる行は既に埋まっている。
    const shellSql = `
      SELECT id, review_entity_id FROM caravan_reviews r
       WHERE r.source_kind = 'session'
         AND r.body_excerpt = ''
         AND NOT EXISTS (SELECT 1 FROM caravan_review_findings f WHERE f.review_id = r.id)`;
    const shellStmt = db.prepare(shellSql);
    let shells: Array<{ id: string; entityId: string }>;
    try {
      shells = shellStmt.all().map((row) => ({
        id: String(row['id']),
        entityId: String(row['review_entity_id']),
      }));
    } finally {
      shellStmt.free?.();
    }

    if (dryRun) {
      result.shells_removed = shells.length;
      result.shell_entities_invalidated = shells.length;
    } else {
      for (const shell of shells) {
        db.run('DELETE FROM caravan_reviews WHERE id = ?', [shell.id]);
        result.shells_removed += db.getRowsModified();
        // Review entity は履歴として残し、検索から外すだけにする
        db.run(
          'UPDATE caravan_entities SET valid_until = ? WHERE id = ? AND valid_until IS NULL',
          [recordedAt, shell.entityId],
        );
        result.shell_entities_invalidated += db.getRowsModified();
      }
    }

    logger.info(
      `[${recordedAt}] [INFO] [anytime-memory] runReviewBackfill: ` +
        `parsed_blocks=${result.parsed_blocks} bodies_filled=${result.bodies_filled} ` +
        `shells_removed=${result.shells_removed} dry_run=${dryRun}`,
    );
    return result;
  } catch (err) {
    logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runReviewBackfill: 失敗`, err);
    return {
      status: 'error',
      parsed_blocks: result.parsed_blocks,
      bodies_filled: 0,
      shells_removed: 0,
      shell_entities_invalidated: 0,
      error_detail: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
    };
  }
}
