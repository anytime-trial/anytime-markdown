import type { GraphNode } from '@anytime-markdown/graph-core';
import type { SourceLocation } from '@anytime-markdown/trace-core/types';

/**
 * TRC-5: グラフノードの metadata からソースジャンプ先を取り出す。
 *
 * ジャンプ先を持たないノード（io・ライフライン線・loc なしの活性化バー）では `null` を返し、
 * 呼び出し側はジャンプを起こさない。存在しない位置を既定値で埋めない。
 */
export function resolveSourceLocation(node: GraphNode | null): SourceLocation | null {
    const file = node?.metadata?.['sourceFile'];
    if (typeof file !== 'string' || file.length === 0) return null;
    const rawLine = node?.metadata?.['sourceLine'];
    // 行が欠けていてもファイルは開ける方が有用なため 1 行目へ倒す（ファイルの欠落とは別扱い）。
    const line = typeof rawLine === 'number' && rawLine > 0 ? rawLine : 1;
    return { file, line };
}
