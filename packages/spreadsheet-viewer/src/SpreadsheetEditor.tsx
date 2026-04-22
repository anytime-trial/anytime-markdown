"use client";

import type { SheetAdapter, SheetSnapshot } from "@anytime-markdown/spreadsheet-core";
import { createInMemorySheetAdapter, parseCsv, serializeCsv } from "@anytime-markdown/spreadsheet-core";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon from "@mui/icons-material/Upload";
import { Box, Button, Stack } from "@mui/material";
import { useTranslations } from "next-intl";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { SpreadsheetGrid } from "./SpreadsheetGrid";

interface SpreadsheetEditorProps {
    readonly themeMode?: "light" | "dark";
    readonly adapter?: SheetAdapter;
    readonly gridRows?: number;
    readonly gridCols?: number;
    readonly headerRight?: React.ReactNode;
    readonly showApply?: boolean;
    readonly showRange?: boolean;
    readonly onDirtyChange?: (dirty: boolean) => void;
    readonly onClose?: () => void;
    readonly onUndo?: () => void;
    readonly onRedo?: () => void;
}

type Format = "csv" | "tsv";

function delimiterOf(format: Format): "," | "\t" {
    return format === "csv" ? "," : "\t";
}

function triggerDownload(filename: string, text: string, mime: string): void {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export const SpreadsheetEditor: React.FC<Readonly<SpreadsheetEditorProps>> = ({
    themeMode = "light",
    adapter: externalAdapter,
    gridRows,
    gridCols,
    headerRight,
    showApply = false,
    showRange = false,
    onDirtyChange,
    onClose,
    onUndo,
    onRedo,
}) => {
    const t = useTranslations("Spreadsheet");
    const fallbackAdapter = useMemo(() => createInMemorySheetAdapter(), []);
    const adapter = externalAdapter ?? fallbackAdapter;
    const isDark = themeMode === "dark";
    const inputRef = useRef<HTMLInputElement>(null);
    const [pendingFormat, setPendingFormat] = useState<Format>("csv");

    const handleImportClick = useCallback((format: Format) => {
        setPendingFormat(format);
        inputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const text = await file.text();
            const snap: SheetSnapshot = parseCsv(text, { delimiter: delimiterOf(pendingFormat) });
            adapter.replaceAll(snap);
        },
        [adapter, pendingFormat],
    );

    const handleExport = useCallback((format: Format) => {
        const text = serializeCsv(adapter.getSnapshot(), { delimiter: delimiterOf(format) });
        const ext = format === "csv" ? "csv" : "tsv";
        const mime = format === "csv" ? "text/csv" : "text/tab-separated-values";
        triggerDownload(`sheet.${ext}`, text, mime);
    }, [adapter]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Stack direction="row" spacing={1} sx={{ p: 1, flexShrink: 0 }}>
                <Button size="small" startIcon={<UploadIcon />} onClick={() => handleImportClick("csv")}>
                    {t("importCsv")}
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={() => handleExport("csv")}>
                    {t("exportCsv")}
                </Button>
                <Button size="small" startIcon={<UploadIcon />} onClick={() => handleImportClick("tsv")}>
                    {t("importTsv")}
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={() => handleExport("tsv")}>
                    {t("exportTsv")}
                </Button>
                {headerRight}
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    hidden
                    onChange={handleFileChange}
                />
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <SpreadsheetGrid
                    adapter={adapter}
                    isDark={isDark}
                    t={t}
                    gridRows={gridRows}
                    gridCols={gridCols}
                    showApply={showApply}
                    showRange={showRange}
                    onDirtyChange={onDirtyChange}
                    onClose={onClose}
                    onUndo={onUndo}
                    onRedo={onRedo}
                />
            </Box>
        </Box>
    );
};
