import { Box, Divider, Typography, useMediaQuery, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import React, { useCallback, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { REDUCED_MOTION_SX, SPLITTER_SX, TRANSITION_FAST } from "../constants/uiPatterns";
import { MATH_SAMPLES } from "../constants/samples";
import { MATH_SANITIZE_CONFIG, useKatexRender } from "../hooks/useKatexRender";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomToolbar } from "./ZoomToolbar";

interface MathEditDialogProps {
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

export function MathEditDialog({
  open, onClose, label,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, toolbarExtra,
  t,
}: MathEditDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();

  const [fsSplitPx, setFsSplitPx] = useState(FS_CODE_INITIAL_WIDTH);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // Zoom/pan for preview
  const fsZP = useZoomPan();

  // Live math preview
  const { html: mathHtml, error: mathError } = useKatexRender({ code: fsCode, isMath: open });

  // --- Sample panel ---
  const handleInsertSample = useCallback((sampleCode: string) => {
    onFsTextChange(sampleCode);
  }, [onFsTextChange]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="math-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} t={t} />

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
            <SamplePanel samples={MATH_SAMPLES.filter(s => s.enabled)} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
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
              <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "center center", transition: fsZP.isPanningRef.current ? "none" : `transform ${TRANSITION_FAST}`, ...REDUCED_MOTION_SX, pointerEvents: "none" }}>
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
          </Box>
        </Box>
      )}
    </EditDialogWrapper>
  );
}
