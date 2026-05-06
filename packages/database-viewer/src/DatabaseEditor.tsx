"use client";

import { Box, Chip, Stack } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import type {
  DatabaseAdapter,
  SchemaInfo,
} from "@anytime-markdown/database-core";
import {
  PaginatedSqlSheetAdapter,
  hasTopLevelLimit,
} from "@anytime-markdown/database-core";
import { ResultGrid } from "./ResultGrid";
import { SqlEditorPanel, type SqlRunResult } from "./SqlEditorPanel";
import { TableTree } from "./TableTree";

export interface DatabaseEditorProps {
  readonly adapter: DatabaseAdapter;
  readonly initialSchema?: SchemaInfo;
  readonly queryMaxRows: number;
  readonly themeMode?: "light" | "dark";
  readonly onMutationExecuted?: () => void;
}

const PAGE_SIZES: ReadonlyArray<number> = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 100;

export const DatabaseEditor: React.FC<Readonly<DatabaseEditorProps>> = ({
  adapter,
  initialSchema,
  queryMaxRows,
  themeMode,
  onMutationExecuted,
}) => {
  const [schema, setSchema] = useState<SchemaInfo | null>(initialSchema ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [mode, setMode] = useState<"table" | "query">("table");

  const sheetAdapter = useMemo(
    () =>
      new PaginatedSqlSheetAdapter({
        databaseAdapter: adapter,
        tableName: selected ?? "",
      }),
    [adapter, selected],
  );

  useEffect(() => {
    if (!schema) {
      void adapter.listSchema().then(setSchema);
    }
  }, [schema, adapter]);

  useEffect(() => {
    if (!selected) return;
    setMode("table");
    void adapter.countRows(selected).then(setTotalRows).catch(() => setTotalRows(0));
    void sheetAdapter.loadPage(page, pageSize);
  }, [selected, page, pageSize, sheetAdapter, adapter]);

  const handleRun = async (sql: string): Promise<SqlRunResult> => {
    const limited = hasTopLevelLimit(sql)
      ? sql
      : `${sql.trim().replace(/;\s*$/, "")} LIMIT ${queryMaxRows + 1}`;
    try {
      const result = await adapter.executeSql(limited);
      const truncated = result.rows.length > queryMaxRows;
      const displayRows = truncated ? result.rows.slice(0, queryMaxRows) : result.rows;
      sheetAdapter.applyQueryResult({
        ...result,
        rows: displayRows,
      });
      setMode("query");
      if (result.isMutation) onMutationExecuted?.();
      return {
        columns: result.columns,
        rows: displayRows,
        executionTimeMs: result.executionTimeMs,
        truncated,
      };
    } catch (e) {
      return {
        columns: [],
        rows: [],
        executionTimeMs: 0,
        truncated: false,
        error: (e as Error).message,
      };
    }
  };

  const pagination =
    mode === "table" && selected
      ? {
          page,
          pageSize,
          totalRows,
          availablePageSizes: PAGE_SIZES,
          onChange: ({
            page: p,
            pageSize: ps,
          }: {
            page: number;
            pageSize: number;
          }) => {
            setPage(p);
            setPageSize(ps);
          },
        }
      : undefined;

  return (
    <Stack direction="row" sx={{ height: "100%", overflow: "hidden" }}>
      <Box sx={{ width: 280, borderRight: 1, borderColor: "divider", overflow: "auto" }}>
        <TableTree schema={schema} selected={selected} onSelect={setSelected} />
      </Box>
      <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1 }}>
          {adapter.capabilities.readOnly ? (
            <Chip size="small" color="default" label="read-only" />
          ) : null}
        </Stack>
        <SqlEditorPanel onRun={handleRun} readOnly={adapter.capabilities.readOnly} />
        <ResultGrid adapter={sheetAdapter} pagination={pagination} themeMode={themeMode} />
      </Stack>
    </Stack>
  );
};
