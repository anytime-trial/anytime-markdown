"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import type { Editor } from "@tiptap/react";

interface StatusBarProps {
  editor: Editor;
  sourceMode?: boolean;
  sourceText?: string;
  t: (key: string) => string;
}

export function StatusBar({ editor, sourceMode, sourceText, t }: StatusBarProps) {
  const [cursorLine, setCursorLine] = useState(1);
  const [sourceCursorLine, setSourceCursorLine] = useState(1);

  // TipTap エディタのカーソル行
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

  // ソースモード textarea のカーソル行を監視
  const handleSourceCursor = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea[aria-label]");
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
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 1.5, py: 0.5, borderTop: 1, borderColor: "divider" }} contentEditable={false}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {t("cursorLine")} {displayLine}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {charCount.toLocaleString()} {t("chars")}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {lineCount.toLocaleString()} {t("lines")}
      </Typography>
      <Box sx={{ flex: 1 }} />
    </Box>
  );
}
