import type { HeadingNode } from '../tools/getOutline';

/**
 * 同一 level＋text の見出し候補から対象を 1 つ選ぶ。
 * - 複数一致かつ occurrence 未指定 → 曖昧としてエラー（silent first-match による誤節上書きを防ぐ）
 * - occurrence 指定（1-based）→ n 番目を返す。範囲外はエラー
 * - 0 件 → null（not found の扱いは呼び出し側に委ねる）
 */
export function selectHeadingTarget(
  matches: HeadingNode[],
  heading: string,
  occurrence?: number,
): HeadingNode | null {
  if (matches.length === 0) return null;
  if (occurrence !== undefined) {
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > matches.length) {
      throw new Error(
        `Occurrence out of range for heading "${heading}": ${occurrence} (found ${matches.length})`,
      );
    }
    return matches[occurrence - 1];
  }
  if (matches.length > 1) {
    const lines = matches.map((m) => m.line).join(', ');
    throw new Error(
      `Ambiguous heading "${heading}": ${matches.length} matches at lines ${lines}. Specify occurrence (1-${matches.length}).`,
    );
  }
  return matches[0];
}
