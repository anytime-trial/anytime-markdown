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
  const { frontmatter, comments, body, imageAnnotations, gifSettings } = preprocessMarkdown(text);
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
  // GIF 設定を復元: tiptap-markdown は ![](*.gif) を image ノードとしてパースするため、
  // gifSettings にマッチする image ノードを gifBlock ノードに変換する
  if (gifSettings && gifSettings.size > 0) {
    const gifBlockType = editor.schema.nodes.gifBlock;
    if (gifBlockType) {
      const { tr } = editor.state;
      let offset = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "image" || node.type.name === "gifBlock") {
          const src = (node.attrs.src as string) ?? "";
          const data = gifSettings.get(src);
          if (data) {
            const adjustedPos = pos + offset;
            const newNode = gifBlockType.create({ src, alt: node.attrs.alt ?? "", gifSettings: data });
            tr.replaceWith(adjustedPos, adjustedPos + node.nodeSize, newNode);
            offset += newNode.nodeSize - node.nodeSize;
          }
        }
      });
      if (tr.docChanged) {
        editor.view.dispatch(tr);
      }
    }
  }
  return { frontmatter, comments, body };
}
