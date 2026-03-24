"use client";

import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ClearIcon from "@mui/icons-material/Clear";
import CloseIcon from "@mui/icons-material/Close";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FindReplaceIcon from "@mui/icons-material/FindReplace";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Box,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import React, { useCallback, useState } from "react";

import { getActionHover, getDivider, getErrorMain, getPrimaryContrast, getPrimaryDark, getPrimaryLight, getPrimaryMain, getTextPrimary, getTextSecondary } from "../constants/colors";
import { SEARCH_COUNTER_FONT_SIZE, SEARCH_INPUT_FONT_SIZE } from "../constants/dimensions";
import { Z_TOOLBAR } from "../constants/zIndex";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";

interface SourceSearchBarProps {
  search: TextareaSearchState;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export const SourceSearchBar = React.memo(function SourceSearchBar({
  search,
  onClose,
  t,
}: SourceSearchBarProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [showReplace, setShowReplace] = useState(false);

  const resultCount = search.matches.length;

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
        onClose();
      }
    },
    [search, onClose],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const toggleBtnSx = (active: boolean) => {
    const activeBg = isDark ? getPrimaryDark(isDark) : getPrimaryLight(isDark);
    return {
      p: 0.25,
      borderRadius: 0.5,
      minWidth: 28,
      minHeight: 28,
      fontSize: SEARCH_COUNTER_FONT_SIZE,
      fontWeight: 700,
      fontFamily: "monospace",
      bgcolor: active ? activeBg : "transparent",
      color: active ? getPrimaryContrast(isDark) : "inherit",
      border: 1,
      borderColor: active ? getPrimaryMain(isDark) : "transparent",
      "&:hover": {
        bgcolor: active ? activeBg : getActionHover(isDark),
      },
    };
  };

  const inputSx = {
    minHeight: 24,
    px: 0.75,
    border: 1,
    borderColor: getDivider(isDark),
    borderRadius: 0.5,
    fontSize: SEARCH_INPUT_FONT_SIZE,
    outline: "none",
    bgcolor: "transparent",
    color: getTextPrimary(isDark),
    fontFamily: "inherit",
    "&:focus": {
      borderColor: getPrimaryMain(isDark),
    },
  };

  return (
    <Paper
      elevation={3}
      role="search"
      sx={{
        position: "absolute",
        top: 0,
        right: 16,
        zIndex: Z_TOOLBAR,
        borderRadius: 1,
        px: 1.5,
        py: 0.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      {/* Search row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Replace toggle */}
        <Tooltip title={t("replace")}>
          <IconButton
            size="small"
            aria-label={t("replace")}
            aria-pressed={showReplace}
            onClick={() => setShowReplace((v) => !v)}
            sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
          >
            {showReplace ? (
              <ExpandMoreIcon sx={{ fontSize: 16 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>

        {/* Search input */}
        <Box
          component="input"
          ref={search.searchInputRef}
          aria-label={t("searchPlaceholder")}
          autoComplete="off"
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
              fontSize: SEARCH_COUNTER_FONT_SIZE,
              color: resultCount === 0 ? getErrorMain(isDark) : getTextSecondary(isDark),
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
            aria-pressed={search.caseSensitive}
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
              aria-label={t("prevMatch")}
              onClick={search.goToPrev}
              disabled={resultCount === 0}
              sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
            >
              <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`${t("nextMatch")} (Enter)`}>
          <span>
            <IconButton
              size="small"
              aria-label={t("nextMatch")}
              onClick={search.goToNext}
              disabled={resultCount === 0}
              sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
            >
              <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* Close button */}
        <Tooltip title={t("close")}>
          <IconButton
            size="small"
            aria-label={t("close")}
            onClick={onClose}
            sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Replace row */}
      {showReplace && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            pl: 4,
          }}
        >
          <Box
            component="input"
            aria-label={t("replacePlaceholder")}
            autoComplete="off"
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
                sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
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
                sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}
              >
                <DoneAllIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}
    </Paper>
  );
});
