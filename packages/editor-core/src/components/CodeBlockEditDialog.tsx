import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DOMPurify from "dompurify";
import { Box, Chip, Divider, Typography, useMediaQuery, useTheme } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { common, createLowlight } from "lowlight";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { FS_CHIP_HEIGHT, FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { REDUCED_MOTION_SX, SPLITTER_SX, TRANSITION_FAST } from "../constants/uiPatterns";
import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomToolbar } from "./ZoomToolbar";

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

interface CodeBlockEditDialogProps {
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
  /** Custom samples to use instead of Hello World samples */
  customSamples?: { label: string; i18nKey: string; code: string }[];
  /** Custom preview renderer (replaces syntax highlight preview) */
  renderPreview?: (code: string) => React.ReactNode;
  t: (key: string) => string;
}

export function CodeBlockEditDialog({
  open, onClose, label, language, fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, toolbarExtra, customSamples, renderPreview,
  t,
}: CodeBlockEditDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();
  const fsZP = useZoomPan();

  const [fsSplitPx, setFsSplitPx] = useState(FS_CODE_INITIAL_WIDTH);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // Set initial split to 50% of container for HTML live preview
  useEffect(() => {
    if (!open || !renderPreview) return;
    requestAnimationFrame(() => {
      if (fsContainerRef.current) {
        const w = fsContainerRef.current.getBoundingClientRect().width;
        if (w > 0) setFsSplitPx(Math.round(w / 2));
      }
    });
  }, [open, renderPreview]);

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
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="codeblock-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} t={t} />

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
              setFsSplitPx(Math.min(rect.width - FS_CODE_MIN_WIDTH, Math.max(FS_CODE_MIN_WIDTH, px)));
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
          <Box sx={{ width: isMobile ? "100%" : `${fsSplitPx}px`, height: isMobile ? "40%" : "auto", minWidth: isMobile ? undefined : FS_CODE_MIN_WIDTH, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
            {/* Code toolbar */}
            <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
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
            {customSamples ? (
              <SamplePanel samples={customSamples} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
            ) : !readOnly && (
              <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                <Box
                  onClick={() => setSamplesOpen((v) => !v)}
                  sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
                    {t("sampleContent")}
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
                        sx={{ fontSize: "0.7rem", height: FS_CHIP_HEIGHT }}
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
                          sx={{ fontSize: "0.7rem", height: FS_CHIP_HEIGHT }}
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
            aria-valuemin={FS_CODE_MIN_WIDTH}
            aria-valuemax={1200}
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "ArrowLeft") {
                setFsSplitPx((v) => Math.max(FS_CODE_MIN_WIDTH, v - 40));
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
            sx={{ display: isMobile ? "none" : "block", ...SPLITTER_SX }}
          />
          {/* Horizontal divider (mobile only) */}
          <Divider sx={{ display: isMobile ? "block" : "none" }} />
          {/* Preview area */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ZoomToolbar fsZP={fsZP} t={t} />
            {/* Preview */}
            {renderPreview ? (
              <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2, pointerEvents: fsDragging ? "none" : "auto" }}>
                {renderPreview(fsCode)}
              </Box>
            ) : (
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
                <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "flex-start", alignItems: "flex-start", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "top left", transition: fsZP.isPanningRef.current ? "none" : `transform ${TRANSITION_FAST}`, ...REDUCED_MOTION_SX, pointerEvents: "none" }}>
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
            )}
          </Box>
        </Box>
      )}
    </EditDialogWrapper>
  );
}
