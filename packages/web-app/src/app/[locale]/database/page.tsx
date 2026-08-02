"use client";

import type { DatabaseAdapter } from "@anytime-markdown/database-core";
import { DatabaseEditor } from "@anytime-markdown/database-viewer";
import { Box, Button, Stack, useTheme } from "@mui/material";
import React, { Suspense, useEffect, useState } from "react";

import { DatabaseFilePicker } from "./DatabaseFilePicker";

const QUERY_MAX_ROWS_DEFAULT = 1000;

export default function DatabasePage(): React.ReactElement {
  const [adapter, setAdapter] = useState<DatabaseAdapter | null>(null);
  const [modified, setModified] = useState(false);
  const [queryMaxRows, setQueryMaxRows] = useState(QUERY_MAX_ROWS_DEFAULT);
  // database-viewer は自前 UI キットへ移行し MUI テーマを継承しないため、
  // web-app の現在のモードを themeMode で明示的に渡す（ダーク/ライト整合）。
  const theme = useTheme();

  useEffect(() => {
    const stored = globalThis.localStorage?.getItem("anytime-database.queryMaxRows");
    if (stored) setQueryMaxRows(Number(stored) || QUERY_MAX_ROWS_DEFAULT);
  }, []);

  const onPick = async (file: File): Promise<void> => {
    const buf = new Uint8Array(await file.arrayBuffer());
    // 動的 import: sql.js は fs/path の require を含むため SSR 解析を避ける
    const { SqlJsAdapter } = await import("@anytime-markdown/database-core/SqlJsAdapter");
    const a = await SqlJsAdapter.create({
      bytes: buf,
      openMode: "readwrite",
      locateWasm: () => "/sql/sql-wasm.wasm",
    });
    setAdapter(a);
    setModified(false);
  };

  const onDownload = (): void => {
    if (!adapter?.exportBytes) return;
    const bytes = adapter.exportBytes();
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modified.db";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {adapter ? (
        <>
          <Stack direction="row" spacing={1} sx={{ p: 1 }}>
            <Button size="small" onClick={() => setAdapter(null)}>
              Close
            </Button>
            {modified ? (
              <Button size="small" variant="contained" onClick={onDownload}>
                Download
              </Button>
            ) : null}
          </Stack>
          <Suspense fallback={<div>Loading...</div>}>
            <DatabaseEditor
              adapter={adapter}
              queryMaxRows={queryMaxRows}
              themeMode={theme.palette.mode}
              onMutationExecuted={() => setModified(true)}
            />
          </Suspense>
        </>
      ) : (
        <DatabaseFilePicker onPick={onPick} />
      )}
    </Box>
  );
}
