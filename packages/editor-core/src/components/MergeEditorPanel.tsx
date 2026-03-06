import React, { useEffect, useRef } from "react";
import { Box, IconButton, Paper, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { DiffLine } from "../utils/diffEngine";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEditorSettingsContext } from "../useEditorSettings";

/** マージエディタ共通のtiptapスタイル */
export function getMergeTiptapStyles(theme: Theme, fontSize = 14, lineHeight = 1.6) {
  return {
    "& .tiptap": {
      minHeight: "100%",
      py: 2,
      pr: 2,
      pl: 5,
      outline: "none",
      fontSize: `${fontSize}px`,
      lineHeight,
      color: theme.palette.text.primary,
      "& h1, & h2, & h3, & h4, & h5": {
        position: "relative",
        "&::before": {
          position: "absolute",
          right: "calc(100% + 8px)",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          "&:hover": { bgcolor: theme.palette.action.selected },
        },
      },
      "& h1": {
        fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
        "&::before": { content: "'H1'" },
      },
      "& h2": {
        fontSize: "1.5em", fontWeight: 600, mt: 1.5, mb: 1,
        "&::before": { content: "'H2'" },
      },
      "& h3": {
        fontSize: "1.25em", fontWeight: 600, mt: 1, mb: 0.5,
        "&::before": { content: "'H3'" },
      },
      "& h4": {
        fontSize: "1.1em", fontWeight: 600, mt: 1, mb: 0.5,
        "&::before": { content: "'H4'" },
      },
      "& h5": {
        fontSize: "1em", fontWeight: 600, mt: 0.75, mb: 0.5,
        "&::before": { content: "'H5'" },
      },
      "& > p": {
        position: "relative",
        "&::before": {
          content: "'P'",
          position: "absolute",
          right: "calc(100% + 8px)",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
        },
        "&:hover::before": {
          opacity: 1,
        },
      },
      "& p": { mb: 1 },
      "& > blockquote > p": {
        position: "relative",
        "&::before": {
          content: "'Quote'",
          position: "absolute",
          right: "calc(100% + 30px)",
          top: 2,
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
          "&:hover": { bgcolor: theme.palette.action.selected },
        },
        "&:hover::before": { opacity: 1 },
      },
      "& ul, & ol": { pl: 3, mb: 1 },
      "& li": {
        mb: 0.25,
        position: "relative",
        "&::before": {
          position: "absolute",
          right: "calc(100% + 32px)",
          top: 2,
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
          "&:hover": { bgcolor: theme.palette.action.selected },
        },
        "&:hover::before": { opacity: 1 },
      },
      "& > ul:not([data-type='taskList']) > li": {
        "&::before": { content: "'UL'" },
      },
      "& > ol > li": {
        "&::before": { content: "'OL'" },
      },
      "& > ul[data-type='taskList'] > li": {
        "&::before": { content: "'Task'", right: "calc(100% + 8px)" },
      },
      "& code": {
        bgcolor: theme.palette.action.hover,
        color: theme.palette.mode === "dark" ? theme.palette.grey[300] : theme.palette.error.main,
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        fontFamily: "monospace",
        fontSize: "0.875em",
      },
      "& pre": {
        bgcolor: theme.palette.mode === "dark" ? theme.palette.grey[900] : theme.palette.grey[100],
        borderRadius: 1,
        p: 2,
        my: 1,
        overflow: "auto",
        "& code": { bgcolor: "transparent", color: "inherit", p: 0, borderRadius: 0 },
      },
      "& blockquote": {
        borderLeft: `3px solid ${theme.palette.divider}`,
        pl: 2,
        ml: 0,
        my: 1,
        color: theme.palette.text.secondary,
      },
      "& table": {
        borderCollapse: "collapse",
        width: "100%",
        "& th, & td": {
          border: `1px solid ${theme.palette.divider}`,
          px: 1,
          py: 0.5,
          textAlign: "left",
          minWidth: 80,
          fontSize: "inherit",
          lineHeight: "inherit",
        },
        "& th": {
          bgcolor: theme.palette.action.hover,
          fontWeight: 600,
        },
        "& .selectedCell": {
          bgcolor: theme.palette.action.selected,
        },
      },
      "& img": {
        maxWidth: "100%",
        height: "auto",
        borderRadius: 1,
        my: 1,
      },
      "& a": { color: theme.palette.primary.main, textDecoration: "underline" },
      "& hr": { border: "none", borderTop: `1px solid ${theme.palette.divider}`, my: 2 },
      "& ul[data-type='taskList']": {
        listStyle: "none",
        pl: 0,
        "& li": {
          display: "flex",
          alignItems: "center",
          gap: 1,
        },
      },
    },
  };
}

