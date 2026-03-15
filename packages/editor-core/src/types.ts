import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { createContext, useContext } from "react";

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

/** editor.storage を汎用 Record として取得する型安全ヘルパー */
export function getEditorStorage(editor: Editor): Record<string, Record<string, unknown>> {
  return editor.storage as unknown as Record<string, Record<string, unknown>>;
}

/** editor.storage から tiptap-markdown の storage を取得する型安全ヘルパー */
export function getMarkdownStorage(editor: Editor): MarkdownStorage["markdown"] {
  return (editor.storage as unknown as MarkdownStorage).markdown;
}

// getMarkdownFromEditor は utils/markdownSerializer.ts に分離
// 後方互換のため re-export
export { getMarkdownFromEditor } from "./utils/markdownSerializer";

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
