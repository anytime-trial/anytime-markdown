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
import type { Editor } from "@tiptap/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Z_TOOLBAR } from "../constants/zIndex";
import type { TranslationFn } from "../types";


interface SearchReplaceBarProps {
  editor: Editor;
  t: TranslationFn;
}

export const SearchReplaceBar = React.memo(function SearchReplaceBar({ editor, t }: SearchReplaceBarProps) {
  const theme = useTheme();
  const storage = editor.storage.searchReplace;

  const [isVisible, setIsVisible] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [searchTerm, setSearchTerm] = useState(storage.searchTerm);
  const [replaceTerm, setReplaceTerm] = useState(storage.replaceTerm);
  const [caseSensitive, setCaseSensitive] = useState(storage.caseSensitive);
  const [wholeWord, setWholeWord] = useState(storage.wholeWord);
  const [useRegex, setUseRegex] = useState(storage.useRegex);
  const [resultCount, setResultCount] = useState(storage.results.length);
  const [currentIndex, setCurrentIndex] = useState(storage.currentIndex);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from extension storage to local state
  useEffect(() => {
    const handler = () => {
      const s = editor.storage.searchReplace;
      setResultCount(s.results.length);
      setCurrentIndex(s.currentIndex);
      setCaseSensitive(s.caseSensitive);
      setWholeWord(s.wholeWord);
      setUseRegex(s.useRegex);
      // openSearch / openSearchReplace command からの showReplace 同期
      if (s.isOpen && s.showReplace) {
        setShowReplace(true);
      }
      // openSearch でフォーカス & 表示
      if (s.isOpen) {
        s.isOpen = false; // consume the flag
        setIsVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        // 選択テキストを初期検索語として使用
        const { from, to } = editor.state.selection;
        if (from !== to) {
          const selectedText = editor.state.doc.textBetween(from, to);
          if (selectedText && selectedText.length < 200 && !selectedText.includes("\n")) {
            setSearchTerm(selectedText);
            editor.commands.setSearchTerm(selectedText);
          }
        }
      } else if (!s.searchTerm && !s.replaceTerm) {
        // closeSearch で非表示
        setIsVisible(false);
      }
    };
    storage.onSearchStateChange = handler;
    return () => {
      storage.onSearchStateChange = undefined;
    };
  }, [editor, storage]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        editor.commands.setSearchTerm(value);
      }, 200);
    },
    [editor],
  );

  const handleReplaceChange = useCallback(
    (value: string) => {
      setReplaceTerm(value);
      editor.commands.setReplaceTerm(value);
    },
    [editor],
  );

  const handleClearAndBlur = useCallback(() => {
    setSearchTerm("");
    setReplaceTerm("");
    setShowReplace(false);
    setIsVisible(false);
    editor.commands.closeSearch();
    editor.commands.focus();
  }, [editor]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          editor.commands.goToPrevMatch();
        } else {
          editor.commands.goToNextMatch();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClearAndBlur();
      }
    },
    [editor, handleClearAndBlur],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          handleClearAndBlur();
        }
      }
    },
    [handleClearAndBlur],
  );

  const toggleBtnSx = (active: boolean) => ({
    p: 0.25,
    borderRadius: 0.5,
    minWidth: 28,
    minHeight: 28,
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

  if (!isVisible) return null;

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
          ref={searchInputRef}
          aria-label={t("searchPlaceholder")}
          autoComplete="off"
          value={searchTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            handleSearchChange(e.target.value)
          }
          onKeyDown={handleSearchKeyDown}
          placeholder={t("searchPlaceholder")}
          sx={{ ...inputSx, width: 120, maxWidth: 180, flex: "0 1 auto" }}
        />

        {/* Clear search */}
        {searchTerm && (
          <IconButton
            size="small"
            aria-label={t("clearSearch")}
            onClick={() => {
              setSearchTerm("");
              editor.commands.setSearchTerm("");
              searchInputRef.current?.focus();
            }}
            sx={{ p: 0.125, ml: -0.5 }}
          >
            <ClearIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}

        {/* Match count */}
        {searchTerm && (
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
                  current: String(currentIndex + 1),
                  total: String(resultCount),
                })
              : t("noResults")}
          </Typography>
        )}

        {/* Toggle buttons */}
        <Tooltip title={t("caseSensitive")}>
          <IconButton
            size="small"
            aria-label={t("caseSensitive")}
            aria-pressed={caseSensitive}
            onClick={() => editor.commands.toggleCaseSensitive()}
            sx={toggleBtnSx(caseSensitive)}
          >
            Aa
          </IconButton>
        </Tooltip>
        <Tooltip title={t("wholeWord")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("wholeWord")}
              aria-pressed={wholeWord && !useRegex}
              onClick={() => editor.commands.toggleWholeWord()}
              disabled={useRegex}
              sx={toggleBtnSx(wholeWord && !useRegex)}
            >
              Ab|
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("regex")}>
          <IconButton
            size="small"
            aria-label={t("regex")}
            aria-pressed={useRegex}
            onClick={() => editor.commands.toggleUseRegex()}
            sx={toggleBtnSx(useRegex)}
          >
            .*
          </IconButton>
        </Tooltip>

        {/* Prev / Next */}
        <Tooltip title={`${t("prevMatch")} (Shift+Enter)`}>
          <span>
            <IconButton
              size="small"
              aria-label={t("prevMatch")}
              onClick={() => editor.commands.goToPrevMatch()}
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
              onClick={() => editor.commands.goToNextMatch()}
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
            onClick={handleClearAndBlur}
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
            value={replaceTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleReplaceChange(e.target.value)
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
                onClick={() => editor.commands.replaceCurrentMatch()}
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
                onClick={() => editor.commands.replaceAllMatches()}
                disabled={resultCount === 0}
                color="warning"
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