function _getLineBgColor(type: DiffLine["type"], theme: Theme) {
  switch (type) {
    case "added":
    case "modified-new":
      return alpha(theme.palette.success.main, 0.15);
    case "removed":
    case "modified-old":
      return alpha(theme.palette.error.main, 0.15);
    case "padding":
      return alpha(theme.palette.action.hover, 0.05);
    default:
      return "transparent";
  }
}

function getDiffLineSymbol(type: DiffLine["type"]): string {
  switch (type) {
    case "added":
    case "modified-new":
      return "+";
    case "removed":
    case "modified-old":
      return "-";
    default:
      return " ";
  }
}

interface MergeEditorPanelProps {
  sourceMode: boolean;
  sourceText?: string;
  onSourceChange?: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  autoResize?: boolean;
  textareaAriaLabel?: string;
  editor?: Editor | null;
  editorWrapperRef?: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  bgGradient?: string;
  paperSx?: SxProps<Theme>;
  hideScrollbar?: boolean;
  diffLines?: DiffLine[];
  side?: "left" | "right";
  onMerge?: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  onHoverLine?: (lineIndex: number | null) => void;
}

export function MergeEditorPanel({
  sourceMode,
  sourceText,
  onSourceChange,
  textareaRef,
  autoResize,
  textareaAriaLabel,
  editor,
  editorWrapperRef,
  children,
  scrollRef,
  bgGradient,
  paperSx,
  hideScrollbar,
  diffLines,
  side,
  onMerge,
  onHoverLine,
}: MergeEditorPanelProps) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const editorSettings = useEditorSettingsContext();
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef || fallbackTextareaRef;
  const gutterRef = useRef<HTMLDivElement>(null);
  const mergeGutterRef = useRef<HTMLDivElement>(null);

  const hideScrollbarSx = hideScrollbar
    ? {
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none",
      }
    : {};

  // Auto-resize textarea (autoResize && sourceMode 時のみ動作)
  const alignedLineCount = diffLines?.length ?? 0;
  useEffect(() => {
    if (!autoResize || !sourceMode) return;
    const el = resolvedTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoResize, sourceMode, sourceText, alignedLineCount, resolvedTextareaRef]);

  // 行番号ガターのスクロール同期（左パネル: textarea内スクロール時のみ）
  useEffect(() => {
    if (autoResize || !sourceMode) return;
    const textarea = resolvedTextareaRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !gutter) return;
    const mergeGutter = mergeGutterRef.current;
    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop;
      if (mergeGutter) mergeGutter.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, [autoResize, sourceMode, resolvedTextareaRef]);

  // グラデーション背景のインラインスタイル（textareaに直接適用）
  const gradientStyle: React.CSSProperties | undefined =
    sourceMode && bgGradient && bgGradient !== "none"
      ? { backgroundImage: bgGradient, backgroundAttachment: "local" }
      : undefined;

  if (sourceMode) {
    // textarea（編集可能）+ マージボタン列（diffLines提供時）
    const rawText = sourceText ?? "";
    const rawLineCount = rawText === "" ? 1 : rawText.split("\n").length;
    const digits = String(rawLineCount).length;

    // diffLines がある場合、パディング行を含めた表示テキストを構築
    let displayText = rawText;
    const paddingIndices = new Set<number>();
    if (diffLines) {
      const displayLines: string[] = [];
      for (let i = 0; i < diffLines.length; i++) {
        if (diffLines[i].type === "padding") {
          displayLines.push("");
          paddingIndices.add(i);
        } else {
          displayLines.push(diffLines[i].text);
        }
      }
      displayText = displayLines.join("\n");
    }
    const alignedCount = diffLines ? diffLines.length : rawLineCount;

    // 行番号: diffLines があれば diffLines ベース（パディング行は空欄）、なければ連番
    const lineNumbers = diffLines
      ? diffLines.map(dl => dl.lineNumber != null ? String(dl.lineNumber) : "").join("\n")
      : Array.from({ length: rawLineCount }, (_, i) => i + 1).join("\n");

    // 差分記号列: +/-/空白
    const diffSymbols = diffLines
      ? diffLines.map(dl => getDiffLineSymbol(dl.type)).join("\n")
      : null;

    // Build merge button map: diffLines index -> blockId (first line of each diff block only)
    const mergeButtonIndices = new Map<number, number>();
    if (diffLines && side && onMerge) {
      const renderedBlocks = new Set<number>();
      for (let i = 0; i < diffLines.length; i++) {
        const dl = diffLines[i];
        if (
          dl.blockId !== null &&
          dl.type !== "equal" &&
          dl.type !== "padding" &&
          !renderedBlocks.has(dl.blockId)
        ) {
          renderedBlocks.add(dl.blockId);
          mergeButtonIndices.set(i, dl.blockId);
        }
      }
    }
    const hasMergeButtons = mergeButtonIndices.size > 0 && !!side && !!onMerge;

    const renderMergeGutter = (panelSide: "left" | "right") => (
      <Box
        ref={mergeGutterRef}
        sx={{
          width: 24,
          minWidth: 24,
          py: 2,
          m: 0,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {Array.from({ length: alignedCount }, (_, i) => {
          const blockId = mergeButtonIndices.get(i);
          return (
            <Box
              key={i}
              sx={{
                position: "relative",
                fontFamily: "monospace",
                fontSize: `${editorSettings.fontSize}px`,
                lineHeight: editorSettings.lineHeight,
                textAlign: "center",
              }}
            >
              {"\u00A0"}
              {blockId != null && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Tooltip
                    title={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                    placement={panelSide === "left" ? "left" : "right"}
                  >
                    <IconButton
                      size="small"
                      aria-label={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                      onClick={() => onMerge!(blockId, panelSide === "left" ? "left-to-right" : "right-to-left")}
                      sx={{ p: 0 }}
                    >
                      {panelSide === "left"
                        ? <ChevronRightIcon sx={{ fontSize: 16 }} />
                        : <ChevronLeftIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );

    return (
      <Paper
        variant="outlined"
        ref={scrollRef as React.RefObject<HTMLDivElement> | undefined}
        sx={[
          {
            flex: 1,
            overflow: autoResize ? "auto" : "hidden",
            borderRadius: 0,
            border: 0,
            ...hideScrollbarSx,
          },
          ...(Array.isArray(paperSx) ? paperSx : paperSx ? [paperSx] : []),
        ]}
      >
        <Box sx={{ display: "flex", minHeight: "100%" }}>
          {/* 右パネル: 行番号ガター左にマージボタン列 */}
          {side === "right" && hasMergeButtons && renderMergeGutter("right")}

          {/* 行番号ガター（diffLines ベースで左右揃え） */}
          <Box
            ref={gutterRef}
            component="pre"
            sx={{
              width: `${Math.max(3, digits + 1)}ch`,
              minWidth: `${Math.max(3, digits + 1)}ch`,
              py: 2,
              px: 1,
              m: 0,
              textAlign: "right",
              whiteSpace: "pre",
              fontFamily: "monospace",
              fontSize: `${editorSettings.fontSize}px`,
              lineHeight: editorSettings.lineHeight,
              color: alpha(theme.palette.text.secondary, 0.6),
              userSelect: "none",
              overflow: "hidden",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            {lineNumbers}
          </Box>
          {/* 差分記号列 (+/-) */}
          {diffSymbols && (
            <Box
              component="pre"
              aria-hidden="true"
              sx={{
                width: "2ch",
                minWidth: "2ch",
                py: 2,
                m: 0,
                textAlign: "center",
                whiteSpace: "pre",
                fontFamily: "monospace",
                fontSize: `${editorSettings.fontSize}px`,
                lineHeight: editorSettings.lineHeight,
                color: alpha(theme.palette.text.secondary, 0.6),
                userSelect: "none",
                overflow: "hidden",
                boxSizing: "border-box",
                flexShrink: 0,
              }}
            >
              {diffSymbols}
            </Box>
          )}

          {/* Textarea（編集可能） */}
          <Box
            component="textarea"
            ref={resolvedTextareaRef}
            aria-label={textareaAriaLabel}
            value={displayText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const newText = e.target.value;
              if (paddingIndices.size === 0) {
                onSourceChange?.(newText);
                return;
              }
              // padding行（既知のインデックスで空行のまま）を除去して実テキストに変換
              const lines = newText.split("\n");
              const realLines: string[] = [];
              for (let i = 0; i < lines.length; i++) {
                if (paddingIndices.has(i) && lines[i] === "") continue;
                realLines.push(lines[i]);
              }
              onSourceChange?.(realLines.join("\n"));
            }}
            onSelect={(e: React.SyntheticEvent<HTMLTextAreaElement>) => {
              if (!onHoverLine || !diffLines) return;
              const ta = e.currentTarget;
              const pos = ta.selectionStart ?? 0;
              // padded text ではカーソル行インデックスが diffLines インデックスに直接対応
              const lineIdx = (ta.value.slice(0, pos).match(/\n/g) || []).length;
              onHoverLine(lineIdx < diffLines.length ? lineIdx : null);
            }}
            style={gradientStyle}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: "100%",
              pt: 2,
              pb: 2,
              pr: side === "left" && hasMergeButtons ? 0 : 2,
              pl: 1,
              border: "none",
              outline: "none",
              resize: "none",
              ...(autoResize ? { overflow: "hidden" } : {}),
              ...hideScrollbarSx,
              fontFamily: "monospace",
              fontSize: `${editorSettings.fontSize}px`,
              lineHeight: editorSettings.lineHeight,
              color: theme.palette.text.primary,
              bgcolor: "transparent",
              boxSizing: "border-box",
            }}
          />

          {/* 左パネル: textarea右にマージボタン列 */}
          {side === "left" && hasMergeButtons && renderMergeGutter("left")}
        </Box>
      </Paper>
    );
  }

  const tiptapStyles = getMergeTiptapStyles(theme, editorSettings.fontSize, editorSettings.lineHeight);

  const paperContent = (
    <Paper
      variant="outlined"
      ref={scrollRef as React.RefObject<HTMLDivElement> | undefined}
      sx={[
        {
          flex: 1,
          overflow: "auto",
          borderRadius: 0,
          border: 0,
          ...tiptapStyles,
          ...hideScrollbarSx,
        },
        ...(Array.isArray(paperSx) ? paperSx : paperSx ? [paperSx] : []),
      ]}
    >
      <EditorContent editor={editor ?? null} />
      {children}
    </Paper>
  );

  if (editorWrapperRef) {
    return (
      <Box ref={editorWrapperRef} sx={{ position: "relative", flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {paperContent}
      </Box>
    );
  }

  return paperContent;
}
