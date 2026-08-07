import type { PrReviewFindingInput } from '@anytime-markdown/memory-core';

/**
 * finding の severity / category を分類する任意のフック (LLM 等)。
 * 未指定なら severity / category は null (LLM 不在時は raw 保存のみ、分類は skip)。
 */
export type PrReviewFindingClassifier = (
  text: string,
) => { severity: 'error' | 'warn' | 'info' | null; category: string | null };

/** `extractPrReviewFindingInputs` の入力 (pr_review_imported イベントの部分集合)。 */
export interface PrReviewFindingSource {
  readonly state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  readonly body: string;
  readonly comments: readonly {
    readonly path: string;
    readonly line: number | null;
    readonly body: string;
  }[];
}

/** `ingestPrReview` (memory-core) の CHECK 制約に含まれるカテゴリ集合。 */
const VALID_CATEGORIES = new Set<string>([
  'design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other',
]);

/** classify の戻り値を `PrReviewFindingInput.category` の許容集合へ絞り込む。未知値は null。 */
function toCategory(raw: string | null | undefined): PrReviewFindingInput['category'] {
  if (typeof raw === 'string' && VALID_CATEGORIES.has(raw)) {
    return raw as PrReviewFindingInput['category'];
  }
  return null;
}

/**
 * PR review の body + 行コメントから `ingestPrReview` (memory-core) 向けの finding 入力を
 * 抽出する純粋関数 (Step 5: memory_reviews / memory_review_findings への付け替え)。
 *
 * - 行コメントがあれば各コメントを 1 finding にする (file_path / line_number 付き)
 * - 行コメントが無く、CHANGES_REQUESTED で body があれば body を 1 finding にする
 * - それ以外 (コメントなしの APPROVED / COMMENTED) は finding なし
 *
 * severity / category は `classify` (LLM 等) を渡したときのみ設定し、未指定なら null。
 * これにより Ollama 不在でも raw コメントを finding として保存でき、分類だけ skip できる。
 */
export function extractPrReviewFindingInputs(
  source: PrReviewFindingSource,
  classify?: PrReviewFindingClassifier,
): PrReviewFindingInput[] {
  const findings: PrReviewFindingInput[] = [];

  if (source.comments.length > 0) {
    source.comments.forEach((c, i) => {
      const cls = classify?.(c.body);
      findings.push({
        findingIndex: i,
        targetFilePath: c.path || null,
        targetLineStart: c.line,
        targetLineEnd: c.line,
        category: toCategory(cls?.category),
        severity: cls?.severity ?? null,
        findingText: c.body,
        suggestionText: '',
      });
    });
    return findings;
  }

  const body = source.body.trim();
  if (body && source.state === 'CHANGES_REQUESTED') {
    const cls = classify?.(body);
    findings.push({
      findingIndex: 0,
      targetFilePath: null,
      targetLineStart: null,
      targetLineEnd: null,
      category: toCategory(cls?.category),
      severity: cls?.severity ?? null,
      findingText: source.body,
      suggestionText: '',
    });
  }

  return findings;
}
