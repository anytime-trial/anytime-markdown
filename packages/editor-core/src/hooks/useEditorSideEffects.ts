import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect } from "react";
import { getMarkdownFromEditor, extractHeadings, type HeadingItem } from "../types";

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
      editor.commands.setContent(content, { emitUpdate: false });
      setHeadingsRef.current(extractHeadings(editor));
      setEditorMarkdown(getMarkdownFromEditor(editor));
    };
    window.addEventListener('vscode-set-content', handler);
    return () => window.removeEventListener('vscode-set-content', handler);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
}
