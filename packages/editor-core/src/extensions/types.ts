import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

/** tiptap-markdown serializer state (minimal interface) */
export interface MdSerializerState {
  write(s: string): void;
  renderInline(node: PMNode): void;
  ensureNewLine(): void;
  closeBlock(node: PMNode): void;
  inTable?: boolean;
}

/** tiptap-markdown storage type */
export interface MarkdownStorage {
  markdown: {
    getMarkdown: () => string;
    parser: { parse: (content: string) => PMNode };
  };
}

/** tiptap-markdown の storage から markdown を取得するヘルパー */
export function getMarkdownFromEditor(editor: Editor): string {
  const md = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
  // tiptap-markdown の image シリアライザは closeBlock() を呼ばないため、
  // 画像直後のコードフェンスとの間に改行が出力されないことがある。
  // 改行が0個または1個の場合に空行（\n\n）を補完する。
  return md.replace(/([^\n])\n?(```)/gm, "$1\n\n$2");
}
