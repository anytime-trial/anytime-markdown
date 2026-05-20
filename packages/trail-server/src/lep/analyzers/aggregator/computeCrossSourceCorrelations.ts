import type {
  CorrelationCommitFile,
  CorrelationSessionCommit,
  CrossSourceAKind,
  CrossSourceBKind,
  CrossSourceCorrelationRow,
  DoraReleaseInput,
  PrReviewFindingRow,
  PrReviewRow,
} from '@anytime-markdown/trail-db';

import { compareStr, groupBy } from './utils';

export interface CrossSourceInput {
  readonly reviews: readonly PrReviewRow[];
  readonly findings: readonly PrReviewFindingRow[];
  readonly sessionCommits: readonly CorrelationSessionCommit[];
  readonly releases: readonly DoraReleaseInput[];
  readonly commitFiles: readonly CorrelationCommitFile[];
}

/** 相関の時間窓 (日)。CrossSourceCorrelator の session_commits 範囲フィルタとも共有する。 */
export const DEFAULT_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/**
 * 複数ソース横断の相関を算出する純粋関数 (Step 4d)。すべて trail.db のデータのみで突合する。
 *
 * 1. **pr_review_session**: PR review ↔ session。同一 repo で、review 提出の直前 windowDays 以内に
 *    commit を作った session を紐づける (「この review はどの session の成果に対するものか」)
 * 2. **pr_review_release**: PR review ↔ release。同一 repo で、review 提出後 windowDays 以内の
 *    release を紐づける (「この review の後どの deploy が行われたか」)
 * 3. **pr_finding_commit**: PR review finding ↔ commit。finding のファイルを変更した commit を
 *    紐づける (「指摘されたファイルがどの commit で変更されたか」)
 *
 * いずれも実証目的であり、相関 0 件でも例外なく [] を返す。
 *
 * > 補足: プラン当初案の「finding ↔ memory_review_findings」「review ↔ memory_drift_findings」は
 * > memory-core の別 DB に依存し Wave 4 (trail.db reader) から到達できないため、trail.db で完結する
 * > 上記 3 相関に調整した (lep-step4 §6.4 / フォローアップ)。
 */
export function computeCrossSourceCorrelations(
  input: CrossSourceInput,
  computedAt: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): CrossSourceCorrelationRow[] {
  const windowMs = windowDays * MS_PER_DAY;
  const rows: CrossSourceCorrelationRow[] = [];
  const seen = new Set<string>();

  const push = (
    correlationType: CrossSourceCorrelationRow['correlationType'],
    repoName: string,
    sourceAKind: CrossSourceAKind,
    sourceAId: string,
    sourceBKind: CrossSourceBKind,
    sourceBId: string,
    confidence: CrossSourceCorrelationRow['confidence'],
  ): void => {
    const key = `${correlationType}|${sourceAId}|${sourceBId}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      correlationType,
      repoName,
      sourceAKind,
      sourceAId,
      sourceBKind,
      sourceBId,
      confidence,
      computedAt,
    });
  };

  // repo ごとの session commit 時刻 (sessionId 単位)
  const commitsByRepo = groupBy(input.sessionCommits, (c) => c.repoName);
  // repo ごとの release
  const releasesByRepo = groupBy(input.releases, (r) => r.repoName);
  // file_path → commit 群
  const commitsByFile = groupBy(input.commitFiles, (f) => f.filePath);
  const reviewsById = new Map(input.reviews.map((r) => [r.reviewId, r]));

  for (const review of input.reviews) {
    const submittedMs = Date.parse(review.submittedAt);
    if (Number.isNaN(submittedMs)) continue;

    // 1. pr_review_session
    for (const c of commitsByRepo.get(review.repoName) ?? []) {
      const committedMs = Date.parse(c.committedAt);
      if (Number.isNaN(committedMs)) continue;
      if (committedMs <= submittedMs && submittedMs - committedMs <= windowMs) {
        push('pr_review_session', review.repoName, 'pr_review', review.reviewId, 'session', c.sessionId, 'medium');
      }
    }

    // 2. pr_review_release
    for (const rel of releasesByRepo.get(review.repoName) ?? []) {
      const releasedMs = Date.parse(rel.releasedAt);
      if (Number.isNaN(releasedMs)) continue;
      if (releasedMs >= submittedMs && releasedMs - submittedMs <= windowMs) {
        push('pr_review_release', review.repoName, 'pr_review', review.reviewId, 'release', rel.tag, 'low');
      }
    }
  }

  // 3. pr_finding_commit
  for (const finding of input.findings) {
    if (!finding.filePath) continue;
    const review = reviewsById.get(finding.reviewId);
    const repoName = review?.repoName ?? '';
    for (const cf of commitsByFile.get(finding.filePath) ?? []) {
      if (repoName && cf.repoName && cf.repoName !== repoName) continue;
      push('pr_finding_commit', repoName, 'pr_finding', finding.findingId, 'commit', cf.commitHash, 'medium');
    }
  }

  rows.sort(
    (a, b) =>
      compareStr(a.correlationType, b.correlationType) ||
      compareStr(a.sourceAId, b.sourceAId) ||
      compareStr(a.sourceBId, b.sourceBId),
  );
  return rows;
}
