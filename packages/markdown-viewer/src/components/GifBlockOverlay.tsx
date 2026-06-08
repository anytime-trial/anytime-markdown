"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useEditorState } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useMarkdownT } from "../i18n/context";
import type { GifSettings } from "../utils/gifEncoder";
import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { GifPlayerDialog } from "./GifPlayerDialog";
import { GifRecorderDialog } from "./GifRecorderDialog";
import { GIF_RECORD_INTENT_EVENT } from "./GifBlockContent";

/**
 * gifBlock の編集 chrome をページ層で提供する選択駆動オーバーレイ（React）。
 *
 * framework-decoupling Phase 2「反転」設計の chrome 側。content は native
 * {@link createGifBlockNodeView}（React 非依存）が描画し、本コンポーネントが
 * 選択中の gifBlock に対しツールバー＋ダイアログを供給する。
 *
 * PoC スコープ: 単一エディタ・編集モード。compare/merge モードと collapsed の
 * 細部は横展開時に補完する（TODO）。
 */
export function GifBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const gifBlobRef = useRef<Blob | null>(null);
  const pendingSaveIdRef = useRef<string | null>(null);

  // 選択中の gifBlock の pos（NodeSelection のみ。なければ -1）。
  const selectedPos = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor;
      if (!ed) return -1;
      const sel = ed.state.selection as { node?: { type: { name: string } }; from: number };
      return sel?.node?.type?.name === "gifBlock" ? sel.from : -1;
    },
  }) ?? -1;

  const node =
    editor && selectedPos >= 0 ? editor.state.doc.nodeAt(selectedPos) : null;
  const src = (node?.attrs.src as string) ?? "";

  // 選択中ブロックの画面位置をツールバー配置のため計測する。
  const measure = useCallback(() => {
    if (!editor || selectedPos < 0) {
      setRect(null);
      return;
    }
    const dom = editor.view.nodeDOM(selectedPos) as HTMLElement | null;
    setRect(dom ? dom.getBoundingClientRect() : null);
  }, [editor, selectedPos]);

  useEffect(() => {
    measure();
    if (selectedPos < 0) return;
    globalThis.addEventListener("scroll", measure, true);
    globalThis.addEventListener("resize", measure);
    return () => {
      globalThis.removeEventListener("scroll", measure, true);
      globalThis.removeEventListener("resize", measure);
    };
  }, [measure, selectedPos]);

  /** 選択中 gifBlock の属性を更新する（per-NodeView updateAttributes の代替）。 */
  const updateNodeAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor || selectedPos < 0) return;
      editor
        .chain()
        .command(({ tr }) => {
          for (const [k, v] of Object.entries(attrs)) {
            tr.setNodeAttribute(selectedPos, k, v);
          }
          return true;
        })
        .run();
    },
    [editor, selectedPos],
  );

  const handleDelete = useCallback(() => {
    if (!editor || selectedPos < 0) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const n = state.doc.nodeAt(selectedPos);
        if (!n) return false;
        tr.delete(selectedPos, selectedPos + n.nodeSize);
        return true;
      })
      .run();
    setDeleteOpen(false);
  }, [editor, selectedPos]);

  const handleEdit = useCallback(() => {
    if (src) setPlayerOpen(true);
    else setRecorderOpen(true);
  }, [src]);

  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      setRecorderOpen(false);
      gifBlobRef.current = blob;
      const requestId =
        globalThis.crypto?.randomUUID?.() ?? `gif-${fileName}-${performance.now()}`;
      pendingSaveIdRef.current = requestId;
      const vscodeApi = window.__vscode;
      const reader = new FileReader();
      if (vscodeApi) {
        reader.onload = () => {
          if (typeof reader.result !== "string") return;
          vscodeApi.postMessage({
            type: "saveClipboardImage",
            dataUrl: reader.result,
            fileName,
            requestId,
          });
        };
        reader.readAsDataURL(blob);
        updateNodeAttrs({ gifSettings: JSON.stringify(settings) });
      } else {
        reader.onload = () => {
          updateNodeAttrs({
            src: reader.result,
            alt: fileName,
            gifSettings: JSON.stringify(settings),
          });
        };
        reader.readAsDataURL(blob);
      }
    },
    [updateNodeAttrs],
  );

  // native NodeView（placeholder クリック）からの録画意図を購読する。
  useEffect(() => {
    const root = editor?.view?.dom as HTMLElement | undefined;
    if (!root || typeof root.addEventListener !== "function") return;
    const handler = () => setRecorderOpen(true);
    root.addEventListener(GIF_RECORD_INTENT_EVENT, handler as EventListener);
    return () =>
      root.removeEventListener(GIF_RECORD_INTENT_EVENT, handler as EventListener);
  }, [editor]);

  // VS Code 保存結果（imageSaved）を requestId 一致で取り込む（録画フロー）。
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin &&
        !event.origin.startsWith("vscode-webview://") &&
        event.origin !== globalThis.location?.origin
      )
        return;
      const data = event.data;
      if (
        data?.type === "imageSaved" &&
        typeof data.requestId === "string" &&
        data.requestId === pendingSaveIdRef.current &&
        typeof data.path === "string" &&
        data.path
      ) {
        pendingSaveIdRef.current = null;
        updateNodeAttrs({ src: data.path });
      }
    };
    globalThis.addEventListener("message", handler);
    return () => globalThis.removeEventListener("message", handler);
  }, [updateNodeAttrs]);

  // autoEditOpen: スラッシュコマンド作成直後にレコーダを開く。
  useEffect(() => {
    if (node?.attrs.autoEditOpen && editor?.isEditable) {
      updateNodeAttrs({ autoEditOpen: false });
      setRecorderOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPos]);

  const showToolbar = !!editor && !!node && editor.isEditable && !!rect;

  return (
    <>
      {showToolbar &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              zIndex: 20,
            }}
          >
            <BlockInlineToolbar
              label="GIF"
              onEdit={handleEdit}
              onDelete={() => setDeleteOpen(true)}
              t={t}
            />
          </div>,
          document.body,
        )}

      <DeleteBlockDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDelete={handleDelete}
        t={t}
      />
      {recorderOpen && (
        <GifRecorderDialog
          open={recorderOpen}
          onClose={() => setRecorderOpen(false)}
          onComplete={handleRecordComplete}
        />
      )}
      {playerOpen && src && (
        <GifPlayerDialog
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          src={src}
          settings={
            node?.attrs.gifSettings
              ? JSON.parse(node.attrs.gifSettings as string)
              : undefined
          }
        />
      )}
    </>
  );
}
