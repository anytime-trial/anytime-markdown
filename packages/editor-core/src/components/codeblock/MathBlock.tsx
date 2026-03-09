"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import SchemaIcon from "@mui/icons-material/Schema";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DOMPurify from "dompurify";
import { useKatexRender, MATH_SANITIZE_CONFIG } from "../../hooks/useKatexRender";
import { CodeBlockFullscreenDialog } from "../CodeBlockFullscreenDialog";
import { MathSamplePopover } from "../MathSamplePopover";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { getMergeEditors, findCounterpartCode, getCodeBlockIndex, findCodeBlockByIndex } from "../../contexts/MergeEditorsContext";
import type { CodeBlockSharedProps } from "./types";

type MathBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "getPos"
  | "allCollapsed" | "codeCollapsed" | "isSelected" | "toggleAllCollapsed"
  | "selectNode" | "handleDragKeyDown" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
>;

export function MathBlock(props: MathBlockProps) {
  const {
    editor, node, getPos,
    allCollapsed, codeCollapsed, isSelected, toggleAllCollapsed,
    selectNode, handleDragKeyDown, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    t, isDark,
  } = props;

  const [mathSampleAnchorEl, setMathSampleAnchorEl] = useState<HTMLElement | null>(null);
  const { html: mathHtml, error: mathError } = useKatexRender({ code, isMath: true });

  // 比較モード: 対応するブロックのコードを取得
  const mergeEditors = getMergeEditors();
  const isCompareMode = !!mergeEditors;
  const compareCode = useMemo(() => {
    if (!fullscreen || !mergeEditors || !editor) return null;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;
    return findCounterpartCode(editor, otherEditor, "math", code);
  }, [fullscreen, mergeEditors, editor, code]);

  const blockIndexRef = useRef(-1);
  useEffect(() => {
    if (fullscreen && mergeEditors && editor) {
      blockIndexRef.current = getCodeBlockIndex(editor, "math", code);
    }
  }, [fullscreen, mergeEditors, editor, code]);

  const handleMergeApply = useCallback((newThisCode: string, newOtherCode: string) => {
    if (!mergeEditors || !editor || blockIndexRef.current === -1) return;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;

    const thisBlock = findCodeBlockByIndex(editor, "math", blockIndexRef.current);
    if (thisBlock) {
      editor.chain().command(({ tr }) => {
        const from = thisBlock.pos + 1;
        const to = from + thisBlock.size;
        if (newThisCode) tr.replaceWith(from, to, editor.schema.text(newThisCode));
        else tr.delete(from, to);
        return true;
      }).run();
    }

    if (otherEditor) {
      const otherBlock = findCodeBlockByIndex(otherEditor, "math", blockIndexRef.current);
      if (otherBlock) {
        otherEditor.chain().command(({ tr }) => {
          const from = otherBlock.pos + 1;
          const to = from + otherBlock.size;
          if (newOtherCode) tr.replaceWith(from, to, otherEditor.schema.text(newOtherCode));
          else tr.delete(from, to);
          return true;
        }).run();
      }
    }
  }, [mergeEditors, editor]);

  const toolbar = (
    <Box
      data-block-toolbar=""
      sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
      contentEditable={false}
    >
      <Box
        data-drag-handle=""
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-label={t("dragHandle")}
        onKeyDown={handleDragKeyDown}
        sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
      </Box>
      {!allCollapsed && (
        <Tooltip title={t("fullscreen")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
            <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
        Math
      </Typography>
      {!allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title={t("insertSample")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMathSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
            <SchemaIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      </>)}
      <Box sx={{ flex: 1 }} />
      {!allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title={t("copyCode")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
            <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </>)}
    </Box>
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      allCollapsed={allCollapsed}
      codeCollapsed={codeCollapsed}
      isDark={isDark}
      showBorder={(allCollapsed || isSelected) && editor.isEditable}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={<>
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label="Math"
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          t={t}
        />
        <MathSamplePopover
          anchorEl={mathSampleAnchorEl}
          onClose={() => setMathSampleAnchorEl(null)}
          editor={editor}
          t={t}
          getPos={getPos}
          nodeContentSize={node.content.size}
        />
      </>}
    >
      {!allCollapsed && mathError && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>{mathError}</Alert>
      )}
      {!allCollapsed && mathHtml && (
        <Box
          contentEditable={false}
          role="img"
          aria-label={t("mathFormula")}
          onClick={selectNode}
          sx={{ pt: 0, px: 2, pb: 2, bgcolor: "background.paper", borderTop: codeCollapsed ? 0 : 1, borderColor: "divider", overflow: "auto", maxHeight: 400, display: "flex", justifyContent: "flex-start" }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
        />
      )}
    </CodeBlockFrame>
  );
}
