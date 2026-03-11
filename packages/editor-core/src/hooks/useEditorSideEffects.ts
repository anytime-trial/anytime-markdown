import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

import { extractHeadings, getMarkdownFromEditor, type HeadingItem } from "../types";
import { preserveBlankLines,sanitizeMarkdown } from "../utils/sanitizeMarkdown";
import useConfirm from "./useConfirm";

interface UseEditorSideEffectsParams {
  editor: Editor | null;
  isDirty: boolean;
  markDirty: (() => void) | undefined;
  setHeadingsRef: RefObject<(h: HeadingItem[]) => void>;
  setEditorMarkdown: (md: string) => void;
}

export function useEditorSideEffects({
  editor,
  isDirty,
  markDirty,
  setHeadingsRef,
  setEditorMarkdown,
}: UseEditorSideEffectsParams): void {
  const confirm = useConfirm();
  const t = useTranslations("MarkdownEditor");
  const pendingContentRef = useRef<string | null>(null);
  const isDialogOpenRef = useRef(false);
  // ファイル変更検知
  useEffect(() => {
    if (!editor || !markDirty) return;
    const handler = () => markDirty();
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, markDirty]);

  // H-03: 未保存変更の beforeunload 警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // VS Code 拡張からの外部コンテンツ更新（メニュー Undo/Redo など）
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!editor || editor.isDestroyed) return;
      const currentMd = getMarkdownFromEditor(editor);
      if (content === currentMd) return;
      // emitUpdate=false でループを防止（onUpdate → saveContent → contentChanged を抑制）
      editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(content)), { emitUpdate: false });
      setHeadingsRef.current(extractHeadings(editor));
      setEditorMarkdown(getMarkdownFromEditor(editor));
    };
    window.addEventListener('vscode-set-content', handler);
    return () => window.removeEventListener('vscode-set-content', handler);
    // setHeadingsRef, setEditorMarkdown は安定な ref/関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 外部変更の確認ダイアログ（Claude Code、git 操作など）
  useEffect(() => {
    const handler = async (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!editor || editor.isDestroyed) return;

      // ダイアログ表示中は最新のコンテンツのみ保持
      pendingContentRef.current = content;
      if (isDialogOpenRef.current) return;

      isDialogOpenRef.current = true;
      try {
        await confirm({
          open: true,
          title: t("externalChangeTitle"),
          description: t("externalChangeDescription"),
          icon: "info",
        });
        // OK: 最新の外部変更を反映
        const latestContent = pendingContentRef.current;
        if (latestContent !== null && !editor.isDestroyed) {
          editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(latestContent)), { emitUpdate: false });
          setHeadingsRef.current(extractHeadings(editor));
          setEditorMarkdown(getMarkdownFromEditor(editor));
        }
      } catch {
        // キャンセル: 変更を破棄
      } finally {
        pendingContentRef.current = null;
        isDialogOpenRef.current = false;
      }
    };
    window.addEventListener('vscode-external-change', handler);
    return () => window.removeEventListener('vscode-external-change', handler);
    // setHeadingsRef, setEditorMarkdown は安定な ref/関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, confirm, t]);
}
