"use client";

import ClearIcon from "@mui/icons-material/Clear";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import FindReplaceIcon from "@mui/icons-material/FindReplace";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Box,
  Divider,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useCallback } from "react";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";

interface FsSearchBarProps {
  search: TextareaSearchState;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function FsSearchBar({ search, t }: FsSearchBarProps) {
  const theme = useTheme();

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          search.goToPrev();
        } else {
          search.goToNext();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        search.setSearchTerm("");
      }
    },
    [search],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        search.setReplaceTerm("");
      }
    },
    [search],
  );

  const toggleBtnSx = (active: boolean) => ({
    p: 0.25,
    borderRadius: 0.5,
    minWidth: 20,
    minHeight: 20,
    fontSize: "0.65rem",
    fontWeight: 700,
    fontFamily: "monospace",
    bgcolor: active
      ? theme.palette.mode === "dark"
        ? "primary.dark"
        : "primary.light"
      : "transparent",
    color: active ? "primary.contrastText" : "inherit",
    border: 1,
    borderColor: active ? "primary.main" : "transparent",
    "&:hover": {
      bgcolor: active
        ? theme.palette.mode === "dark"
          ? "primary.dark"
          : "primary.light"
        : "action.hover",
    },
  });

  const inputSx = {
    minHeight: 24,
    px: 0.75,
    border: 1,
    borderColor: "divider",
    borderRadius: 0.5,
    fontSize: "0.78rem",
    outline: "none",
    bgcolor: "transparent",
    color: "text.primary",
    fontFamily: "inherit",
    "&:focus": {
      borderColor: "primary.main",
    },
  };

  const resultCount = search.matches.length;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {/* Search input */}
      <Box
        component="input"
        ref={search.searchInputRef}
        aria-label={t("searchPlaceholder")}
        value={search.searchTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          search.setSearchTerm(e.target.value)
        }
        onKeyDown={handleSearchKeyDown}
        placeholder={t("searchPlaceholder")}
        sx={{ ...inputSx, width: 120, maxWidth: 180, flex: "0 1 auto" }}
      />

      {/* Clear search */}
      {search.searchTerm && (
        <IconButton
          size="small"
          aria-label={t("clearSearch")}
          onClick={() => {
            search.setSearchTerm("");
            search.searchInputRef.current?.focus();
          }}
          sx={{ p: 0.125, ml: -0.5 }}
        >
          <ClearIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}

      {/* Match count */}
      {search.searchTerm && (
        <Typography
          variant="caption"
          aria-live="polite"
          aria-atomic="true"
          sx={{
            whiteSpace: "nowrap",
            fontSize: "0.65rem",
            color: resultCount === 0 ? "error.main" : "text.secondary",
            mx: 0.25,
          }}
        >
          {resultCount > 0
            ? t("searchResults", {
                current: String(search.currentIndex + 1),
                total: String(resultCount),
              })
            : t("noResults")}
        </Typography>
      )}

      {/* Case sensitive toggle */}
      <Tooltip title={t("caseSensitive")}>
        <IconButton
          size="small"
          aria-label={t("caseSensitive")}
          onClick={search.toggleCaseSensitive}
          sx={toggleBtnSx(search.caseSensitive)}
        >
          Aa
        </IconButton>
      </Tooltip>

      {/* Prev / Next */}
      <Tooltip title={`${t("prevMatch")} (Shift+Enter)`}>
        <span>
          <IconButton
            size="small"
            onClick={search.goToPrev}
            disabled={resultCount === 0}
            sx={{ p: 0.25 }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={`${t("nextMatch")} (Enter)`}>
        <span>
          <IconButton
            size="small"
            onClick={search.goToNext}
            disabled={resultCount === 0}
            sx={{ p: 0.25 }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

      {/* Replace input (always visible) */}
      <Box
        component="input"
        aria-label={t("replacePlaceholder")}
        value={search.replaceTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          search.setReplaceTerm(e.target.value)
        }
        onKeyDown={handleReplaceKeyDown}
        placeholder={t("replacePlaceholder")}
        sx={{ ...inputSx, width: 120, maxWidth: 180, flex: "0 1 auto" }}
      />
      <Tooltip title={t("replace")}>
        <span>
          <IconButton
            size="small"
            aria-label={t("replace")}
            onClick={search.replaceCurrent}
            disabled={resultCount === 0}
            sx={{ p: 0.25 }}
          >
            <FindReplaceIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t("replaceAll")}>
        <span>
          <IconButton
            size="small"
            aria-label={t("replaceAll")}
            onClick={search.replaceAll}
            disabled={resultCount === 0}
            sx={{ p: 0.25 }}
          >
            <DoneAllIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
