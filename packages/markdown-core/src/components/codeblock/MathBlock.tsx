"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { Alert, Box, IconButton, Tooltip } from "@mui/material";
import DOMPurify from "dompurify";
import { useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getPrimaryMain, getTextSecondary } from "../../constants/colors";
import { PREVIEW_MAX_HEIGHT } from "../../constants/dimensions";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useBlockResize } from "../../hooks/useBlockResize";
import { MATH_SANITIZE_CONFIG,useKatexRender } from "../../hooks/useKatexRender";
import { MathEditDialog } from "../MathEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { GraphView } from "./GraphView";
import { shouldShowBorder, shouldShowToolbar } from "./compareHelpers";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";

type MathBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable"
> & {
  handleFsTextChange: (newCode: string) => void;
};

export function MathBlock(props: MathBlockProps) {
  const {
    editor, node, updateAttributes, getPos,
    codeCollapsed, isSelected,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange,
    t, isDark,
  } = props;

  const [graphEnabled, setGraphEnabled] = useState(false);
  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath: true });

  const mathContainerRef = useRef<HTMLDivElement>(null);
  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef: mathContainerRef, updateAttributes, currentWidth: node.attrs.width });

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos, language: "math", code, editOpen,
  });

  const toolbar = (
    <BlockInlineToolbar
      label="Math"
      onEdit={props.isCompareLeft ? undefined : () => setEditOpen(true)}
      onDelete={props.isCompareLeft ? undefined : () => setDeleteDialogOpen(true)}
      labelOnly={props.isCompareLeftEditable}
      labelDivider
      extra={
        !props.isCompareLeft && !props.isCompareLeftEditable ? (
          <Tooltip title={graphEnabled ? t("hideGraph") : t("showGraph")} placement="top">
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              onClick={() => setGraphEnabled(prev => !prev)}
              aria-label={graphEnabled ? t("hideGraph") : t("showGraph")}
            >
              <ShowChartIcon sx={{ fontSize: 16, color: graphEnabled ? getPrimaryMain(isDark) : getTextSecondary(isDark) }} />
            </IconButton>
          </Tooltip>
        ) : undefined
      }
      t={t}
    />
  );

  return (
    <CodeBlockFrame
      toolbar={shouldShowToolbar({ isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable }) ? toolbar : null}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={shouldShowBorder({ isSelected, isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable })}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <MathEditDialog
          open={editOpen}
          onClose={() => { fsSearch.reset(); setEditOpen(false); }}
          label="Math"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          onFsTextChange={handleFsTextChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          readOnly={!props.isEditable}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          thisCode={thisCode}
          toolbarExtra={
            <Tooltip title={t("copyCode")} placement="bottom">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                <ContentCopyIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
              </IconButton>
            </Tooltip>
          }
          t={t}
        />
      }
    >
      {mathError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
      )}
      {mathHtml && (
        <Box
          ref={mathContainerRef}
          contentEditable={false}
          role="img"
          aria-label={`${t("mathFormula")}: ${code}`}
          onClick={() => { selectNode(); if (!codeCollapsed) updateAttributes({ codeCollapsed: true }); }}
          onDoubleClick={() => setEditOpen(true)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          sx={{ pt: 0, px: 2, pb: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, borderTop: codeCollapsed ? 0 : 1, borderColor: getDivider(isDark), overflow: "auto", maxHeight: PREVIEW_MAX_HEIGHT, display: "flex", justifyContent: "flex-start", cursor: "pointer", position: "relative", width: displayWidth || "fit-content", maxWidth: "100%" }}
        >
          <Box
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
            sx={{ pointerEvents: "none" }}
          />
          <ResizeGrip visible={isSelected && props.isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </Box>
      )}
      <GraphView code={code} enabled={graphEnabled} isDark={isDark} />
    </CodeBlockFrame>
  );
}
