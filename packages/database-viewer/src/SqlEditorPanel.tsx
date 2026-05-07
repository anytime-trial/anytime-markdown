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
import React, { useState } from "react";

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

export const SqlEditorPanel: React.FC<Readonly<SqlEditorPanelProps>> = ({
  initialSql = "",
  value,
  onValueChange,
  onRun,
  disabled,
}) => {
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
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<SqlRunResult | null>(null);

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
};
