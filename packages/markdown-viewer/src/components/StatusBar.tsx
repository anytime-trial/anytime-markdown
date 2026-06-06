"use client";

import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Menu, MenuItem, Tooltip } from "@mui/material";
import { Button } from "../ui/Button";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@anytime-markdown/markdown-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { getBgPaper, getDivider, getTextSecondary, getWarningMain } from "../constants/colors";
import { STATUSBAR_FONT_SIZE } from "../constants/dimensions";
import useConfirm from "../hooks/useConfirm";
import type { EncodingLabel, TranslationFn } from "../types";
import { Text } from "../ui/Text";
import styles from "./StatusBar.module.css";

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
    <div
      id="md-editor-statusbar"
      role="region"
      aria-label={t("statusBar")}
      contentEditable={false}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        paddingLeft: 12,
        paddingRight: 12,
        height: 33,
        minHeight: 33,
        maxHeight: 33,
        borderTop: `1px solid ${getDivider(isDark)}`,
        overflow: "hidden",
        flexShrink: 0,
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: getBgPaper(isDark),
        zIndex: 1,
      }}
    >
      <div aria-live="polite" aria-atomic="true" style={{ display: "contents" }}>
        <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>
          {t("cursorLine")} {displayLine} {t("cursorCol")} {displayCol}
        </Text>
        <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>
          {charCount.toLocaleString()} {t("chars")}
        </Text>
        <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>
          {lineCount.toLocaleString()} {t("lines")}
        </Text>
      </div>
      {fileName && (
        <Text
          variant="body2"
          component="span"
          className={styles.smFlex}
          style={{ marginLeft: 8, color: getTextSecondary(isDark) }}
          aria-label={isDirty ? `${fileName} (${t("unsavedChanges")})` : fileName}
        >
          {fileName}
          {isDirty && (
            <Tooltip title={t("unsavedChanges")}>
              <FiberManualRecordIcon sx={{ fontSize: 8, color: getWarningMain(isDark), ml: 0.5 }} />
            </Tooltip>
          )}
        </Text>
      )}
      <div style={{ flex: 1 }} />
      <div className={styles.smFlex} style={{ gap: 16 }}>
        {onLineEndingChange ? (
          <>
            <Button
              size="small"
              onClick={(e) => setLineEndingAnchor(e.currentTarget)}
              className={styles.statusBtn}
              style={{ color: getTextSecondary(isDark), fontSize: STATUSBAR_FONT_SIZE }}
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
          <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>
            {lineEnding}
          </Text>
        )}
        {onEncodingChange ? (
          <>
            <Button
              size="small"
              onClick={(e) => setEncodingAnchor(e.currentTarget)}
              className={styles.statusBtn}
              style={{ color: getTextSecondary(isDark), fontSize: STATUSBAR_FONT_SIZE }}
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
          <Text variant="body2" style={{ color: getTextSecondary(isDark) }}>
            {encoding ?? "UTF-8"}
          </Text>
        )}
      </div>
    </div>
  );
});
