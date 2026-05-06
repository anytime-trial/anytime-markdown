"use client";

import { Box } from "@mui/material";
import React from "react";
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
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <SpreadsheetEditor
        adapter={adapter}
        pagination={pagination}
        themeMode={themeMode}
        showImportExport={false}
        showToolbar={false}
      />
    </Box>
  );
};
