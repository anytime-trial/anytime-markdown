import type { AnyExtension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect } from "react";

import { DEBOUNCE_MEDIUM } from "../constants/timing";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { DeleteLineExtension } from "../extensions/deleteLineExtension";
import { ReviewModeExtension, reviewModeStorage } from "../extensions/reviewModeExtension";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { SlashCommandExtension } from "../extensions/slashCommandExtension";
import { SearchReplaceExtension } from "../searchReplaceExtension";
import { ChangeGutterExtension } from "../extensions/changeGutterExtension";
import {
  extractHeadings,
  getMarkdownFromEditor,
  type HeadingItem,
} from "../types";
import { handleBlockClipboardEvent, performBlockCopy, setHandledByKeydown } from "../utils/blockClipboard";
import { setTrailingNewline } from "../utils/editorContentLoader";
import { toGitHubSlug } from "../utils/tocHelpers";

interface HeadingMenuArg {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

interface EditorConfigRefs {
  editor: RefObject<Editor | null>;
  setEditorMarkdown: RefObject<(md: string) => void>;
  setHeadings: RefObject<(h: HeadingItem[]) => void>;
  headingsDebounce: RefObject<ReturnType<typeof setTimeout> | null>;
  handleImport: RefObject<(file: File, nativeHandle?: FileSystemFileHandle) => void>;
  onFileDragOver: RefObject<(over: boolean) => void>;
  slashCommandCallback: RefObject<(state: SlashCommandState) => void>;
}

interface UseEditorConfigParams {
  t: (key: string) => string;
  initialContent: string | null;
  initialTrailingNewline?: boolean;
  saveContent: (md: string) => void;
  refs: EditorConfigRefs;
  setHeadingMenu: (menu: HeadingMenuArg) => void;
}

/** レビューモード時のチェックボックス操作を ProseMirror ドキュメントに反映 */
function handleReviewCheckboxClick(
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
      if (editor2) reviewModeStorage(editor2).enabled = true;
    }
  }, 0);
  return true;
}

/** Ctrl/Cmd+Click 時に対応する見出しへジャンプ */
function jumpToAnchorHeading(editor: Editor, anchorEl: HTMLAnchorElement): void {
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
function handleAnchorLinkClick(
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
function findBlockCandidate(target: HTMLElement): HTMLElement | null {
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
function handleBlockContextMenu(
  target: HTMLElement,
  event: MouseEvent,
  view: EditorView,
  editorRef: RefObject<Editor | null>,
  setHeadingMenu: (menu: HeadingMenuArg) => void,
): boolean {
  const headingEl = target.closest("h1, h2, h3, h4, h5") as HTMLElement | null;
  const blockEl = headingEl ?? findBlockCandidate(target);
  const level = headingEl ? parseInt(headingEl.tagName.substring(1)) : 0;
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

/** Generate a timestamp string for file naming */
function generateTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
}

/** Insert image via VS Code API (save to file) or as base64 */
function insertImageFromFile(
  file: File,
  dataUrl: string,
  view: EditorView,
  pos: number,
): void {
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    const ext = file.type.split("/")[1] || "png";
    const baseName = file.name && !file.name.startsWith("image") ? file.name : `drop-${generateTimestamp()}.${ext}`;
    vscodeApi.postMessage({ type: "saveClipboardImage", dataUrl, fileName: baseName });
  } else {
    const tr = view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: dataUrl, alt: file.name }));
    view.dispatch(tr);
  }
}

/** Insert pasted image via VS Code API or as base64 */
function insertPastedImage(
  file: File,
  dataUrl: string,
  view: EditorView,
): void {
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    const ext = file.type.split("/")[1] || "png";
    const fileName = `paste-${generateTimestamp()}.${ext}`;
    vscodeApi.postMessage({ type: "saveClipboardImage", dataUrl, fileName });
  } else {
    const { from } = view.state.selection;
    const tr = view.state.tr.insert(from, view.state.schema.nodes.image.create({ src: dataUrl, alt: file.name }));
    view.dispatch(tr);
  }
}

/** Try to import a markdown file from a drop event, with optional File System Access API handle */
function tryImportDroppedMdFile(
  mdFile: File,
  event: DragEvent,
  handleImportRef: RefObject<(file: File, nativeHandle?: FileSystemFileHandle) => void>,
): void {
  const items = event.dataTransfer?.items;
  const mdItem = items ? Array.from(items).find((item) => item.kind === "file" && (mdFile.name.endsWith(".md") || mdFile.name.endsWith(".markdown"))) : null;
  const mdItemAny = mdItem as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | null;
  if (mdItemAny?.getAsFileSystemHandle) {
    mdItemAny.getAsFileSystemHandle().then((handle: FileSystemHandle | null) => {
      handleImportRef.current(mdFile, handle?.kind === "file" ? handle as FileSystemFileHandle : undefined);
    }).catch(() => {
      handleImportRef.current(mdFile);
    });
  } else {
    handleImportRef.current(mdFile);
  }
}

