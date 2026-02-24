"use client";

import ClearIcon from "@mui/icons-material/Clear";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Box,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";


interface SearchReplaceBarProps {
  editor: Editor;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function SearchReplaceBar({ editor, t }: SearchReplaceBarProps) {
  const theme = useTheme();
  const storage = editor.storage.searchReplace;

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
      // openSearch でフォーカス
      if (s.isOpen) {
        s.isOpen = false; // consume the flag
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
      }, 300);
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

  return (
    <>
      {/* Inline search in toolbar */}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Replace toggle */}
      <Tooltip title={t("replace")}>
        <IconButton
          size="small"
          aria-label={t("replace")}
          onClick={() => setShowReplace((v) => !v)}
          sx={{ p: 0.25 }}
        >
          {showReplace ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Tooltip>

      {/* Search + Replace container */}
      <Box sx={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        {/* Search input */}
        <Box
          component="input"
          ref={searchInputRef}
          aria-label={t("searchPlaceholder")}
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

        {/* Replace row - below search input */}
        {showReplace && (
          <Box
            sx={{
              position: "absolute",
              top: "100%",
              left: 0,
              mt: 0.5,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 0.5,
              py: 0.5,
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              boxShadow: 2,
              minWidth: 200,
            }}
          >
            <Box
              component="input"
              aria-label={t("replacePlaceholder")}
              value={replaceTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleReplaceChange(e.target.value)
              }
              onKeyDown={handleReplaceKeyDown}
              placeholder={t("replacePlaceholder")}
              sx={{ ...inputSx, flex: 1 }}
            />
            <Tooltip title={t("replace")}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t("replace")}
                  onClick={() => editor.commands.replaceCurrentMatch()}
                  disabled={resultCount === 0}
                  sx={{ p: 0.25 }}
                >
                  <Typography aria-hidden="true" sx={{ fontSize: "0.65rem", fontWeight: 700, lineHeight: 1 }}>1</Typography>
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
                  sx={{ p: 0.25 }}
                >
                  <Typography aria-hidden="true" sx={{ fontSize: "0.65rem", fontWeight: 700, lineHeight: 1 }}>*</Typography>
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Match count */}
      {searchTerm && (
        <Typography
          variant="caption"
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
            onClick={() => editor.commands.goToPrevMatch()}
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
            onClick={() => editor.commands.goToNextMatch()}
            disabled={resultCount === 0}
            sx={{ p: 0.25 }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
    </>
  );
}
