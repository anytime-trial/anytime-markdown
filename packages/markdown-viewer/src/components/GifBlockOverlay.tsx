"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMarkdownT } from "../i18n/context";
import { useBlockChrome } from "../hooks/useBlockChrome";
import type { GifSettings } from "../utils/gifEncoder";
import { BlockChromeAnchor } from "./BlockChromeAnchor";
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
 * 選択中の gifBlock に対しツールバー＋ダイアログを供給する。選択検出・位置計測・
 * 属性更新・削除・ツールバー表示判定の共通シェルは {@link useBlockChrome} /
 * {@link BlockChromeAnchor} に委譲し、ここには gif 固有の chrome（録画 / 再生 /
 * VS Code 保存フロー）のみ残す。
 *
 * PoC スコープ: 単一エディタ・編集モード。compare/merge モードと collapsed の
 * 細部は横展開時に補完する（TODO）。
 */
export function GifBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const { pos, node, rect, updateAttrs, deleteOpen, setDeleteOpen, handleDelete, showToolbar } =
    useBlockChrome(editor, "gifBlock");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const pendingSaveIdRef = useRef<string | null>(null);
  const src = (node?.attrs.src as string) ?? "";

  const handleEdit = useCallback(() => {
    if (src) setPlayerOpen(true);
    else setRecorderOpen(true);
  }, [src]);

  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      setRecorderOpen(false);
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
        updateAttrs({ gifSettings: JSON.stringify(settings) });
      } else {
        reader.onload = () => {
          updateAttrs({
            src: reader.result,
            alt: fileName,
            gifSettings: JSON.stringify(settings),
          });
        };
        reader.readAsDataURL(blob);
      }
    },
    [updateAttrs],
  );

  // native NodeView（placeholder クリック）からの録画意図を購読する。
  useEffect(() => {
    const root = editor?.view?.dom;
    if (!root) return;
    const handler = () => setRecorderOpen(true);
    root.addEventListener(GIF_RECORD_INTENT_EVENT, handler as EventListener);
    return () =>
      root.removeEventListener(GIF_RECORD_INTENT_EVENT, handler as EventListener);
  }, [editor]);

  // VS Code 保存結果（imageSaved）を requestId 一致で取り込む（録画フロー）。
  // web（__vscode 不在）では到達不能なのでリスナを張らない。
  useEffect(() => {
    if (typeof window === "undefined" || !window.__vscode) return;
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
        updateAttrs({ src: data.path });
      }
    };
    globalThis.addEventListener("message", handler);
    return () => globalThis.removeEventListener("message", handler);
  }, [updateAttrs]);

  // autoEditOpen: スラッシュコマンド作成直後にレコーダを開く。
  useEffect(() => {
    if (node?.attrs.autoEditOpen && editor?.isEditable) {
      updateAttrs({ autoEditOpen: false });
      setRecorderOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  return (
    <>
      {showToolbar && (
        <BlockChromeAnchor rect={rect}>
          <BlockInlineToolbar
            label="GIF"
            onEdit={handleEdit}
            onDelete={() => setDeleteOpen(true)}
            t={t}
          />
        </BlockChromeAnchor>
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