export function useEditorConfig({
  t,
  initialContent,
  initialTrailingNewline,
  saveContent,
  refs: {
    editor: editorRef,
    setEditorMarkdown: setEditorMarkdownRef,
    setHeadings: setHeadingsRef,
    headingsDebounce: headingsDebounceRef,
    handleImport: handleImportRef,
    onFileDragOver: onFileDragOverRef,
    slashCommandCallback: slashCommandCallbackRef,
  },
  setHeadingMenu,
}: UseEditorConfigParams) {
  // Clean up debounce timer on unmount
  // headingsDebounceRef は安定な ref オブジェクトのため依存配列から除外
  useEffect(() => {
    return () => {
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    extensions: [
      ...getBaseExtensions(),
      CustomHardBreak,
      DeleteLineExtension,
      SearchReplaceExtension,
      Placeholder.configure({ placeholder: t("placeholder") }),
      SlashCommandExtension.configure({
        onStateChange: (state: SlashCommandState) => slashCommandCallbackRef.current(state),
      }),
      ReviewModeExtension,
      ChangeGutterExtension,
    ],
    editorProps: {
      handleDrop: (view: EditorView, event: DragEvent, _slice: Slice, moved: boolean) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        const mdFile = Array.from(event.dataTransfer.files).find((f) => f.name.endsWith(".md") || f.name.endsWith(".markdown") || f.type === "text/markdown");
        if (mdFile) {
          event.preventDefault();
          tryImportDroppedMdFile(mdFile, event, handleImportRef);
          return true;
        }
        const images = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        images.forEach((file: File) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") return;
            insertImageFromFile(file, reader.result, view, pos);
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
        // テキストまたはHTMLが含まれる場合はTipTapのデフォルト処理に委ねる
        // （Excel等はimage/pngとtext/htmlの両方を含むため、画像優先を抑制）
        const hasText = Array.from(items).some((item) => item.type === "text/plain" || item.type === "text/html");
        if (hasText) return false;
        event.preventDefault();
        images.forEach((item) => {
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== "string") return;
            insertPastedImage(file, reader.result, view);
          };
          reader.readAsDataURL(file);
        });
        return true;
      },
      handleDOMEvents: {
        dragover: (_view: EditorView, event: DragEvent) => {
          if (event.dataTransfer?.types.includes("Files")) {
            onFileDragOverRef.current(true);
          }
          return false;
        },
        dragleave: (_view: EditorView, event: DragEvent) => {
          // エディタ外に出たときだけ解除
          if (!_view.dom.contains(event.relatedTarget as Node)) {
            onFileDragOverRef.current(false);
          }
          return false;
        },
        drop: () => {
          onFileDragOverRef.current(false);
          return false;
        },
        keydown: (_view: EditorView, event: KeyboardEvent) => {
          if (event.key === "Control" || event.key === "Meta") {
            _view.dom.classList.add("ctrl-held");
          }
          // VS Code WebView: copy イベントが到達しないため keydown で処理
          if (window.__vscode && (event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "x")) {
            const isCut = event.key === "x";
            const handled = performBlockCopy(_view, isCut, (text) => {
              window.__vscode!.postMessage({ type: "writeClipboard", text });
            });
            if (handled) {
              setHandledByKeydown(true);
              event.preventDefault();
              return true;
            }
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

          if (handleReviewCheckboxClick(target, editorRef, saveContent)) return false;
          if (handleAnchorLinkClick(target, event, editorRef)) return true;
          if (handleBlockContextMenu(target, event, _view, editorRef, setHeadingMenu)) return true;

          return false;
        },
        copy: (view: EditorView, event: ClipboardEvent) => {
          if (handleBlockClipboardEvent(view, event, false)) return true;
          return false;
        },
        cut: (view: EditorView, event: ClipboardEvent) => {
          if (handleBlockClipboardEvent(view, event, true)) return true;
          return false;
        },
      },
    },
    content: initialContent ?? "",
    autofocus: "start" as const,
    onUpdate: ({ editor: e }: { editor: Editor }) => {
      const md = getMarkdownFromEditor(e);
      saveContent(md);
      setEditorMarkdownRef.current(md);
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
      headingsDebounceRef.current = setTimeout(() => {
        setHeadingsRef.current(extractHeadings(e));
      }, DEBOUNCE_MEDIUM);
    },
    onCreate: ({ editor: e }: { editor: Editor }) => {
      // 初期コンテンツの末尾改行フラグを storage に記録
      // （applyMarkdownToEditor と同じキーで、getMarkdownFromEditor が参照する）
      setTrailingNewline(e, !!initialTrailingNewline);
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
