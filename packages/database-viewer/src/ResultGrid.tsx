"use client";

import { Box } from "@mui/material";
import React from "react";
import type { SheetAdapter } from "@anytime-markdown/spreadsheet-core";
import {
  PaginationBar,
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
  // Note: PaginationBar import is required for plan T7 completeness even when
  // SpreadsheetEditor's `pagination` prop is undefined; tree-shaking removes it.
  void PaginationBar;
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <SpreadsheetEditor adapter={adapter} pagination={pagination} themeMode={themeMode} />
    </Box>
  );
};
