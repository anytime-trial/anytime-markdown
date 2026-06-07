"use client";

import React from "react";

import { useSpreadsheetT } from "./i18n/context";
import {
    Box,
    FirstPageIcon,
    IconButton,
    KeyboardArrowLeftIcon,
    KeyboardArrowRightIcon,
    LastPageIcon,
    Select,
    Stack,
    Text,
} from "./ui";

export interface PaginationProps {
    readonly page: number;
    readonly pageSize: number;
    readonly totalRows: number;
    readonly availablePageSizes: ReadonlyArray<number>;
    readonly onChange: (next: { page: number; pageSize: number }) => void;
    readonly disabled?: boolean;
}

export const PaginationBar: React.FC<Readonly<PaginationProps>> = ({
    page,
    pageSize,
    totalRows,
    availablePageSizes,
    onChange,
    disabled,
}) => {
    const t = useSpreadsheetT("Pager");
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const clampedPage = Math.min(Math.max(1, page), totalPages);

    const goto = (target: number): void => {
        const next = Math.min(Math.max(1, target), totalPages);
        if (next !== clampedPage) onChange({ page: next, pageSize });
    };

    return (
        <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            style={{
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 4,
                paddingBottom: 4,
                borderTop: "1px solid var(--sv-color-divider)",
                flexShrink: 0,
                background: "var(--sv-color-bg-paper)",
            }}
        >
            <IconButton size="small" disabled={disabled || clampedPage <= 1} onClick={() => goto(1)} aria-label={t("first")}>
                <FirstPageIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={disabled || clampedPage <= 1} onClick={() => goto(clampedPage - 1)} aria-label={t("prev")}>
                <KeyboardArrowLeftIcon fontSize="small" />
            </IconButton>
            <Text style={{ minWidth: 110, textAlign: "center" }}>
                {t("pageOfTotal", { page: clampedPage, total: totalPages })}
            </Text>
            <IconButton size="small" disabled={disabled || clampedPage >= totalPages} onClick={() => goto(clampedPage + 1)} aria-label={t("next")}>
                <KeyboardArrowRightIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={disabled || clampedPage >= totalPages} onClick={() => goto(totalPages)} aria-label={t("last")}>
                <LastPageIcon fontSize="small" />
            </IconButton>
            <Box style={{ flexGrow: 1 }} />
            <Text>{t("pageSize")}:</Text>
            <Select
                size="small"
                value={pageSize}
                disabled={disabled}
                onChange={(v) => onChange({ page: 1, pageSize: Number(v) })}
                style={{ minWidth: 72 }}
                aria-label={t("pageSize")}
                options={availablePageSizes.map((s) => ({ value: s, label: s }))}
            />
            <Text>{t("totalRows", { count: totalRows })}</Text>
        </Stack>
    );
};
