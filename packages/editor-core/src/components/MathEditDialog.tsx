import FunctionsIcon from "@mui/icons-material/Functions";
import { Box, Typography, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import React, { useCallback, useRef, useState } from "react";

import { FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { MATH_SAMPLES } from "../constants/samples";
import { MATH_SANITIZE_CONFIG, useKatexRender } from "../hooks/useKatexRender";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomToolbar } from "./ZoomToolbar";
import { ZoomablePreview } from "./ZoomablePreview";

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
  thisCode?: string;
  toolbarExtra?: React.ReactNode;
  t: (key: string) => string;
}

export function MathEditDialog({
  open, onClose, label,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, thisCode, toolbarExtra,
  t,
}: MathEditDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

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
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<FunctionsIcon sx={{ fontSize: 18 }} />} t={t} />

      {/* Compare view */}
      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={thisCode ?? fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        /* Normal view: Code + Divider + Preview */
        <DraggableSplitLayout
          t={t}
          left={
            <>
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
            </>
          }
          right={
            <>
              <ZoomToolbar fsZP={fsZP} t={t} />
              <ZoomablePreview fsZP={fsZP}>
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
              </ZoomablePreview>
            </>
          }
        />
      )}
    </EditDialogWrapper>
  );
}
