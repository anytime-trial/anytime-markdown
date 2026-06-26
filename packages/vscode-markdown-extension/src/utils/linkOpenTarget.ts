/**
 * リンク先ファイルをどのエディタで開くかを決める純粋ヘルパ。
 *
 * - markdown (.md / .markdown): Anytime Markdown カスタムエディタ（WYSIWYG）で開く。
 *   行アンカー(`#L<n>`)は WYSIWYG に行概念が無いため無視する。
 * - 非 markdown + 行アンカー: テキストエディタで該当行へジャンプする。
 * - それ以外: 既定エディタ（`vscode.open`）で開く。
 */

/** Anytime Markdown カスタムエディタの viewType（package.json contributes.customEditors と一致）。 */
export const ANYTIME_MARKDOWN_VIEW_TYPE = 'anytimeMarkdown';

export type LinkOpenPlan =
  | { kind: 'customEditor'; viewType: string }
  | { kind: 'textEditorAtLine'; line: number }
  | { kind: 'default' };

/** 拡張子が markdown か。 */
export function isMarkdownPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/**
 * @param candidate 開く絶対パス
 * @param line 0 始まりの行番号（行アンカーが無ければ null）
 */
export function planLinkOpen(candidate: string, line: number | null): LinkOpenPlan {
  if (isMarkdownPath(candidate)) {
    return { kind: 'customEditor', viewType: ANYTIME_MARKDOWN_VIEW_TYPE };
  }
  if (line !== null) {
    return { kind: 'textEditorAtLine', line };
  }
  return { kind: 'default' };
}
