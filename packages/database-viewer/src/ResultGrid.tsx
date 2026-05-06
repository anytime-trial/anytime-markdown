"use client";

import { Box } from "@mui/material";
import React, { useSyncExternalStore } from "react";
import type { SheetAdapter } from "@anytime-markdown/spreadsheet-core";
import {
  type PaginationProps,
  SpreadsheetEditor,
} from "@anytime-markdown/spreadsheet-viewer";

export interface ResultGridProps {
  readonly adapter: SheetAdapter;
  readonly pagination?: PaginationProps;
  readonly themeMode?: "light" | "dark";
}

export const ResultGrid: React.FC<Readonly<ResultGridProps>> = ({
  adapter,
  pagination,
  themeMode,
}) => {
  // 対象テーブル / クエリ結果のカラム数だけグリッド列を表示する
  const colCount = useSyncExternalStore(
    (l) => adapter.subscribe(l),
    () => adapter.getColumnHeaders?.().length ?? 0,
    () => 0,
  );
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <SpreadsheetEditor
        adapter={adapter}
        pagination={pagination}
        themeMode={themeMode}
        showImportExport={false}
        showToolbar={false}
        gridCols={colCount > 0 ? colCount : undefined}
      />
    </Box>
  );
};
