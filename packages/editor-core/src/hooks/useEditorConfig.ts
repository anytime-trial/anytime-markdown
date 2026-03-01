import type { RefObject } from "react";
import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { DeleteLineExtension } from "../extensions/deleteLineExtension";
import { SearchReplaceExtension } from "../searchReplaceExtension";
import { Details, DetailsSummary } from "../detailsExtension";
import { SlashCommandExtension } from "../extensions/slashCommandExtension";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import {
  getMarkdownFromEditor,
  extractHeadings,
  type HeadingItem,
} from "../types";

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    ],
    editorProps: {
      handleDrop: (view: any, event: DragEvent, _slice: any, moved: boolean) => {
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
      handlePaste: (view: any, event: ClipboardEvent) => {
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
        click: (_view: any, event: MouseEvent) => {
          const target = event.target as HTMLElement;
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
        copy: (view: any, event: ClipboardEvent) => {
          const { $from, $to } = view.state.selection;
          if ($from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
            if (!event.clipboardData) return false;
            event.clipboardData.setData("text/plain", view.state.doc.textBetween($from.pos, $to.pos));
            event.preventDefault();
            return true;
          }
          return false;
        },
        cut: (view: any, event: ClipboardEvent) => {
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
      const bqExt = e.extensionManager.extensions.find((ext: any) => ext.name === "blockquote");
      if (bqExt?.storage?.markdown) {
        bqExt.storage.markdown.serialize = (state: any, node: any) => {
          state.wrapBlock("> ", null, node, () => state.renderContent(node));
        };
      }
    },
    immediatelyRender: false,
  };
}
