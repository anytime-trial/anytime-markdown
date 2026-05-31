"use client";

import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Box, Button, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { getBgPaper, getDivider, getTextSecondary, getWarningMain } from "../constants/colors";
import { STATUSBAR_FONT_SIZE } from "../constants/dimensions";
import useConfirm from "../hooks/useConfirm";
import type { EncodingLabel, TranslationFn } from "../types";

export interface StatusInfo {
  line: number;
  col: number;
  charCount: number;
  lineCount: number;
  lineEnding: string;
  encoding: string;
}

interface StatusBarProps {
  editor: Editor;
  sourceMode?: boolean;
  sourceText?: string;
  t: TranslationFn;
  fileName?: string | null;
  isDirty?: boolean;
  onLineEndingChange?: (ending: "LF" | "CRLF") => void;
  encoding?: EncodingLabel;
  onEncodingChange?: (encoding: EncodingLabel) => void;
  onStatusChange?: (status: StatusInfo) => void;
  hidden?: boolean;
}

export const StatusBar = React.memo(function StatusBar({ editor, sourceMode, sourceText, t, fileName, isDirty, onLineEndingChange, encoding, onEncodingChange, onStatusChange, hidden }: StatusBarProps) {
  const isDark = useTheme().palette.mode === "dark";
  const confirm = useConfirm();
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [sourceCursorLine, setSourceCursorLine] = useState(1);
  const [sourceCursorCol, setSourceCursorCol] = useState(1);
  const [lineEndingAnchor, setLineEndingAnchor] = useState<HTMLElement | null>(null);
  const [encodingAnchor, setEncodingAnchor] = useState<HTMLElement | null>(null);

  // TipTap エディタのカーソル行
  useEffect(() => {
    const update = () => {
      const { $from } = editor.state.selection;
      setCursorLine($from.index(0) + 1);
      setCursorCol($from.parentOffset + 1);
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
    const col = pos - textarea.value.lastIndexOf("\n", pos - 1);
    setSourceCursorLine(line);
    setSourceCursorCol(col);
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
  const displayCol = sourceMode ? sourceCursorCol : cursorCol;
  const charCount = sourceMode
    ? (sourceText ?? "").length
    : editor.state.doc.textContent.length;
  const lineCount = sourceMode
    ? (sourceText ?? "").split("\n").length
    : editor.state.doc.content.childCount;
  const lineEnding = useMemo(() => (sourceText ?? "").includes("\r\n") ? "CRLF" : "LF", [sourceText]);

  const onStatusChangeRef = React.useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  useEffect(() => {
    onStatusChangeRef.current?.({ line: displayLine, col: displayCol, charCount, lineCount, lineEnding, encoding: encoding ?? "UTF-8" });
  }, [displayLine, displayCol, charCount, lineCount, lineEnding, encoding]);

  if (hidden) return null;

  return (
    <Box id="md-editor-statusbar" role="region" aria-label={t("statusBar")} sx={{ display: "flex", alignItems: "center", gap: 2, px: 1.5, height: 33, minHeight: 33, maxHeight: 33, borderTop: 1, borderColor: getDivider(isDark), overflow: "hidden", flexShrink: 0, position: "fixed", bottom: 0, left: 0, right: 0, bgcolor: getBgPaper(isDark), zIndex: 1 }} contentEditable={false}>
      <Box aria-live="polite" aria-atomic="true" sx={{ display: "contents" }}>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark) }}>
          {t("cursorLine")} {displayLine} {t("cursorCol")} {displayCol}
        </Typography>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark) }}>
          {charCount.toLocaleString()} {t("chars")}
        </Typography>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark) }}>
          {lineCount.toLocaleString()} {t("lines")}
        </Typography>
      </Box>
      {fileName && (
        <Typography variant="body2" sx={{ ml: 1, color: getTextSecondary(isDark), display: { xs: "none", sm: "flex" }, alignItems: "center" }} aria-label={isDirty ? `${fileName} (${t("unsavedChanges")})` : fileName}>
          {fileName}
          {isDirty && (
            <Tooltip title={t("unsavedChanges")}>
              <FiberManualRecordIcon sx={{ fontSize: 8, color: getWarningMain(isDark), ml: 0.5 }} />
            </Tooltip>
          )}
        </Typography>
      )}
      <Box sx={{ flex: 1 }} />
      <Box sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", gap: 2 }}>
        {onLineEndingChange ? (
          <>
            <Button
              size="small"
              onClick={(e) => setLineEndingAnchor(e.currentTarget)}
              sx={{ color: getTextSecondary(isDark), textTransform: "none", minWidth: 0, px: 0.5, py: 0, fontSize: STATUSBAR_FONT_SIZE, lineHeight: 1.43 }}
            >
              {lineEnding}
            </Button>
            <Menu
              anchorEl={lineEndingAnchor}
              open={Boolean(lineEndingAnchor)}
              onClose={() => setLineEndingAnchor(null)}
            >
              {(["LF", "CRLF"] as const).map((opt) => (
                <MenuItem
                  key={opt}
                  selected={opt === lineEnding}
                  onClick={() => {
                    onLineEndingChange(opt);
                    setLineEndingAnchor(null);
                  }}
                >
                  {opt}
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : (
          <Typography variant="body2" sx={{ color: getTextSecondary(isDark) }}>
            {lineEnding}
          </Typography>
        )}
        {onEncodingChange ? (
          <>
            <Button
              size="small"
              onClick={(e) => setEncodingAnchor(e.currentTarget)}
              sx={{ color: getTextSecondary(isDark), textTransform: "none", minWidth: 0, px: 0.5, py: 0, fontSize: STATUSBAR_FONT_SIZE, lineHeight: 1.43 }}
            >
              {encoding ?? "UTF-8"}
            </Button>
            <Menu
              anchorEl={encodingAnchor}
              open={Boolean(encodingAnchor)}
              onClose={() => setEncodingAnchor(null)}
            >
              {(["UTF-8", "Shift_JIS", "EUC-JP"] as const).map((opt) => (
                <MenuItem
                  key={opt}
                  selected={opt === (encoding ?? "UTF-8")}
                  onClick={() => {
                    setEncodingAnchor(null);
                    if (opt === (encoding ?? "UTF-8")) return;
                    confirm({
                      open: true,
                      title: t("encodingChangeConfirm", { encoding: opt }),
                      description: "",
                    }).then(() => {
                      onEncodingChange(opt);
                    }).catch(() => { /* cancelled */ });
                  }}
                >
                  {opt}
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : (
          <Typography variant="body2" sx={{ color: getTextSecondary(isDark) }}>
            {encoding ?? "UTF-8"}
          </Typography>
        )}
      </Box>
    </Box>
  );
});
