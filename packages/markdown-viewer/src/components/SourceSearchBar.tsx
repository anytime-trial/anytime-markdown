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
  useTheme,
} from "@mui/material";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import React, { useCallback, useState } from "react";

import { getErrorMain, getPrimaryContrast, getPrimaryDark, getPrimaryLight, getPrimaryMain, getTextPrimary, getTextSecondary } from "../constants/colors";
import { SEARCH_COUNTER_FONT_SIZE, SEARCH_INPUT_FONT_SIZE } from "../constants/dimensions";
import { Z_TOOLBAR } from "../constants/zIndex";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { Paper } from "../ui/Paper";
import { Text } from "../ui/Text";
import styles from "./SourceSearchBar.module.css";

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

  const toggleBtnStyle = (active: boolean): React.CSSProperties => {
    const activeBg = isDark ? getPrimaryDark(isDark) : getPrimaryLight(isDark);
    return {
      fontSize: SEARCH_COUNTER_FONT_SIZE,
      backgroundColor: active ? activeBg : "transparent",
      color: active ? getPrimaryContrast(isDark) : "inherit",
      borderColor: active ? getPrimaryMain(isDark) : "transparent",
    };
  };

  const inputStyle: React.CSSProperties = {
    fontSize: SEARCH_INPUT_FONT_SIZE,
    color: getTextPrimary(isDark),
  };

  return (
    <Paper
      role="search"
      style={{
        position: "absolute",
        top: 0,
        right: 16,
        zIndex: Z_TOOLBAR,
        borderRadius: 4,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 4,
        paddingBottom: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: "var(--am-elevation-3)",
      }}
    >
      {/* Search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Replace toggle */}
        <Tooltip title={t("replace")}>
          <IconButton
            size="small"
            aria-label={t("replace")}
            aria-pressed={showReplace}
            onClick={() => setShowReplace((v) => !v)}
            className={styles.iconBtnSmall24}
          >
            {showReplace ? (
              <ExpandMoreIcon sx={{ fontSize: 16 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>

        {/* Search input */}
        <input
          ref={search.searchInputRef}
          aria-label={t("searchPlaceholder")}
          autoComplete="off"
          value={search.searchTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            search.setSearchTerm(e.target.value)
          }
          onKeyDown={handleSearchKeyDown}
          placeholder={t("searchPlaceholder")}
          className={styles.searchInput}
          style={{ ...inputStyle, width: 120, maxWidth: 180, flex: "0 1 auto" }}
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
            className={styles.iconBtnClear}
          >
            <ClearIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}

        {/* Match count */}
        {search.searchTerm && (
          <Text
            variant="caption"
            aria-live="polite"
            aria-atomic="true"
            style={{
              whiteSpace: "nowrap",
              fontSize: SEARCH_COUNTER_FONT_SIZE,
              color: resultCount === 0 ? getErrorMain(isDark) : getTextSecondary(isDark),
              marginLeft: 2,
              marginRight: 2,
            }}
          >
            {resultCount > 0
              ? t("searchResults", {
                  current: String(search.currentIndex + 1),
                  total: String(resultCount),
                })
              : t("noResults")}
          </Text>
        )}

        {/* Case sensitive toggle */}
        <Tooltip title={t("caseSensitive")}>
          <IconButton
            size="small"
            aria-label={t("caseSensitive")}
            aria-pressed={search.caseSensitive}
            onClick={search.toggleCaseSensitive}
            className={styles.iconBtnToggle}
            style={toggleBtnStyle(search.caseSensitive)}
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
              className={styles.iconBtnSmall24}
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
              className={styles.iconBtnSmall24}
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
            className={styles.iconBtnSmall24}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingLeft: 32,
          }}
        >
          <input
            aria-label={t("replacePlaceholder")}
            autoComplete="off"
            value={search.replaceTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              search.setReplaceTerm(e.target.value)
            }
            onKeyDown={handleReplaceKeyDown}
            placeholder={t("replacePlaceholder")}
            className={styles.searchInput}
            style={{ ...inputStyle, width: 120, maxWidth: 180, flex: "0 1 auto" }}
          />
          <Tooltip title={t("replace")}>
            <span>
              <IconButton
                size="small"
                aria-label={t("replace")}
                onClick={search.replaceCurrent}
                disabled={resultCount === 0}
                className={styles.iconBtnSmall24}
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
                className={styles.iconBtnSmall24}
              >
                <DoneAllIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      )}
    </Paper>
  );
});
