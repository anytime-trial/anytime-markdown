import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

import { extractHeadings, getMarkdownFromEditor, type HeadingItem } from "../types";
import { parseFrontmatter } from "../utils/frontmatterHelpers";
import { preserveBlankLines,sanitizeMarkdown } from "../utils/sanitizeMarkdown";

interface UseEditorSideEffectsParams {
  editor: Editor | null;
  isDirty: boolean;
  markDirty: (() => void) | undefined;
  setHeadingsRef: RefObject<(h: HeadingItem[]) => void>;
  setEditorMarkdown: (md: string) => void;
  frontmatterRef?: RefObject<string | null>;
  onFrontmatterChange?: (fm: string | null) => void;
}

export function useEditorSideEffects({
  editor,
  isDirty,
  markDirty,
  setHeadingsRef,
  setEditorMarkdown,
  frontmatterRef,
  onFrontmatterChange,
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
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // VS Code 拡張からの外部コンテンツ更新（メニュー Undo/Redo、Git History など）
  const onFrontmatterChangeRef = useRef(onFrontmatterChange);
  onFrontmatterChangeRef.current = onFrontmatterChange;
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!editor || editor.isDestroyed) return;

      // フロントマターを分離し、本文のみエディタに設定
      const { frontmatter, body } = parseFrontmatter(content);
      if (frontmatterRef) {
        frontmatterRef.current = frontmatter;
      }
      onFrontmatterChangeRef.current?.(frontmatter);

      const currentMd = getMarkdownFromEditor(editor);
      if (body === currentMd) return;
      // emitUpdate=false でループを防止（onUpdate → saveContent → contentChanged を抑制）
      editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(body)), { emitUpdate: false });
      setHeadingsRef.current(extractHeadings(editor));
      setEditorMarkdown(getMarkdownFromEditor(editor));
    };
    globalThis.addEventListener('vscode-set-content', handler);
    return () => globalThis.removeEventListener('vscode-set-content', handler);
    // setHeadingsRef, setEditorMarkdown は安定な ref/関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, frontmatterRef]);

}
