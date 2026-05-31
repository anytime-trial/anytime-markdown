import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";

import { reviewModeStorage } from "../extensions/reviewModeExtension";
import {
  extractHeadings,
  getMarkdownFromEditor,
} from "../types";
import { toGitHubSlug } from "./tocHelpers";

interface HeadingMenuArg {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

/** レビューモード時のチェックボックス操作を ProseMirror ドキュメントに反映 */
export function handleReviewCheckboxClick(
  target: HTMLElement,
  editorRef: RefObject<Editor | null>,
  saveContent: (md: string) => void,
): boolean {
  const isFilterActive = editorRef.current ? reviewModeStorage(editorRef.current).enabled : false;
  if (!isFilterActive || !(target instanceof HTMLInputElement) || target.type !== "checkbox") return false;
  const li = target.closest("li[data-checked]") as HTMLElement | null;
  if (!li) return false;
  setTimeout(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const checked = target.checked;
      const pos = editor.view.posAtDOM(li, 0);
      const nodePos = pos - 1;
      const node = editor.state.doc.nodeAt(nodePos);
      if (node?.type.name !== "taskItem") return;
      reviewModeStorage(editor).enabled = false;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(nodePos, undefined, {
          ...node.attrs, checked,
        }),
      );
      saveContent(getMarkdownFromEditor(editor));
      reviewModeStorage(editor).enabled = true;
    } catch {
      const editor2 = editorRef.current;
      if (editor2) reviewModeStorage(editor2).enabled = true;
    }
  }, 0);
  return true;
}

/** Ctrl/Cmd+Click 時に対応する見出しへジャンプ */
export function jumpToAnchorHeading(editor: Editor, anchorEl: HTMLAnchorElement): void {
  const slug = decodeURIComponent((anchorEl.getAttribute("href") ?? "").slice(1));
  const headings = extractHeadings(editor).filter((h) => h.kind === "heading");
  const usedSlugs = new Map<string, number>();
  for (const h of headings) {
    const s = toGitHubSlug(h.text, usedSlugs);
    if (s !== slug) continue;
    editor.chain().setTextSelection(h.pos + 1).run();
    const domAtPos = editor.view.domAtPos(h.pos + 1);
    const node = domAtPos.node instanceof HTMLElement
      ? domAtPos.node : domAtPos.node.parentElement;
    if (node) {
      const dom = editor.view.dom;
      const nodeTop = node.offsetTop - dom.offsetTop;
      dom.scrollTo({ top: nodeTop, behavior: "smooth" });
    }
    break;
  }
}

/** #anchor リンク: 通常クリックは無効化、Ctrl/Cmd+Click で見出しにジャンプ */
export function handleAnchorLinkClick(
  target: HTMLElement,
  event: MouseEvent,
  editorRef: RefObject<Editor | null>,
): boolean {
  const anchorEl = target.closest("a[href^='#']") as HTMLAnchorElement | null;
  if (!anchorEl) return false;
  event.preventDefault();
  event.stopPropagation();
  if ((event.ctrlKey || event.metaKey) && editorRef.current) {
    jumpToAnchorHeading(editorRef.current, anchorEl);
  }
  return true;
}

/** ブロック要素の候補（li, p, blockquote）から tiptap 内の要素を検索 */
export function findBlockCandidate(target: HTMLElement): HTMLElement | null {
  const candidates = ["li", "p", "blockquote"] as const;
  for (const sel of candidates) {
    const el = target.closest(sel) as HTMLElement | null;
    if (!el) continue;
    let parent: HTMLElement | null = el;
    while (parent && !parent.classList.contains("tiptap")) {
      parent = parent.parentElement;
    }
    if (parent) return el;
  }
  return null;
}

/** 見出し・ブロック要素の左余白クリックでコンテキストメニューを表示 */
export function handleBlockContextMenu(
  target: HTMLElement,
  event: MouseEvent,
  view: EditorView,
  editorRef: RefObject<Editor | null>,
  setHeadingMenu: (menu: HeadingMenuArg) => void,
): boolean {
  const headingEl = target.closest("h1, h2, h3, h4, h5") as HTMLElement | null;
  const blockEl = headingEl ?? findBlockCandidate(target);
  const level = headingEl ? Number.parseInt(headingEl.tagName.substring(1)) : 0;
  if (!blockEl) return false;
  const rect = blockEl.getBoundingClientRect();
  if (event.clientX < rect.left) {
    event.preventDefault();
    const posTarget = blockEl.tagName.toLowerCase() === "blockquote"
      ? (blockEl.querySelector("p") ?? blockEl)
      : blockEl;
    const pos = view.posAtDOM(posTarget, 0);
    editorRef.current?.chain().setTextSelection(pos).run();
    setHeadingMenu({ anchorEl: blockEl, pos, currentLevel: level });
    return true;
  }
  return false;
}
