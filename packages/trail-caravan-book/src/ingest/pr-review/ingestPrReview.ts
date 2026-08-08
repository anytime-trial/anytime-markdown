import type { MemoryDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';
import { maxSeverity, type ParsedFinding } from '../review/findingHelpers';
import { upsertReviewFinding, toReviewedAt } from '../review/persist';

// ── Public types ─────────────────────────────────────────────────────────────

export interface PrReviewFindingInput {
  readonly findingIndex: number;
  readonly targetFilePath?: string | null;
  readonly targetLineStart?: number | null;
  readonly targetLineEnd?: number | null;
  readonly category?: 'design' | 'a11y' | 'security' | 'perf' | 'naming' | 'spec' | 'logic' | 'other' | null;
  readonly severity?: 'info' | 'warn' | 'error' | null;
  readonly findingText: string;
  readonly suggestionText?: string;
}

export interface PrReviewIngestInput {
  readonly repoName: string;
  readonly prNumber: number;
  readonly reviewId: string; // GitHub REST review id（文字列）
  readonly author: string; // reviewer 列へ
  readonly state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  readonly submittedAt: string; // ISO 8601（reviewed_at へ）
  readonly bodyHash: string; // source_hash へ（冪等判定）
  readonly title?: string; // 省略時 "PR #<n> review by <author>"
  readonly bodyExcerpt?: string;
  readonly workspace?: string; // caravan_reviews.workspace へ（省略時 repoName）
  readonly findings: readonly PrReviewFindingInput[];
}

export interface PrReviewIngestResult {
  readonly reviewRowId: string;
  readonly created: boolean; // false = source_hash 一致で skip（変更なし）
  readonly findingsCount: number;
}

// ── source_ref 規約（唯一の正）──────────────────────────────────────────────
// 読み出し側（trail-server の prReviewMemorySource）も必ず本関数を import する。
// 式を 2 か所に持つと、ずれたときに「冪等判定が常に新規・逆引きが常に 0 件」という
// エラーの出ない壊れ方をするため、実体をここへ一本化する。

/** PR レビューの caravan_reviews.source_ref を構築する（source_kind='pr_comment' 用）。 */
export function buildPrReviewSourceRef(repoName: string, prNumber: number, reviewId: string): string {
  return `${repoName}#pr${prNumber}#${reviewId}`;
}

export interface ParsedPrReviewSourceRef {
  readonly repoName: string;
  readonly prNumber: number;
  readonly reviewId: string;
}

/**
 * {@link buildPrReviewSourceRef} の逆変換。形式不一致は null。
 * repoName に `#` が混じっても最後の `#pr<数字>#` を区切りとみなす（貪欲マッチ）。
 */
export function parsePrReviewSourceRef(sourceRef: string): ParsedPrReviewSourceRef | null {
  const m = /^(.+)#pr(\d+)#(.+)$/s.exec(sourceRef);
  if (m === null) return null;
  return { repoName: m[1], prNumber: Number(m[2]), reviewId: m[3] };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * 委任元 (呼び出し側) はロガーを持たないため、既定はタイムスタンプ付き console.error に
 * フォールバックする（silent catch 禁止 — `~/.claude/rules/code-quality.md`「エラー処理」）。
 */
const defaultLogger: MemoryLogger = {
  info: () => {},
  error: (message: string, error?: unknown): void => {
    const stack = error instanceof Error ? error.stack : error;
    // eslint-disable-next-line no-console
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, stack);
  },
};

function toParsedFinding(input: PrReviewFindingInput): ParsedFinding {
  return {
    finding_index: input.findingIndex,
    target_file_path: input.targetFilePath ?? null,
    target_symbol: null,
    target_line_start: input.targetLineStart ?? null,
    target_line_end: input.targetLineEnd ?? null,
    category: input.category ?? 'other',
    severity: input.severity ?? 'info',
    finding_text: input.findingText,
    suggestion_text: input.suggestionText ?? '',
    // PR レビューにはチャプター構造が無いため空欄。upsertReviewFinding は参照しない。
    chapter_path: '',
    is_category_inferred: input.category == null,
    checklist_ref: null,
  };
}

function buildTargetRefsJson(findings: readonly PrReviewFindingInput[]): string {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const f of findings) {
    const path = f.targetFilePath;
    if (typeof path === 'string' && path.length > 0 && !seen.has(path)) {
      seen.add(path);
      refs.push(path);
    }
  }
  return JSON.stringify(refs);
}

/**
 * caravan_review_findings の洗い替え。
 *
 * finding の entity id は (review, finding_index) 由来で、コメントの増減により同じ id が
 * 別内容を指し得る。旧 finding のエンティティと、それを指す**全** edge（flagged だけでなく
 * addresses 等も）を併せて消す — 残すと「この指摘はこのコミットで対処した」リンクが
 * 黙って別の指摘へ付け替わり、addresses / precedes の因果データを汚染する
 * （リンクを失うのは正直な削除・付け替わりは無言の汚染なので、消す方を選ぶ）。
 */
