import { Box, Paper, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import React, { useCallback, useEffect, useRef } from "react";
import { useEditorSettingsContext } from "../useEditorSettings";
import type { TextareaSearchMatch } from "../hooks/useTextareaSearch";

interface SourceModeEditorProps {
  sourceText: string;
  onSourceChange: (value: string) => void;
  editorHeight: number;
  ariaLabel: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  searchMatches?: TextareaSearchMatch[];
  searchCurrentIndex?: number;
}

/** Build highlight segments from matches */
function buildHighlightSegments(
  text: string,
  matches: TextareaSearchMatch[],
  currentIndex: number,
): React.ReactNode[] {
  if (matches.length === 0) return [text];
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.start > lastEnd) {
      segments.push(text.substring(lastEnd, m.start));
    }
    segments.push(
      <mark
        key={i}
        style={{
          backgroundColor: i === currentIndex ? "#e8a012" : "rgba(232,160,18,0.35)",
          color: "transparent",
          borderRadius: 2,
        }}
      >
        {text.substring(m.start, m.end)}
      </mark>,
    );
    lastEnd = m.end;
  }
  if (lastEnd < text.length) {
    segments.push(text.substring(lastEnd));
  }
  return segments;
}

export function SourceModeEditor({
  sourceText,
  onSourceChange,
  editorHeight,
  ariaLabel,
  textareaRef,
  searchMatches,
  searchCurrentIndex,
}: SourceModeEditorProps) {
  const settings = useEditorSettingsContext();
  const theme = useTheme();
  const highlightRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const hasMatches = searchMatches && searchMatches.length > 0;

  const lineCount = (sourceText || "").split("\n").length || 1;

  // Sync textarea scroll to highlight layer
  const handleScroll = useCallback(() => {
    const ta = textareaRef?.current;
    const hl = highlightRef.current;
    if (ta && hl) {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
  }, [textareaRef]);

  // Also sync when the parent Paper scrolls (vertical overflow)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMatches) return;
    const syncScroll = () => {
      const hl = highlightRef.current;
      if (hl) {
        hl.scrollTop = container.scrollTop;
      }
    };
    container.addEventListener("scroll", syncScroll);
    return () => container.removeEventListener("scroll", syncScroll);
  }, [hasMatches]);

  const sharedTextSx = {
    fontFamily: "monospace",
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    letterSpacing: "normal",
    tabSize: 4,
    whiteSpace: "pre",
    wordWrap: "normal" as const,
  };

  const sharedPaddingSx = {
    py: 2,
    pr: 2,
    pl: 1,
    m: 0,
    boxSizing: "border-box" as const,
  };

  return (
    <Paper
      ref={scrollContainerRef}
      variant="outlined"
      sx={{
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        maxHeight: editorHeight,
        overflow: "auto",
      }}
    >
      <Box sx={{ display: "flex", minHeight: "100%" }}>
        <Box
          component="pre"
          sx={{
            width: "auto",
            minWidth: "3ch",
            py: 2,
            px: 1,
            m: 0,
            textAlign: "right",
            whiteSpace: "pre",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: alpha(theme.palette.text.secondary, 0.6),
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          {/* Highlight layer behind textarea */}
          {hasMatches && (
            <Box
              ref={highlightRef}
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                ...sharedPaddingSx,
                ...sharedTextSx,
                overflow: "hidden",
                pointerEvents: "none",
                color: "transparent",
              }}
            >
              {buildHighlightSegments(sourceText, searchMatches, searchCurrentIndex ?? 0)}
            </Box>
          )}
          <Box
            component="textarea"
            ref={textareaRef}
            aria-label={ariaLabel}
            value={sourceText}
            rows={Math.max(lineCount, Math.ceil((editorHeight - 36) / (settings.fontSize * settings.lineHeight)))}
            wrap="off"
            onScroll={hasMatches ? handleScroll : undefined}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onSourceChange(e.target.value)
            }
            sx={{
              position: "relative",
              width: "100%",
              ...sharedPaddingSx,
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              ...sharedTextSx,
              color: theme.palette.text.primary,
              bgcolor: "transparent",
              caretColor: theme.palette.text.primary,
            }}
          />
        </Box>
      </Box>
    </Paper>
  );
}
