import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SchemaIcon from "@mui/icons-material/Schema";
import { Box, Chip, Dialog, DialogTitle, Divider, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import React, { useCallback, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { MATH_SAMPLES } from "../constants/samples";
import { MATH_SANITIZE_CONFIG, useKatexRender } from "../hooks/useKatexRender";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useEditorSettingsContext } from "../useEditorSettings";
import { FsSearchBar } from "./FsSearchBar";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";

interface MathFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
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

export function MathFullscreenDialog({
  open, onClose, label,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, toolbarExtra,
  t,
}: MathFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();

  const [fsSplitPx, setFsSplitPx] = useState(500);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // Live math preview
  const { html: mathHtml, error: mathError } = useKatexRender({ code: fsCode, isMath: open });

  // --- Sample panel ---
  const [samplesOpen, setSamplesOpen] = useState(false);
  const handleInsertSample = useCallback((sampleCode: string) => {
    onFsTextChange(sampleCode);
  }, [onFsTextChange]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="math-fullscreen-title"
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
        <DialogTitle id="math-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
          {label}{showCompareView ? ` - ${t("compare")}` : ""}
        </DialogTitle>
        {!showCompareView && (
          <FsSearchBar search={fsSearch} t={t} />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ ml: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Compare view */}
      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        /* Normal view: Code + Divider + Preview */
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
                    {MATH_SAMPLES.filter((s) => s.enabled).map((sample) => (
                      <Chip
                        key={sample.label}
                        label={t(sample.i18nKey)}
                        size="small"
                        onClick={() => handleInsertSample(sample.code)}
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
          {/* Math preview */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              p: 4,
              pointerEvents: fsDragging ? "none" : "auto",
            }}
          >
            {mathError && (
              <Typography color="error" sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                {mathError}
              </Typography>
            )}
            {mathHtml && (
              <Box
                role="img"
                aria-label={`${t("mathFormula")}: ${fsCode}`}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
                sx={{ "& .katex": { fontSize: "1.5em" } }}
              />
            )}
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
