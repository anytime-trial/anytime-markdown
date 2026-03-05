import { createContext, useContext } from "react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { restoreBlankLines } from "./utils/sanitizeMarkdown";
import { postprocessMathBlock } from "./utils/mathHelpers";
import { appendCommentData } from "./utils/commentHelpers";
import { commentDataPluginKey } from "./extensions/commentExtension";
import type { InlineComment } from "./utils/commentHelpers";

export type EncodingLabel = "UTF-8" | "Shift_JIS" | "EUC-JP";

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
  let md = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
  // ZWSP マーカー段落を除去し、元の空行を復元する
  // ※ コードフェンス修正より先に実行する（ZWSP が残っていると正規表現が一致しないため）
  md = restoreBlankLines(md);
  // NOTE: ProseMirror はブロック間を \n\n に正規化するため、
  // 元の \n が \n\n に変わる場合がある。これは ProseMirror の仕様として許容する。
  // ```math フェンスが残っている場合に $$...$$ に変換する（フォールバック）
  md = postprocessMathBlock(md);
  // Plugin State からコメントデータを取得し、末尾に付加
  const commentState = editor.state
    ? commentDataPluginKey.getState(editor.state) as { comments: Map<string, InlineComment> } | undefined
    : undefined;
  if (commentState?.comments && commentState.comments.size > 0) {
    md = appendCommentData(md, commentState.comments);
  }
  return md;
}

/** 翻訳関数の共通型 */
export type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

export type OutlineKind = "heading" | "codeBlock" | "table" | "plantuml" | "mermaid" | "image";

export interface HeadingItem {
  level: number;
  text: string;
  pos: number;
  kind: OutlineKind;
  /** heading 専用の連番インデックス（fold 制御用） */
  headingIndex?: number;
}

/** エディタのドキュメントからアウトライン項目を抽出する */
export function extractHeadings(editor: Editor): HeadingItem[] {
  const items: HeadingItem[] = [];
  let headingCount = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      items.push({
        level: node.attrs.level as number,
        text: node.textContent,
        pos,
        kind: "heading",
        headingIndex: headingCount++,
      });
      return false;
    }
    if (node.type.name === "codeBlock") {
      const lang = (node.attrs.language || "").toLowerCase();
      if (lang === "mermaid") {
        items.push({ level: 6, text: "Mermaid", pos, kind: "mermaid" });
      } else if (lang === "plantuml") {
        items.push({ level: 6, text: "PlantUML", pos, kind: "plantuml" });
      } else {
        items.push({ level: 6, text: node.attrs.language || "Code", pos, kind: "codeBlock" });
      }
      return false;
    }
    if (node.type.name === "table") {
      items.push({ level: 6, text: "Table", pos, kind: "table" });
      return false;
    }
    if (node.type.name === "image") {
      const alt = node.attrs.alt || "Image";
      items.push({ level: 6, text: alt, pos, kind: "image" });
      return false;
    }
  });
  return items;
}

/** PlantUML ツールバー用 Context（NodeView からサンプル選択ポップオーバーを開くため） */
export interface PlantUmlToolbarContextValue {
  setSampleAnchorEl: (el: HTMLElement | null) => void;
}

const noop = () => {};
export const PlantUmlToolbarContext = createContext<PlantUmlToolbarContextValue>({
  setSampleAnchorEl: noop,
});

export function usePlantUmlToolbar() {
  return useContext(PlantUmlToolbarContext);
}
