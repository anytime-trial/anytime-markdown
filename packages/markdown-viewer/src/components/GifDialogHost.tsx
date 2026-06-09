"use client";

import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMarkdownT } from "../i18n/context";
import { deleteBlockAt, setBlockAttrs } from "../chrome/blockChrome";
import { createGifBlockChrome } from "../chrome/gifBlockChrome";
import type { GifSettings } from "../utils/gifEncoder";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { GifPlayerDialog } from "./GifPlayerDialog";
import { GifRecorderDialog } from "./GifRecorderDialog";

/**
 * gifBlock のダイアログ host（framework-decoupling Phase 3 / ホスト隔離）。
 *
 * 選択追従・配置・インラインツールバーは React なしの {@link createGifBlockChrome}
 * が担い、本コンポーネントは録画 / 再生 / 削除ダイアログ（React・重量 UI）と
 * VS Code 保存フローのみを host 側 React として提供する。vanilla chrome からの
 * intent（edit / delete / record）を受けてダイアログを開閉する。
 *
 * すなわち editor + chrome は React-free、React は host（本ダイアログ群）へ隔離される。
 */
export function GifDialogHost({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [playerSrc, setPlayerSrc] = useState("");
  const [playerSettings, setPlayerSettings] = useState<GifSettings | undefined>(undefined);
  // ダイアログ操作の対象 pos（intent 受領時に確定）。完了時に closure から読むため ref。
  const targetPosRef = useRef(-1);
  // VS Code 保存の待機（requestId と保存先 pos の対）。
  const pendingSaveRef = useRef<{ id: string; pos: number } | null>(null);

  // --- vanilla chrome（選択追従 + ツールバー）を生成し intent を購読 ---
  useEffect(() => {
    if (!editor) return;
    const destroy = createGifBlockChrome(editor, {
      t,
      onEdit: (pos, { src, settings }) => {
        targetPosRef.current = pos;
        if (src) {
          setPlayerSrc(src);
          setPlayerSettings(settings ? (JSON.parse(settings) as GifSettings) : undefined);
          setPlayerOpen(true);
        } else {
          setRecorderOpen(true);
        }
      },
      onDelete: (pos) => {
        targetPosRef.current = pos;
        setDeleteOpen(true);
      },
      onRecord: (pos) => {
        targetPosRef.current = pos;
        setRecorderOpen(true);
      },
    });
    return destroy;
  }, [editor, t]);

  const handleDelete = useCallback(() => {
    if (editor) deleteBlockAt(editor, targetPosRef.current);
    setDeleteOpen(false);
  }, [editor]);

  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      setRecorderOpen(false);
      if (!editor) return;
      const pos = targetPosRef.current;
      const requestId =
        globalThis.crypto?.randomUUID?.() ?? `gif-${fileName}-${performance.now()}`;
      const vscodeApi = window.__vscode;
      const reader = new FileReader();
      if (vscodeApi) {
        pendingSaveRef.current = { id: requestId, pos };
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
        setBlockAttrs(editor, pos, { gifSettings: JSON.stringify(settings) });
      } else {
        reader.onload = () => {
          setBlockAttrs(editor, pos, {
            src: reader.result,
            alt: fileName,
            gifSettings: JSON.stringify(settings),
          });
        };
        reader.readAsDataURL(blob);
      }
    },
    [editor],
  );

  // VS Code 保存結果（imageSaved）を requestId 一致で取り込む（録画フロー）。
  // web（__vscode 不在）では到達不能なのでリスナを張らない。
  useEffect(() => {
    if (typeof window === "undefined" || !window.__vscode || !editor) return;
    const handler = (event: MessageEvent) => {
      if (
        event.origin &&
        !event.origin.startsWith("vscode-webview://") &&
        event.origin !== globalThis.location?.origin
      )
        return;
      const data = event.data;
      const pending = pendingSaveRef.current;
      if (
        data?.type === "imageSaved" &&
        typeof data.requestId === "string" &&
        pending &&
        data.requestId === pending.id &&
        typeof data.path === "string" &&
        data.path
      ) {
        pendingSaveRef.current = null;
        setBlockAttrs(editor, pending.pos, { src: data.path });
      }
    };
    globalThis.addEventListener("message", handler);
    return () => globalThis.removeEventListener("message", handler);
  }, [editor]);

  return (
    <>
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
      {playerOpen && playerSrc && (
        <GifPlayerDialog
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          src={playerSrc}
          settings={playerSettings}
        />
      )}
    </>
  );
}
