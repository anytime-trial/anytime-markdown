import type { PrReviewDetail, PrReviewFindingRow } from '@anytime-markdown/trail-db';

/**
 * finding の severity / category を分類する任意のフック (LLM 等)。
 * 未指定なら severity / category は null (LLM 不在時は raw 保存のみ、分類は skip)。
 */
export type PrReviewFindingClassifier = (
  text: string,
) => { severity: 'error' | 'warn' | 'info' | null; category: string | null };

/**
 * PR review の body + 行コメントから finding を抽出する純粋関数 (Step 4c)。
 *
 * - 行コメントがあれば各コメントを 1 finding にする (file_path / line_number 付き)
 * - 行コメントが無く、CHANGES_REQUESTED で body があれば body を 1 finding にする
 * - それ以外 (コメントなしの APPROVED / COMMENTED) は finding なし
 *
 * severity / category は `classify` (LLM 等) を渡したときのみ設定し、未指定なら null。
 * これにより Ollama 不在でも raw コメントを finding として保存でき、分類だけ skip できる。
 */
export function extractPrReviewFindings(
  detail: PrReviewDetail,
  createdAt: string,
  classify?: PrReviewFindingClassifier,
): PrReviewFindingRow[] {
  const findings: PrReviewFindingRow[] = [];

  if (detail.comments.length > 0) {
    detail.comments.forEach((c, i) => {
      const cls = classify?.(c.body);
      findings.push({
        findingId: `${detail.reviewId}#c${i}`,
        reviewId: detail.reviewId,
        filePath: c.path,
        lineNumber: c.line,
        severity: cls?.severity ?? null,
        category: cls?.category ?? null,
        body: c.body,
        createdAt,
      });
    });
    return findings;
  }

  const body = detail.body.trim();
  if (body && detail.state === 'CHANGES_REQUESTED') {
    const cls = classify?.(body);
    findings.push({
      findingId: `${detail.reviewId}#body`,
      reviewId: detail.reviewId,
      filePath: '',
      lineNumber: null,
      severity: cls?.severity ?? null,
      category: cls?.category ?? null,
      body: detail.body,
      createdAt,
    });
  }

  return findings;
}
