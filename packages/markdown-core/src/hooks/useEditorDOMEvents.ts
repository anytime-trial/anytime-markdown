import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";

import { getCopiedBlockNode, handleBlockClipboardEvent, performBlockCopy, setHandledByKeydown } from "../utils/blockClipboard";
import { handleReviewCheckboxClick, handleAnchorLinkClick, handleBlockContextMenu } from "../utils/editorClickHandlers";
import { insertImageFromFile, insertPastedImage, tryImportDroppedMdFile, requestExternalImageDownloads } from "../utils/editorImageHandlers";

interface HeadingMenuArg {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

interface EditorDOMHandlersParams {
  editorRef: RefObject<Editor | null>;
  handleImportRef: RefObject<(file: File, nativeHandle?: FileSystemFileHandle) => void | Promise<void>>;
  onFileDragOverRef: RefObject<(over: boolean) => void>;
  saveContent: (md: string) => void;
  setHeadingMenu: (menu: HeadingMenuArg) => void;
}

export function createEditorDOMHandlers({
  editorRef,
  handleImportRef,
  onFileDragOverRef,
  saveContent,
  setHeadingMenu,
}: EditorDOMHandlersParams) {
  return {
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
      // VS Code: Ctrl+C でコピーしたブロックノード（画像・テーブル等）があれば挿入
      const copied = getCopiedBlockNode();
      if (copied) {
        event.preventDefault();
        const { $from } = view.state.selection;
        const insertPos = $from.after(1);
        const { tr } = view.state;
        tr.insert(Math.min(insertPos, tr.doc.content.size), copied.copy(copied.content));
        view.dispatch(tr.scrollIntoView());
        return true;
      }
      const items = event.clipboardData?.items;
      if (!items) return false;
      const images = Array.from(items).filter((item) => item.type.startsWith("image/"));
      // テキストまたはHTMLが含まれる場合はTipTapのデフォルト処理に委ねる
      // （Excel等はimage/pngとtext/htmlの両方を含むため、画像優先を抑制）
      const hasText = Array.from(items).some((item) => item.type === "text/plain" || item.type === "text/html");
      if (hasText) {
        // VS Code: HTML 内の外部画像 URL をダウンロード要求
        const vscodeApi = window.__vscode;
        if (vscodeApi) {
          const html = event.clipboardData?.getData("text/html");
          if (html) {
            requestExternalImageDownloads(html, vscodeApi);
          }
        }
        return false;
      }
      if (!images.length) return false;
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
            window.__vscode?.postMessage({ type: "writeClipboard", text });
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
  };
}
