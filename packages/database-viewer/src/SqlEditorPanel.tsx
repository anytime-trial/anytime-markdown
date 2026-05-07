"use client";

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Alert,
  Box,
  Button,
  Collapse,
  IconButton,
  Stack,
  TextareaAutosize,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";

export interface SqlRunResult {
  readonly columns: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly executionTimeMs: number;
  readonly truncated: boolean;
  readonly error?: string;
}

export interface SqlEditorPanelProps {
  readonly initialSql?: string;
  /** controlled mode: 値を親で保持する場合に指定 */
  readonly value?: string;
  readonly onValueChange?: (sql: string) => void;
  readonly onRun: (sql: string) => Promise<SqlRunResult>;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
}

export interface SqlEditorPanelHandle {
  /** カーソル位置 (selection range) に文字列を挿入する */
  insertText(text: string): void;
}

export const SqlEditorPanel = forwardRef<SqlEditorPanelHandle, SqlEditorPanelProps>(function SqlEditorPanel({
  initialSql = "",
  value,
  onValueChange,
  onRun,
  disabled,
}, ref) {
  const t = useTranslations("Database");
  const [expanded, setExpanded] = useState(true);
  const [internalSql, setInternalSql] = useState(initialSql);
  const isControlled = value !== undefined;
  const sql = isControlled ? (value ?? "") : internalSql;
  const setSql = (s: string): void => {
    if (isControlled) {
      onValueChange?.(s);
    } else {
      setInternalSql(s);
    }
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<SqlRunResult | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text: string) => {
        const ta = textareaRef.current;
        if (!ta) {
          setSql(sql + text);
          return;
        }
        const start = ta.selectionStart ?? sql.length;
        const end = ta.selectionEnd ?? sql.length;
        const newSql = sql.slice(0, start) + text + sql.slice(end);
        setSql(newSql);
        // 次フレームでカーソルを挿入後の位置に移動
        requestAnimationFrame(() => {
          const t2 = textareaRef.current;
          if (!t2) return;
          t2.focus();
          const cursor = start + text.length;
          t2.setSelectionRange(cursor, cursor);
        });
      },
    }),
    [sql, setSql],
  );

  const onClickRun = async (): Promise<void> => {
    setRunning(true);
    try {
      const r = await onRun(sql);
      setLast(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Stack direction="row" alignItems="center" sx={{ px: 1, py: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t("sqlCollapse") : t("sqlExpand")}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
        <Typography variant="subtitle2">SQL</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {last?.error ? (
          <Typography variant="caption" color="error">
            {t("sqlStatusError")}: {last.error}
          </Typography>
        ) : last ? (
          <Typography variant="caption">
            {t("sqlStatusRows", { count: last.rows.length })} ·{" "}
            {t("sqlStatusTime", { ms: Math.round(last.executionTimeMs) })}
          </Typography>
        ) : (
          <Typography variant="caption">
            {running ? t("sqlStatusRunning") : t("sqlStatusIdle")}
          </Typography>
        )}
      </Stack>
      <Collapse in={expanded}>
        <Stack sx={{ p: 1 }} spacing={1}>
          <TextareaAutosize
            ref={textareaRef}
            minRows={4}
            maxRows={12}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM ..."
            style={{ fontFamily: "monospace", fontSize: 13, padding: 8 }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              onClick={onClickRun}
              disabled={disabled || running || sql.trim().length === 0}
            >
              {t("sqlRun")}
            </Button>
            <Button size="small" onClick={() => setSql("")}>
              {t("sqlClear")}
            </Button>
          </Stack>
          {last?.truncated ? (
            <Alert severity="warning">
              {t("sqlTruncated", { limit: last.rows.length })}
            </Alert>
          ) : null}
        </Stack>
      </Collapse>
    </Box>
  );
});
