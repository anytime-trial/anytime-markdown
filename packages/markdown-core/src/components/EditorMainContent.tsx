import { Box } from "@mui/material";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { useCallback } from "react";

import { FILE_DROP_OVERLAY_COLOR } from "../constants/colors";
import { COMMENT_PANEL_WIDTH } from "../constants/dimensions";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { getMarkdownFromEditor, type HeadingItem } from "../types";
import type { DiffLine } from "../utils/diffEngine";
import { CommentPanel } from "./CommentPanel";
import { EditorContentArea } from "./EditorContentArea";
import { EditorMergeContent } from "./EditorMergeContent";
import { EditorOutlineSection } from "./EditorOutlineSection";
import { EditorSideToolbar } from "./EditorSideToolbar";
import { OutlinePanel } from "./OutlinePanel";

// InlineMergeView は dynamic import のため親から渡す
type InlineMergeViewComponent = React.ComponentType<{
  rightEditor?: Editor | null;
  editorContent: string;
  sourceMode: boolean;
  editorHeight: number;
  t: (key: string) => string;
  leftFrontmatter?: string | null;
  onLeftFrontmatterChange?: (value: string | null) => void;
  onUndoRedoReady?: (ur: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
  onLeftTextChange?: (text: string) => void;
  externalRightContent?: string | null;
  onExternalRightContentConsumed?: () => void;
  onRightFileOpsReady?: (ops: { loadFile: () => void; exportFile: () => void }) => void;
  commentSlot?: React.ReactNode;
  children: (
    leftBgGradient: string,
    leftDiffLines?: DiffLine[],
    onMerge?: (blockId: number, direction: "left-to-right" | "right-to-left") => void,
    onHoverLine?: (lineIndex: number | null) => void,
  ) => React.ReactNode;
}>;

export interface OutlineProps {
  isMd: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  outlineWidth: number;
  setOutlineWidth: React.Dispatch<React.SetStateAction<number>>;
  editorHeight: number;
  headings: HeadingItem[];
  foldedIndices: Set<number>;
  hiddenByFold: Set<number>;
  foldAll: () => void;
  unfoldAll: () => void;
  toggleFold: (index: number) => void;
  handleOutlineClick: (pos: number) => void;
  handleOutlineResizeStart: (e: React.MouseEvent) => void;
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
  onInsertSectionNumbers?: () => void;
  onRemoveSectionNumbers?: () => void;
  t: (key: string) => string;
}

interface EditorMainContentProps {
  inlineMergeOpen: boolean;
  InlineMergeView: InlineMergeViewComponent;
  editor: Editor | null;
  sourceMode: boolean;
  readonlyMode: boolean;
  reviewMode: boolean;
  editorHeight: number;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  editorMountCallback: (node: HTMLDivElement | null) => void;
  sourceText: string;
  handleSourceChange: (text: string) => void;
  sourceTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  sourceSearchOpen: boolean;
  setSourceSearchOpen: (open: boolean) => void;
  sourceSearch: TextareaSearchState;
  frontmatterText: string | null;
  handleFrontmatterChange: (value: string | null) => void;
  commentOpen: boolean;
  setCommentOpen: (open: boolean) => void;
  saveContent: (md: string) => void;
  outlineProps: OutlineProps;
  editorMarkdown: string;
  setMergeUndoRedo: (v: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null) => void;
  compareFileContent: string | null;
  setCompareFileContent: (v: string | null) => void;
  setRightFileOps: (ops: { loadFile: () => void; exportFile: () => void } | null) => void;
  onFileDrop?: (file: File, nativeHandle?: FileSystemFileHandle) => void;
  fileDragOver?: boolean;
  onFileDragOverChange?: (over: boolean) => void;
  sideToolbar?: boolean;
  onToggleOutline?: () => void;
  explorerOpen?: boolean;
  onToggleExplorer?: () => void;
  onOpenSettings?: () => void;
  explorerSlot?: React.ReactNode;
  noScroll?: boolean;
  t: (key: string) => string;
}

export function EditorMainContent({
  inlineMergeOpen,
  InlineMergeView,
  editor,
  sourceMode,
  readonlyMode,
  reviewMode,
  editorHeight,
  editorContainerRef,
  editorWrapperRef,
  editorMountCallback,
  sourceText,
  handleSourceChange,
  sourceTextareaRef,
  sourceSearchOpen,
  setSourceSearchOpen,
  sourceSearch,
  frontmatterText,
  handleFrontmatterChange,
  commentOpen,
  setCommentOpen,
  saveContent,
  outlineProps,
  editorMarkdown,
  setMergeUndoRedo,
  compareFileContent,
  setCompareFileContent,
  setRightFileOps,
  onFileDrop,
  fileDragOver,
  onFileDragOverChange,
  sideToolbar,
  onToggleOutline,
  explorerOpen,
  onToggleExplorer,
  onOpenSettings,
  explorerSlot,
  noScroll,
  t,
}: Readonly<EditorMainContentProps>) {
  // --- ドラッグ＆ドロップ ---
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    onFileDragOverChange?.(true);
  }, [onFileDragOverChange]);

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onFileDragOverChange?.(false);
    }
  }, [onFileDragOverChange]);

  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    onFileDragOverChange?.(false);
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.name.endsWith(".md") || f.name.endsWith(".markdown") || f.type.startsWith("text/"),
    );
    if (!file) return;
    e.preventDefault();
    const items = e.dataTransfer.items;
    const mdItem = items ? Array.from(items).find((item) => item.kind === "file" && (file.name.endsWith(".md") || file.name.endsWith(".markdown"))) : null;
    const mdItemAny = mdItem as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | null;
    if (mdItemAny?.getAsFileSystemHandle) {
      mdItemAny.getAsFileSystemHandle().then((handle: FileSystemHandle | null) => {
        onFileDrop?.(file, handle?.kind === "file" ? handle as FileSystemFileHandle : undefined);
      }).catch(() => { onFileDrop?.(file); });
    } else {
      onFileDrop?.(file);
    }
  }, [onFileDrop, onFileDragOverChange]);

  // --- 共通スロット ---
  const sideOutlineSlot = sideToolbar && outlineProps.outlineOpen && !sourceMode ? (
    <OutlinePanel
      outlineWidth={COMMENT_PANEL_WIDTH}
      setOutlineWidth={outlineProps.setOutlineWidth}
      editorHeight={outlineProps.editorHeight}
      headings={outlineProps.headings}
      foldedIndices={outlineProps.foldedIndices}
      hiddenByFold={outlineProps.hiddenByFold}
      foldAll={outlineProps.foldAll}
      unfoldAll={outlineProps.unfoldAll}
      toggleFold={outlineProps.toggleFold}
      handleOutlineClick={outlineProps.handleOutlineClick}
      handleOutlineResizeStart={outlineProps.handleOutlineResizeStart}
      hideResize={sideToolbar}
      onHeadingDragEnd={outlineProps.onHeadingDragEnd}
      onOutlineDelete={outlineProps.onOutlineDelete}
      onInsertSectionNumbers={outlineProps.onInsertSectionNumbers}
      onRemoveSectionNumbers={outlineProps.onRemoveSectionNumbers}
      t={t}
    />
  ) : null;

  const commentSlot = commentOpen && editor && !sourceMode ? (
    <CommentPanel editor={editor} open={commentOpen} onClose={() => setCommentOpen(false)} onSave={() => saveContent(getMarkdownFromEditor(editor))} t={t} />
  ) : null;

  const sideToolbarNode = sideToolbar ? (
    <EditorSideToolbar
      sourceMode={sourceMode}
      outlineOpen={outlineProps.outlineOpen}
      commentOpen={commentOpen}
      explorerOpen={explorerOpen}
      onToggleOutline={onToggleOutline}
      onToggleComment={setCommentOpen}
      onToggleExplorer={onToggleExplorer}
      onOpenSettings={onOpenSettings}
      t={t}
    />
  ) : null;

  // --- 比較モード ---
  if (inlineMergeOpen) {
    return (
      <Box ref={editorContainerRef} sx={{ display: "flex", flexDirection: "row", height: editorHeight }}>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <EditorMergeContent
          InlineMergeView={InlineMergeView}
          editor={editor}
          sourceMode={sourceMode}
          reviewMode={readonlyMode || reviewMode}
          editorHeight={editorHeight}
          editorWrapperRef={editorWrapperRef}
          editorMountCallback={editorMountCallback}
          sourceText={sourceText}
          handleSourceChange={handleSourceChange}
          frontmatterText={frontmatterText}
          handleFrontmatterChange={handleFrontmatterChange}
          editorMarkdown={editorMarkdown}
          setMergeUndoRedo={setMergeUndoRedo}
          compareFileContent={compareFileContent}
          setCompareFileContent={setCompareFileContent}
          setRightFileOps={setRightFileOps}
          outlineProps={outlineProps}
          sideToolbar={sideToolbar}
          commentSlot={commentSlot}
          fileDragOver={fileDragOver}
          onDragOver={handleContainerDragOver}
          onDragLeave={handleContainerDragLeave}
          onDrop={handleContainerDrop}
          t={t}
        />
      </Box>
      <Box data-print-hide="">{sideToolbar && commentSlot}</Box>
      <Box data-print-hide="">{sideOutlineSlot}</Box>
      <Box data-print-hide="">{sideToolbar && explorerOpen && explorerSlot}</Box>
      <Box data-print-hide="">{sideToolbarNode}</Box>
      </Box>
    );
  }

  // --- 通常モード ---
  return (
    <Box component="main" ref={editorContainerRef} sx={{ display: "flex", flexDirection: "row", position: "relative" }} onDragOver={handleContainerDragOver} onDragLeave={handleContainerDragLeave} onDrop={handleContainerDrop}>
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
      <Box sx={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
      {fileDragOver && <Box sx={{ position: "absolute", inset: 0, bgcolor: FILE_DROP_OVERLAY_COLOR, zIndex: 10, pointerEvents: "none" }} />}
      {!sourceMode && !sideToolbar && <EditorOutlineSection {...outlineProps} />}

      <EditorContentArea
        editor={editor}
        sourceMode={sourceMode}
        readonlyMode={readonlyMode}
        reviewMode={reviewMode}
        editorHeight={editorHeight}
        editorWrapperRef={editorWrapperRef}
        editorMountCallback={editorMountCallback}
        sourceText={sourceText}
        handleSourceChange={handleSourceChange}
        sourceTextareaRef={sourceTextareaRef}
        sourceSearchOpen={sourceSearchOpen}
        setSourceSearchOpen={setSourceSearchOpen}
        sourceSearch={sourceSearch}
        frontmatterText={frontmatterText}
        handleFrontmatterChange={handleFrontmatterChange}
        noScroll={noScroll}
        t={t}
      />

      <Box data-print-hide="">{commentSlot}</Box>
      <Box data-print-hide="">{sideOutlineSlot}</Box>
      <Box data-print-hide="">{sideToolbar && explorerOpen && explorerSlot}</Box>
      </Box>
      </Box>
      <Box data-print-hide="">{sideToolbarNode}</Box>
    </Box>
  );
}
