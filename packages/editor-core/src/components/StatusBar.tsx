import { memo, useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

interface StatusBarProps {
  editor: Editor;
  sourceMode?: boolean;
  sourceText?: string;
}

export const StatusBar = memo(function StatusBar({ editor, sourceMode, sourceText }: StatusBarProps) {
  const [cursorLine, setCursorLine] = useState(1);
  const [sourceCursorLine, setSourceCursorLine] = useState(1);

  useEffect(() => {
    const update = () => {
      const { $from } = editor.state.selection;
      setCursorLine($from.index(0) + 1);
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
    };
  }, [editor]);

  const handleSourceCursor = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea.source-editor");
    if (!textarea) return;
    const pos = textarea.selectionStart ?? 0;
    const line = (textarea.value.substring(0, pos).match(/\n/g) || []).length + 1;
    setSourceCursorLine(line);
  }, []);

  useEffect(() => {
    if (!sourceMode) return;
    const events = ["click", "keyup", "select"] as const;
    events.forEach((e) => document.addEventListener(e, handleSourceCursor));
    handleSourceCursor();
    return () => {
      events.forEach((e) => document.removeEventListener(e, handleSourceCursor));
    };
  }, [sourceMode, handleSourceCursor]);

  const displayLine = sourceMode ? sourceCursorLine : cursorLine;
  const charCount = sourceMode
    ? (sourceText ?? "").length
    : editor.state.doc.textContent.length;
  const lineCount = sourceMode
    ? (sourceText ?? "").split("\n").length
    : editor.state.doc.content.childCount;

  return (
    <div className="status-bar" contentEditable={false}>
      <span className="status-item">Ln {displayLine}</span>
      <span className="status-item">{charCount.toLocaleString()} chars</span>
      <span className="status-item">{lineCount.toLocaleString()} lines</span>
    </div>
  );
});
