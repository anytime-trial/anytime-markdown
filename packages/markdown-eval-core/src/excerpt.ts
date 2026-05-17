/**
 * 抜粋切り出し: 採点プロンプトに渡すための truncate ヘルパ。
 * LLM トークン消費と Claude セッションコンテキスト圧迫を避ける目的。
 */

const TRUNCATION_MARKER = '\n\n... [truncated]';

export interface TruncateResult {
  content: string;
  truncated: boolean;
}

/**
 * 内容を最大 maxChars 文字に切り詰める。
 * 切り詰めた場合は末尾に `\n\n... [truncated]` を付与する。
 *
 * @param content 元の内容
 * @param maxChars 切り詰め上限 (0 以下なら必ず truncate)
 */
export function truncate(content: string, maxChars: number): TruncateResult {
  if (maxChars > 0 && content.length <= maxChars) {
    return { content, truncated: false };
  }
  const head = maxChars > 0 ? content.slice(0, maxChars) : '';
  return { content: head + TRUNCATION_MARKER, truncated: true };
}
