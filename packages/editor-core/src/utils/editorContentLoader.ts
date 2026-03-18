import type { Editor } from "@tiptap/react";

import { getEditorStorage } from "../types";
import type { InlineComment } from "./commentHelpers";
import { preprocessMarkdown } from "./frontmatterHelpers";

interface ApplyResult {
  frontmatter: string | null;
  comments: Map<string, InlineComment>;
  body: string;
}

/** エディタ storage に末尾改行の有無を記録するキー */
const TRAILING_NEWLINE_KEY = "trailingNewline";

/** エディタの storage に末尾改行フラグを設定する */
export function setTrailingNewline(editor: Editor, value: boolean): void {
  getEditorStorage(editor)[TRAILING_NEWLINE_KEY] = { value };
}

/** エディタに記録された末尾改行フラグを取得する */
export function getTrailingNewline(editor: Editor): boolean {
  return (getEditorStorage(editor)[TRAILING_NEWLINE_KEY] as { value?: boolean } | undefined)?.value === true;
}

/**
 * Markdown テキストを前処理してエディタに適用する共通関数。
 * preprocessMarkdown → setContent → initComments を一括実行する。
 */
export function applyMarkdownToEditor(editor: Editor, text: string): ApplyResult {
  // 元テキストの末尾改行を記録（getMarkdownFromEditor で復元するため）
  setTrailingNewline(editor, text.endsWith("\n"));
  const { frontmatter, comments, body, imageAnnotations } = preprocessMarkdown(text);
  editor.commands.setContent(body);
  if (typeof editor.commands.initComments === "function") {
    editor.commands.initComments(comments);
  }
  // 画像アノテーションを復元
  if (imageAnnotations && imageAnnotations.size > 0) {
    let imgIndex = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image") {
        const src = (node.attrs.src as string) ?? "";
        const key = src.length > 100 ? `img${imgIndex}:${src.slice(0, 20)}` : `img${imgIndex}:${src}`;
        const data = imageAnnotations.get(key);
        if (data) {
          const { tr } = editor.state;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, annotations: data });
          editor.view.dispatch(tr);
        }
        imgIndex++;
      }
    });
  }
  return { frontmatter, comments, body };
}
