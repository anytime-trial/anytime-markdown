import type { Editor } from "@tiptap/react";

import type { InlineComment } from "./commentHelpers";
import { preprocessMarkdown } from "./frontmatterHelpers";

interface ApplyResult {
  frontmatter: string | null;
  comments: Map<string, InlineComment>;
  body: string;
}

/**
 * Markdown テキストを前処理してエディタに適用する共通関数。
 * preprocessMarkdown → setContent → initComments を一括実行する。
 */
/** エディタ storage に末尾改行の有無を記録するキー */
const TRAILING_NEWLINE_KEY = "trailingNewline";

/** エディタの storage に末尾改行フラグを設定する */
export function setTrailingNewline(editor: Editor, value: boolean): void {
  (editor.storage as unknown as Record<string, unknown>)[TRAILING_NEWLINE_KEY] = value;
}

/** エディタに記録された末尾改行フラグを取得する */
export function getTrailingNewline(editor: Editor): boolean {
  return (editor.storage as unknown as Record<string, unknown>)[TRAILING_NEWLINE_KEY] === true;
}

export function applyMarkdownToEditor(editor: Editor, text: string): ApplyResult {
  // 元テキストの末尾改行を記録（getMarkdownFromEditor で復元するため）
  setTrailingNewline(editor, text.endsWith("\n"));
  const { frontmatter, comments, body } = preprocessMarkdown(text);
  editor.commands.setContent(body);
  editor.commands.initComments(comments);
  return { frontmatter, comments, body };
}
