"use client";

import FirstPageIcon from "@mui/icons-material/FirstPage";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LastPageIcon from "@mui/icons-material/LastPage";
import {
    Box,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import React from "react";

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
    const t = useTranslations("Pager");
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
            sx={{ px: 1, py: 0.5, borderTop: 1, borderColor: "divider" }}
        >
            <IconButton size="small" disabled={disabled || clampedPage <= 1} onClick={() => goto(1)} aria-label={t("first")}>
                <FirstPageIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={disabled || clampedPage <= 1} onClick={() => goto(clampedPage - 1)} aria-label={t("prev")}>
                <KeyboardArrowLeftIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 110, textAlign: "center" }}>
                {t("pageOfTotal", { page: clampedPage, total: totalPages })}
            </Typography>
            <IconButton size="small" disabled={disabled || clampedPage >= totalPages} onClick={() => goto(clampedPage + 1)} aria-label={t("next")}>
                <KeyboardArrowRightIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" disabled={disabled || clampedPage >= totalPages} onClick={() => goto(totalPages)} aria-label={t("last")}>
                <LastPageIcon fontSize="small" />
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption">{t("pageSize")}:</Typography>
            <Select
                size="small"
                value={pageSize}
                disabled={disabled}
                onChange={(e) => onChange({ page: 1, pageSize: Number(e.target.value) })}
                sx={{ minWidth: 72 }}
            >
                {availablePageSizes.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
            </Select>
            <Typography variant="caption">{t("totalRows", { count: totalRows })}</Typography>
        </Stack>
    );
};
