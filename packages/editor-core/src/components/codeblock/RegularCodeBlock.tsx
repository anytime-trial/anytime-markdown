"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getMergeEditors, findCounterpartCode, getCodeBlockIndex, findCodeBlockByIndex } from "../../contexts/MergeEditorsContext";
import { CodeBlockFullscreenDialog } from "../CodeBlockFullscreenDialog";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

type RegularCodeBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "getPos" | "code"
  | "allCollapsed" | "isSelected" | "toggleAllCollapsed" | "handleDragKeyDown"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
>;

export function RegularCodeBlock(props: RegularCodeBlockProps) {
  const {
    editor, node, getPos, code,
    allCollapsed, isSelected, toggleAllCollapsed, handleDragKeyDown,
    handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    t, isDark,
  } = props;

  const language = node.attrs.language;
  const codeLabel = language ? `Code (${language})` : "Code";

  // 比較モード: 対応するブロックのコードを取得
  const mergeEditors = getMergeEditors();
  const isCompareMode = !!mergeEditors;
  const compareCode = useMemo(() => {
    if (!fullscreen || !mergeEditors || !editor) return null;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;
    return findCounterpartCode(editor, otherEditor, language, code);
  }, [fullscreen, mergeEditors, editor, language, code]);

  const blockIndexRef = useRef(-1);
  useEffect(() => {
    if (fullscreen && mergeEditors && editor) {
      blockIndexRef.current = getCodeBlockIndex(editor, language, code);
    }
  }, [fullscreen, mergeEditors, editor, language, code]);

  const handleMergeApply = useCallback((newThisCode: string, newOtherCode: string) => {
    if (!mergeEditors || !editor || blockIndexRef.current === -1) return;
    const isRight = !!editor.view?.dom?.dataset?.reviewMode;
    const otherEditor = isRight ? mergeEditors.leftEditor : mergeEditors.rightEditor;

    const thisBlock = findCodeBlockByIndex(editor, language, blockIndexRef.current);
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
      const otherBlock = findCodeBlockByIndex(otherEditor, language, blockIndexRef.current);
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
  }, [mergeEditors, editor, language]);

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
        {codeLabel}
      </Typography>
      <Box sx={{ flex: 1 }} />
      {!allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
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
      isDark={isDark}
      showBorder={allCollapsed || isSelected}
      codeMaxHeight={400}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <CodeBlockFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label={codeLabel}
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          t={t}
        />
      }
    />
  );
}
