import CloseIcon from "@mui/icons-material/Close";
import DOMPurify from "dompurify";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SchemaIcon from "@mui/icons-material/Schema";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, Chip, Dialog, DialogTitle, Divider, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { common, createLowlight } from "lowlight";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";

const lowlight = createLowlight(common);

/** Convert hast nodes to HTML string */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hastToHtml(nodes: any[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type === "element") {
      const cls = node.properties?.className?.join(" ") ?? "";
      const inner = hastToHtml(node.children ?? []);
      return cls ? `<span class="${cls}">${inner}</span>` : `<span>${inner}</span>`;
    }
    return "";
  }).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface CodeBlockFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  language: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFsTextChange: (newCode: string) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  readOnly?: boolean;
  isCompareMode?: boolean;
  compareCode?: string | null;
  onMergeApply?: (newThisCode: string, newOtherCode: string) => void;
  toolbarExtra?: React.ReactNode;
  t: (key: string) => string;
}

export function CodeBlockFullscreenDialog({
  open, onClose, label, language, fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, toolbarExtra,
  t,
}: CodeBlockFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();
  const fsZP = useZoomPan();

  const [fsSplitPx, setFsSplitPx] = useState(500);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  const [samplesOpen, setSamplesOpen] = useState(false);

  const handleInsertSample = useCallback((code: string) => {
    onFsTextChange(code);
  }, [onFsTextChange]);

  // Syntax-highlighted HTML
  const highlightedHtml = useMemo(() => {
    if (!fsCode) return "";
    try {
      const tree = lowlight.listLanguages().includes(language)
        ? lowlight.highlight(language, fsCode)
        : lowlight.highlightAuto(fsCode);
      return hastToHtml(tree.children);
    } catch {
      return fsCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [fsCode, language]);

  const currentLangSample = CODE_HELLO_SAMPLES[language];
  const sampleEntries = Object.entries(CODE_HELLO_SAMPLES);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="codeblock-fullscreen-title"
      slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (showCompareView) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === "f" || e.key === "h")) {
          e.preventDefault();
          e.stopPropagation();
          fsSearch.focusSearch();
        }
      }}
    >
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ mr: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <DialogTitle id="codeblock-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
          {label}{showCompareView ? ` - ${t("compare")}` : ""}
        </DialogTitle>
        <Box sx={{ flex: 1 }} />
      </Box>

      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        <Box
          ref={fsContainerRef}
          sx={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", position: "relative" }}
          onPointerMove={(e: React.PointerEvent) => {
            if (fsDragging && fsContainerRef.current) {
              const rect = fsContainerRef.current.getBoundingClientRect();
              const px = e.clientX - rect.left;
              setFsSplitPx(Math.min(rect.width - 120, Math.max(120, px)));
            }
          }}
          onPointerUp={(e: React.PointerEvent) => {
            if (fsDragging) {
              setFsDragging(false);
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            }
          }}
        >
          {/* Code editor */}
          <Box sx={{ width: isMobile ? "100%" : `${fsSplitPx}px`, height: isMobile ? "40%" : "auto", minWidth: isMobile ? undefined : 120, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
            {/* Code toolbar */}
            <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: 32 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
                {t("codeTab")}
              </Typography>
              {toolbarExtra}
            </Box>
            <LineNumberTextarea
              textareaRef={fsTextareaRef}
              value={fsCode}
              onChange={onFsCodeChange}
              readOnly={readOnly}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              isDark={isDark}
            />
            {/* Sample panel */}
            {!readOnly && (
              <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                <Box
                  onClick={() => setSamplesOpen((v) => !v)}
                  sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}
                >
                  <SchemaIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
                    {t("sampleDiagrams")}
                  </Typography>
                  {samplesOpen ? <ExpandLessIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
                </Box>
                {samplesOpen && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, px: 1.5, pb: 1.5 }}>
                    {currentLangSample && (
                      <Chip
                        label={`${language} (Hello World)`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        onClick={() => handleInsertSample(currentLangSample)}
                        sx={{ fontSize: "0.7rem", height: 26 }}
                      />
                    )}
                    {sampleEntries
                      .filter(([lang]) => lang !== language)
                      .map(([lang, code]) => (
                        <Chip
                          key={lang}
                          label={lang}
                          size="small"
                          onClick={() => handleInsertSample(code)}
                          sx={{ fontSize: "0.7rem", height: 26 }}
                        />
                      ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {/* Draggable divider (desktop only) */}
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label={t("resizeSplitter")}
            aria-valuenow={fsSplitPx}
            aria-valuemin={120}
            aria-valuemax={1200}
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "ArrowLeft") {
                setFsSplitPx((v) => Math.max(120, v - 40));
                e.preventDefault();
              } else if (e.key === "ArrowRight") {
                setFsSplitPx((v) => v + 40);
                e.preventDefault();
              }
            }}
            onPointerDown={(e: React.PointerEvent) => {
              setFsDragging(true);
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            sx={{
              display: isMobile ? "none" : "block",
              width: 4,
              cursor: "col-resize",
              bgcolor: "divider",
              flexShrink: 0,
              "&:hover": { bgcolor: "primary.main" },
              "&:focus-visible": { bgcolor: "primary.main", outline: "2px solid", outlineColor: "primary.main" },
              transition: "background-color 0.15s",
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          />
          {/* Horizontal divider (mobile only) */}
          <Divider sx={{ display: isMobile ? "block" : "none" }} />
          {/* Preview area */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Zoom toolbar */}
            <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: 32 }}>
              <Tooltip title={t("zoomOut")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.zoomOut} aria-label={t("zoomOut")}>
                  <ZoomOutIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("zoomIn")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.zoomIn} aria-label={t("zoomIn")}>
                  <ZoomInIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
              {fsZP.isDirty && (
                <Tooltip title={t("zoomReset")} placement="bottom">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.reset} aria-label={t("zoomReset")}>
                    <RestartAltIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  </IconButton>
                </Tooltip>
              )}
              <Typography variant="caption" sx={{ minWidth: 36, textAlign: "center", fontSize: "0.7rem" }}>
                {Math.round(fsZP.zoom * 100)}%
              </Typography>
            </Box>
            {/* Preview */}
            <Box
              sx={{
                flex: 1,
                overflow: "hidden",
                bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
                cursor: fsDragging ? "col-resize" : "grab",
                "&:active": { cursor: fsDragging ? "col-resize" : "grabbing" },
                pointerEvents: fsDragging ? "none" : "auto",
              }}
              onPointerDown={fsZP.handlePointerDown}
              onPointerMove={fsZP.handlePointerMove}
              onPointerUp={fsZP.handlePointerUp}
              onWheel={fsZP.handleWheel}
            >
              <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "flex-start", alignItems: "flex-start", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "top left", transition: fsZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    p: 2,
                    m: 0,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    color: "text.primary",
                    "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: isDark ? "#ff7b72" : "#cf222e" },
                    "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: isDark ? "#a5d6ff" : "#0a3069" },
                    "& .hljs-comment, & .hljs-doctag": { color: isDark ? "#8b949e" : "#6e7781" },
                    "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: isDark ? "#79c0ff" : "#0550ae" },
                    "& .hljs-title": { color: isDark ? "#d2a8ff" : "#8250df" },
                    "& .hljs-params": { color: isDark ? "#c9d1d9" : "#24292f" },
                    "& .hljs-meta": { color: isDark ? "#ffa657" : "#953800" },
                    "& .hljs-symbol, & .hljs-bullet": { color: isDark ? "#ffa657" : "#953800" },
                    "& .hljs-property, & .hljs-name": { color: isDark ? "#79c0ff" : "#0550ae" },
                  }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedHtml, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] }) }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
