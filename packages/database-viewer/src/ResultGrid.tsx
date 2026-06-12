"use client";

import { Box } from "./ui";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import type { SheetAdapter } from "@anytime-markdown/spreadsheet-core";
import {
  mountSpreadsheetEditor,
  type PaginationProps,
  type SpreadsheetEditorHandle,
} from "@anytime-markdown/spreadsheet-viewer";

import { useDatabaseLocale } from "./i18n/context";

export interface ResultGridProps {
  readonly adapter: SheetAdapter;
  readonly pagination?: PaginationProps;
  readonly themeMode?: "light" | "dark";
  readonly onColumnHeaderDoubleClick?: (col: number) => void;
  /** 行数 (= 行/ページ設定値) に合わせてグリッドの表示行数を絞る */
  readonly visibleRowCount?: number;
}

/**
 * spreadsheet-viewer の脱 React に伴い、vanilla の mountSpreadsheetEditor を
 * useEffect で mount する。themeMode / pagination / grid サイズは handle.update で
 * live 反映し、adapter / locale 変更時のみ再 mount する。
 */
export const ResultGrid: React.FC<Readonly<ResultGridProps>> = ({
  adapter,
  pagination,
  themeMode,
  onColumnHeaderDoubleClick,
  visibleRowCount,
}) => {
  const locale = useDatabaseLocale();
  // 対象テーブル / クエリ結果のカラム数だけグリッド列を表示する
  const colCount = useSyncExternalStore(
    (l) => adapter.subscribe(l),
    () => adapter.getColumnHeaders?.().length ?? 0,
    () => 0,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SpreadsheetEditorHandle | null>(null);
  // mount 時に最新値を読むための ref（live 値は下の update effect で反映）
  const liveRef = useRef({ pagination, themeMode, colCount, visibleRowCount, onColumnHeaderDoubleClick });
  liveRef.current = { pagination, themeMode, colCount, visibleRowCount, onColumnHeaderDoubleClick };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const init = liveRef.current;
    const handle = mountSpreadsheetEditor(container, {
      adapter,
      locale,
      themeMode: init.themeMode,
      pagination: init.pagination,
      showImportExport: false,
      showToolbar: false,
      gridCols: init.colCount > 0 ? init.colCount : undefined,
      gridRows: init.visibleRowCount && init.visibleRowCount > 0 ? init.visibleRowCount : undefined,
      onColumnHeaderDoubleClick: (col) => liveRef.current.onColumnHeaderDoubleClick?.(col),
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
  }, [adapter, locale]);

  useEffect(() => {
    if (themeMode) handleRef.current?.update({ themeMode });
  }, [themeMode]);

  useEffect(() => {
    handleRef.current?.update({ pagination: pagination ?? null });
  }, [pagination]);

  useEffect(() => {
    handleRef.current?.update({
      ...(colCount > 0 ? { gridCols: colCount } : {}),
      ...(visibleRowCount && visibleRowCount > 0 ? { gridRows: visibleRowCount } : {}),
    });
  }, [colCount, visibleRowCount]);

  return (
    <Box
      ref={containerRef}
      style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    />
  );
};
