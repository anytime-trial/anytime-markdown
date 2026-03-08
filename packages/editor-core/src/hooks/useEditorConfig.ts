import type { RefObject } from "react";
import { useEffect } from "react";
import type { AnyExtension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import type { Slice, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { DeleteLineExtension } from "../extensions/deleteLineExtension";
import { SearchReplaceExtension } from "../searchReplaceExtension";
import { Details, DetailsSummary } from "../detailsExtension";
import { SlashCommandExtension } from "../extensions/slashCommandExtension";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { ReviewModeExtension, reviewModeStorage } from "../extensions/reviewModeExtension";
import {
  getMarkdownFromEditor,
  extractHeadings,
  type HeadingItem,
} from "../types";
import { toGitHubSlug } from "../utils/tocHelpers";

interface HeadingMenuArg {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

interface UseEditorConfigParams {
  t: (key: string) => string;
  initialContent: string | null;
  saveContent: (md: string) => void;
  editorRef: RefObject<Editor | null>;
  setEditorMarkdownRef: RefObject<(md: string) => void>;
  setHeadingsRef: RefObject<(h: HeadingItem[]) => void>;
  headingsDebounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  handleImportRef: RefObject<(file: File) => void>;
  setHeadingMenu: (menu: HeadingMenuArg) => void;
  slashCommandCallbackRef: RefObject<(state: SlashCommandState) => void>;
}

export function useEditorConfig({
  t,
  initialContent,
  saveContent,
  editorRef,
  setEditorMarkdownRef,
  setHeadingsRef,
  headingsDebounceRef,
  handleImportRef,
  setHeadingMenu,
  slashCommandCallbackRef,
}: UseEditorConfigParams) {
  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
    };
  }, []);

  return {
    extensions: [
      ...getBaseExtensions(),
      CustomHardBreak,
      DeleteLineExtension,
      SearchReplaceExtension,
      Details,
      DetailsSummary,
      Placeholder.configure({ placeholder: t("placeholder") }),
      SlashCommandExtension.configure({
        onStateChange: (state: SlashCommandState) => slashCommandCallbackRef.current(state),
      }),
      ReviewModeExtension,
    ],
    editorProps: {
      handleDrop: (view: EditorView, event: DragEvent, _slice: Slice, moved: boolean) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        const mdFile = Array.from(event.dataTransfer.files).find((f) => f.name.endsWith(".md") || f.type === "text/markdown");
        if (mdFile) { event.preventDefault(); handleImportRef.current(mdFile); return true; }
        const images = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        images.forEach((file: File) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") return;
            const tr = view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: reader.result, alt: file.name }));
            view.dispatch(tr);
          };
          reader.readAsDataURL(file);
        });
        return true;
      },
      handlePaste: (view: EditorView, event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const images = Array.from(items).filter((item) => item.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        images.forEach((item) => {
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") return;
            const { from } = view.state.selection;
            const tr = view.state.tr.insert(from, view.state.schema.nodes.image.create({ src: reader.result, alt: file.name }));
            view.dispatch(tr);
          };
          reader.readAsDataURL(file);
        });
        return true;
      },
      handleDOMEvents: {
        keydown: (_view: EditorView, event: KeyboardEvent) => {
          if (event.key === "Control" || event.key === "Meta") {
            _view.dom.classList.add("ctrl-held");
          }
          return false;
        },
        keyup: (_view: EditorView, event: KeyboardEvent) => {
          if (event.key === "Control" || event.key === "Meta") {
            _view.dom.classList.remove("ctrl-held");
          }
          return false;
        },
        blur: (_view: EditorView) => {
          _view.dom.classList.remove("ctrl-held");
          return false;
        },
        mousemove: (_view: EditorView, event: MouseEvent) => {
          const hasCtrl = event.ctrlKey || event.metaKey;
          if (hasCtrl !== _view.dom.classList.contains("ctrl-held")) {
            _view.dom.classList.toggle("ctrl-held", hasCtrl);
          }
          return false;
        },
        mousedown: (_view: EditorView, event: MouseEvent) => {
          // #anchor リンクのブラウザデフォルト遷移を mousedown 段階で防止
          const anchor = (event.target as HTMLElement).closest("a[href^='#']");
          if (anchor) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        click: (_view: EditorView, event: MouseEvent) => {
          const target = event.target as HTMLElement;
          // レビューモード時のチェックボックス操作: ProseMirror ドキュメントに反映して保存
          // (readonlyモードではCSSでpointerEvents:noneのためここに到達しない)
          const isFilterActive = editorRef.current ? reviewModeStorage(editorRef.current).enabled : false;
          if (isFilterActive && target instanceof HTMLInputElement && target.type === "checkbox") {
            const li = target.closest("li[data-checked]") as HTMLElement | null;
            if (li) {
              setTimeout(() => {
                const editor = editorRef.current;
                if (!editor) return;
                try {
                  const checked = target.checked;
                  const pos = editor.view.posAtDOM(li, 0);
                  const nodePos = pos - 1;
                  const node = editor.state.doc.nodeAt(nodePos);
                  if (!node || node.type.name !== "taskItem") return;
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
                  if (editor2) {
                    reviewModeStorage(editor2).enabled = true;
                  }
                }
              }, 0);
              return false;
            }
          }
          // #anchor リンク: 通常クリックは無効化、Ctrl/Cmd+Click で見出しにジャンプ
          const anchorEl = target.closest("a[href^='#']") as HTMLAnchorElement | null;
          if (anchorEl) {
            event.preventDefault();
            event.stopPropagation();
            if ((event.ctrlKey || event.metaKey) && editorRef.current) {
              const slug = decodeURIComponent(anchorEl.getAttribute("href")!.slice(1));
              const headings = extractHeadings(editorRef.current).filter((h) => h.kind === "heading");
              const usedSlugs = new Map<string, number>();
              for (const h of headings) {
                const s = toGitHubSlug(h.text, usedSlugs);
                if (s === slug) {
                  const editor = editorRef.current;
                  editor.chain().setTextSelection(h.pos + 1).run();
                  const domAtPos = editor.view.domAtPos(h.pos + 1);
                  const node = domAtPos.node instanceof HTMLElement
                    ? domAtPos.node : domAtPos.node.parentElement;
                  if (node) {
                    const dom = editor.view.dom; // .tiptap（スクロールコンテナ）
                    const nodeTop = node.offsetTop - dom.offsetTop;
                    dom.scrollTo({ top: nodeTop, behavior: "smooth" });
                  }
                  break;
                }
              }
            }
            return true;
          }
          const headingEl = target.closest("h1, h2, h3, h4, h5") as HTMLElement | null;
          let blockEl: HTMLElement | null = headingEl;
          let level = 0;
          if (headingEl) {
            level = parseInt(headingEl.tagName.substring(1));
          } else {
            // tiptap 直下の p, li, blockquote を検出
            const candidates = ["li", "p", "blockquote"] as const;
            for (const sel of candidates) {
              const el = target.closest(sel) as HTMLElement | null;
              if (el) {
                // tiptap 直下、または直下の要素の子孫であること
                let parent: HTMLElement | null = el;
                while (parent && !parent.classList.contains("tiptap")) {
                  parent = parent.parentElement;
                }
                if (parent) { blockEl = el; break; }
              }
            }
          }
          if (!blockEl) return false;
          const rect = blockEl.getBoundingClientRect();
          if (event.clientX < rect.left) {
            event.preventDefault();
            // blockquote の場合は内部の最初の p から位置を取得
            const posTarget = blockEl.tagName.toLowerCase() === "blockquote"
              ? (blockEl.querySelector("p") ?? blockEl)
              : blockEl;
            const pos = _view.posAtDOM(posTarget, 0);
            editorRef.current?.chain().setTextSelection(pos).run();
            setHeadingMenu({ anchorEl: blockEl, pos, currentLevel: level });
            return true;
          }
          return false;
        },
        copy: (view: EditorView, event: ClipboardEvent) => {
          const { $from, $to } = view.state.selection;
          if ($from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
            if (!event.clipboardData) return false;
            event.clipboardData.setData("text/plain", view.state.doc.textBetween($from.pos, $to.pos));
            event.preventDefault();
            return true;
          }
          return false;
        },
        cut: (view: EditorView, event: ClipboardEvent) => {
          const { $from, $to } = view.state.selection;
          if ($from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
            if (!event.clipboardData) return false;
            event.clipboardData.setData("text/plain", view.state.doc.textBetween($from.pos, $to.pos));
            event.preventDefault();
            view.dispatch(view.state.tr.deleteSelection());
            return true;
          }
          return false;
        },
      },
    },
    content: initialContent ?? "",
    onUpdate: ({ editor: e }: { editor: Editor }) => {
      const md = getMarkdownFromEditor(e);
      saveContent(md);
      setEditorMarkdownRef.current(md);
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
      headingsDebounceRef.current = setTimeout(() => {
        setHeadingsRef.current(extractHeadings(e));
      }, 300);
    },
    onCreate: ({ editor: e }: { editor: Editor }) => {
      setHeadingsRef.current(extractHeadings(e));
      setEditorMarkdownRef.current(getMarkdownFromEditor(e));
      // 引用ブロックのマークダウン出力で継続行に > を付加しない（lazy blockquote）
      const bqExt = e.extensionManager.extensions.find((ext: AnyExtension) => ext.name === "blockquote");
      if (bqExt?.storage?.markdown) {
        bqExt.storage.markdown.serialize = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
          state.wrapBlock("> ", null, node, () => state.renderContent(node));
        };
      }
    },
    immediatelyRender: false,
  };
}
