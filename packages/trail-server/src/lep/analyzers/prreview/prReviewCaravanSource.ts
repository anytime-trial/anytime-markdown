import {
  buildPrReviewSourceRef,
  parsePrReviewSourceRef,
  type CaravanDbConnection,
  type ParsedPrReviewSourceRef,
} from '@anytime-markdown/trail-caravan-book';
import type { PrReviewFindingRow, PrReviewRow } from '@anytime-markdown/trail-db';

/**
 * PR review 系 analyzer (`PrReviewImporter` / `PrReviewFindingAnalyzer` /
 * `CrossSourceCorrelator`) が caravan-book.db から `PrReviewRow` / `PrReviewFindingRow`
 * 形状で読み出す薄いアダプタ。
 *
 * `source_ref` の構築・分解は trail-caravan-book（ingestPrReview と同一モジュール）の
 * buildPrReviewSourceRef / parsePrReviewSourceRef を re-export する。式の実体を
 * 2 か所に持つと、ずれたときに「冪等判定が常に新規・逆引きが常に 0 件」という
 * エラーの出ない壊れ方をするため、正は書き込み側 1 か所に置く。
 */
export { buildPrReviewSourceRef, parsePrReviewSourceRef };
export type { ParsedPrReviewSourceRef };

/**
 * `PrReviewImporter` 用: caravan_reviews.source_hash を読む
 * (source_kind='pr_comment' AND source_ref=sourceRef)。無ければ null。
 */
export function readPrReviewSourceHash(caravanDb: CaravanDbConnection, sourceRef: string): string | null {
  const result = caravanDb.exec(
    `SELECT source_hash FROM caravan_reviews WHERE source_kind='pr_comment' AND source_ref=?`,
    [sourceRef],
  );
  const row = result[0]?.values?.[0];
  return row?.[0] == null ? null : String(row[0]);
}

/** sql.js のセル値を文字列へ正規化する（NULL / undefined は空文字）。 */
function asText(v: unknown): string {
  return v == null ? '' : String(v);
}

/** sql.js のセル値を文字列へ正規化する（NULL / undefined は null のまま残す）。 */
function asTextOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

/** `CrossSourceCorrelator` が必要とする最小データソース (テストで fake 注入)。 */
export interface PrReviewCaravanSource {
  getPrReviews(): PrReviewRow[];
  getPrReviewFindings(): PrReviewFindingRow[];
}

/**
 * caravan-book.db (`caravan_reviews` / `caravan_review_findings`, source_kind='pr_comment') を
 * activity.db 時代の `PrReviewRow` / `PrReviewFindingRow` 形状へ射影する読み出しアダプタ。
 *
 * `state` は caravan_reviews に保存されていない (severity_overall へ置き換わった)ため
 * 空文字を返す。`computeCrossSourceCorrelations` は state を参照しないため実害はない。
 */
export function createPrReviewCaravanSource(caravanDb: CaravanDbConnection): PrReviewCaravanSource {
  return {
    getPrReviews(): PrReviewRow[] {
      const result = caravanDb.exec(
        `SELECT source_ref, reviewer, reviewed_at, source_hash
           FROM caravan_reviews WHERE source_kind='pr_comment' ORDER BY reviewed_at`,
      );
      const rows = result[0]?.values ?? [];
      const out: PrReviewRow[] = [];
      for (const row of rows) {
        const parsed = parsePrReviewSourceRef(asText(row[0]));
        if (!parsed) continue; // 想定外の source_ref 形式は fail-closed で除外
        out.push({
          reviewId: parsed.reviewId,
          repoName: parsed.repoName,
          prNumber: parsed.prNumber,
          author: asText(row[1]),
          state: '',
          submittedAt: asText(row[2]),
          bodyHash: asText(row[3]),
        });
      }
      return out;
    },

    getPrReviewFindings(): PrReviewFindingRow[] {
      const result = caravanDb.exec(
        `SELECT f.id, r.source_ref, f.target_file_path, f.target_line_start,
                f.severity, f.category, f.finding_text, f.recorded_at
           FROM caravan_review_findings f
           JOIN caravan_reviews r ON r.id = f.review_id
          WHERE r.source_kind = 'pr_comment'
          ORDER BY f.id`,
      );
      const rows = result[0]?.values ?? [];
      const out: PrReviewFindingRow[] = [];
      for (const row of rows) {
        const parsed = parsePrReviewSourceRef(asText(row[1]));
        if (!parsed) continue;
        out.push({
          findingId: asText(row[0]),
          reviewId: parsed.reviewId,
          filePath: asText(row[2]),
          lineNumber: row[3] == null ? null : Number(row[3]),
          severity: row[4] == null ? null : (String(row[4]) as 'error' | 'warn' | 'info'),
          category: asTextOrNull(row[5]),
          body: asText(row[6]),
          createdAt: asText(row[7]),
        });
      }
      return out;
    },
  };
}
