"use client";

import type { NodeViewProps } from "@tiptap/react";

import type { useTextareaSearch } from "../../hooks/useTextareaSearch";

/** Props shared by all code block sub-components */
export interface CodeBlockSharedProps {
  editor: NodeViewProps["editor"];
  node: NodeViewProps["node"];
  updateAttributes: NodeViewProps["updateAttributes"];
  getPos: NodeViewProps["getPos"];
  /** Whether node is selected in the editor */
  isSelected: boolean;
  /** Code-collapsed state from node attrs */
  codeCollapsed: boolean;
  /** Focus the node */
  selectNode: () => void;
  /** Current text content */
  code: string;
  /** Copy code to clipboard */
  handleCopyCode: () => void;
  /** Delete the block */
  handleDeleteBlock: () => void;
  /** Open delete confirmation dialog */
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  /** Fullscreen state */
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  /** Fullscreen code state */
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: ReturnType<typeof useTextareaSearch>;
  /** Translation function */
  t: (key: string) => string;
  /** Whether dark mode */
  isDark: boolean;
  /** Whether editor is editable */
  isEditable: boolean;
  /** 比較モードの左側（比較元）エディタかどうか */
  isCompareLeft?: boolean;
  /** 比較モードの左側で編集モード（レビューモードではない） */
  isCompareLeftEditable?: boolean;
  /** ブロック要素を画像としてキャプチャ */
  onExport?: () => void;
}

/** DOMPurify config for HTML preview blocks */
export const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "strong", "em", "b", "i", "u", "s", "code", "pre", "sub", "sup", "mark", "small",
    "a", "img",
    "form", "input", "select", "option", "textarea", "button", "label", "fieldset", "legend",
    "details", "summary", "blockquote", "figure", "figcaption",
    "nav", "header", "footer", "main", "section", "article", "aside",
    "dl", "dt", "dd",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "target", "rel",
    "type", "name", "value", "placeholder", "for",
    "colspan", "rowspan", "width", "height",
    "rows", "open",
  ],
  ALLOW_DATA_ATTR: false,
};