function washAwayFindings(db: MemoryDbConnection, reviewRowId: string): void {
  db.run(
    `DELETE FROM caravan_edges WHERE
       subject_entity_id IN (SELECT finding_entity_id FROM caravan_review_findings WHERE review_id=?)
       OR object_entity_id IN (SELECT finding_entity_id FROM caravan_review_findings WHERE review_id=?)`,
    [reviewRowId, reviewRowId],
  );
  db.run(`DELETE FROM caravan_edges WHERE predicate='flagged' AND subject_entity_id=?`, [reviewRowId]);
  db.run(
    `DELETE FROM caravan_entities WHERE id IN (SELECT finding_entity_id FROM caravan_review_findings WHERE review_id=?)`,
    [reviewRowId],
  );
  db.run(`DELETE FROM caravan_review_findings WHERE review_id=?`, [reviewRowId]);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * GitHub PR レビュー 1 件を caravan_reviews / caravan_review_findings へ取り込む。
 *
 * source_kind='pr_comment'・source_ref={@link buildPrReviewSourceRef} の UNIQUE キーで
 * 冪等 upsert する。source_hash（bodyHash）が既存行と一致すれば何もせず skip
 * （created:false）、不一致（レビュー本文の更新）なら findings を洗い替える。
 *
 * review 行（source_hash 含む）と findings は**同一トランザクション**で書く。分離すると
 * findings 途中失敗の時点で source_hash だけが新値になり、次 run が hash 一致 skip して
 * findings が恒久欠落する。失敗は ROLLBACK の上で**再送出**する（握って created:false を
 * 返すと skip と失敗が同じ顔になり、呼び出し側が処理済みと誤認する）。
 */
export function ingestPrReview(
  db: MemoryDbConnection,
  input: PrReviewIngestInput,
  logger: MemoryLogger = defaultLogger,
): PrReviewIngestResult {
  const recordedAt = new Date().toISOString();
  const sourceRef = buildPrReviewSourceRef(input.repoName, input.prNumber, input.reviewId);
  const reviewRowId = entityId('Review', sourceRef);
  const reviewedAt = toReviewedAt(input.submittedAt);
  const workspace = input.workspace ?? input.repoName;
  const title = input.title ?? `PR #${input.prNumber} review by ${input.author}`;

  db.execMany('BEGIN');
  try {
    // 1. Review entity を確保する（caravan_reviews.review_entity_id の FK 先）。
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [reviewRowId, sourceRef, title, recordedAt, recordedAt, recordedAt],
    );
    db.run(
      `UPDATE caravan_entities SET display_name=?, last_updated_at=? WHERE id=? AND type='Review'`,
      [title, recordedAt, reviewRowId],
    );

    // 2. 既存行の source_hash を見る。
    const existingRows = db.exec(
      `SELECT source_hash FROM caravan_reviews WHERE source_kind='pr_comment' AND source_ref=?`,
      [sourceRef],
    );
    const existingRow = existingRows[0]?.values?.[0];
    const existingHash = existingRow?.[0] == null ? null : String(existingRow[0]);
    const created = existingHash === null;

    if (!created && existingHash === input.bodyHash) {
      const countRows = db.exec(
        `SELECT COUNT(*) FROM caravan_review_findings WHERE review_id=?`,
        [reviewRowId],
      );
      const findingsCount = Number(countRows[0]?.values?.[0]?.[0] ?? 0);
      db.execMany('COMMIT');
      return { reviewRowId, created: false, findingsCount };
    }

    const targetRefsJson = buildTargetRefsJson(input.findings);
    const severityOverall = maxSeverity(
      input.findings.map((f) => ({ severity: f.severity ?? 'info' })),
    );
    const bodyExcerpt = input.bodyExcerpt ?? '';

    if (created) {
      db.run(
        `INSERT INTO caravan_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, target_refs_json,
            title, reviewer, severity_overall, summary, body_excerpt, reviewed_at, recorded_at,
            source_hash, workspace)
         VALUES (?, 'pr_comment', ?, ?, 'code', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewRowId,
          sourceRef,
          reviewRowId,
          targetRefsJson,
          title,
          input.author,
          severityOverall,
          '',
          bodyExcerpt,
          reviewedAt,
          recordedAt,
          input.bodyHash,
          workspace,
        ],
      );
    } else {
      db.run(
        `UPDATE caravan_reviews
            SET target_refs_json=?, title=?, reviewer=?, severity_overall=?, body_excerpt=?,
                reviewed_at=?, recorded_at=?, source_hash=?, workspace=?
          WHERE id=?`,
        [
          targetRefsJson,
          title,
          input.author,
          severityOverall,
          bodyExcerpt,
          reviewedAt,
          recordedAt,
          input.bodyHash,
          workspace,
          reviewRowId,
        ],
      );
      // レビュー更新（bodyHash 変更）は findings を洗い替える（追記だと重複が残る）。
      washAwayFindings(db, reviewRowId);
    }

    let findingsCount = 0;
    for (const finding of input.findings) {
      const result = upsertReviewFinding(db, reviewRowId, toParsedFinding(finding), recordedAt, logger);
      if (result.inserted) {
        findingsCount += 1;
      }
    }

    db.execMany('COMMIT');
    return { reviewRowId, created, findingsCount };
  } catch (err) {
    try {
      db.execMany('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('[anytime-memory] ingestPrReview: rollback failed', rollbackErr);
    }
    logger.error(
      `[anytime-memory] ingestPrReview: failed for repoName=${input.repoName} prNumber=${input.prNumber} reviewId=${input.reviewId}`,
      err,
    );
    // 失敗を握って created:false を返すと skip と判別できず、source_hash 更新済みなら
    // 次 run が恒久 skip する。ROLLBACK 済みなので再送出して pipeline error に載せる
    throw err;
  }
}
