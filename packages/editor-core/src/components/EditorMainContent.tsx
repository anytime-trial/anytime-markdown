import { Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FILE_DROP_OVERLAY_COLOR, getEditorBg } from "../constants/colors";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { getEditorPaperSx } from "../styles/editorStyles";
import { getMarkdownFromEditor, type HeadingItem } from "../types";
import { useEditorSettingsContext } from "../useEditorSettings";
import type { DiffLine } from "../utils/diffEngine";
import { CommentPanel } from "./CommentPanel";
import { EditorOutlineSection } from "./EditorOutlineSection";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { SearchReplaceBar } from "./SearchReplaceBar";
import { SourceModeEditor } from "./SourceModeEditor";
import { SourceSearchBar } from "./SourceSearchBar";

// InlineMergeView は dynamic import のため親から渡す
// InlineMergeViewProps と同じシグネチャにする
type InlineMergeViewComponent = React.ComponentType<{
  leftEditor?: Editor | null;
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

interface OutlineProps {
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
  // source mode
  sourceText: string;
  handleSourceChange: (text: string) => void;
  sourceTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  sourceSearchOpen: boolean;
  setSourceSearchOpen: (open: boolean) => void;
  sourceSearch: TextareaSearchState;
  // frontmatter
  frontmatterText: string | null;
  handleFrontmatterChange: (value: string | null) => void;
  // comments
  commentOpen: boolean;
  setCommentOpen: (open: boolean) => void;
  saveContent: (md: string) => void;
  // outline
  outlineProps: OutlineProps;
  // merge mode
  editorMarkdown: string;
  setMergeUndoRedo: (v: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null) => void;
  compareFileContent: string | null;
  setCompareFileContent: (v: string | null) => void;
  setRightFileOps: (ops: { loadFile: () => void; exportFile: () => void } | null) => void;
  onFileDrop?: (file: File, nativeHandle?: FileSystemFileHandle) => void;
  fileDragOver?: boolean;
  onFileDragOverChange?: (over: boolean) => void;
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
  t,
}: EditorMainContentProps) {
  const theme = useTheme();
  const settings = useEditorSettingsContext();

  // Frontmatter パネルの高さを測定し editorHeight から差し引く
  const frontmatterRef = useRef<HTMLDivElement>(null);
  const [frontmatterHeight, setFrontmatterHeight] = useState(0);
  useEffect(() => {
    const el = frontmatterRef.current;
    if (!el) { setFrontmatterHeight(0); return; }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFrontmatterHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frontmatterText, sourceMode]);
  const adjustedEditorHeight = editorHeight - frontmatterHeight;

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
    // File System Access API でネイティブハンドルを取得（対応ブラウザのみ）
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

  if (inlineMergeOpen) {
    return (
      <InlineMergeView
        leftEditor={editor}
        editorContent={sourceMode ? sourceText : editorMarkdown}
        sourceMode={sourceMode}
        editorHeight={editorHeight}
        t={t}
        leftFrontmatter={frontmatterText}
        onLeftFrontmatterChange={handleFrontmatterChange}
        onUndoRedoReady={setMergeUndoRedo}
        onLeftTextChange={handleSourceChange}
        externalRightContent={compareFileContent}
        onExternalRightContentConsumed={() => setCompareFileContent(null)}
        onRightFileOpsReady={setRightFileOps}
        commentSlot={commentOpen && editor && !sourceMode ? (
          <CommentPanel editor={editor} open={commentOpen} onClose={() => setCommentOpen(false)} onSave={() => saveContent(getMarkdownFromEditor(editor))} t={t} />
        ) : undefined}
      >
        {(leftBgGradient, leftDiffLines, onMerge, onHoverLine) => (
        <Box component="main" ref={editorContainerRef} sx={{ display: "flex", gap: 0, height: "100%", position: "relative" }} onDragOver={handleContainerDragOver} onDragLeave={handleContainerDragLeave} onDrop={handleContainerDrop}>
          {fileDragOver && <Box sx={{ position: "absolute", inset: 0, bgcolor: FILE_DROP_OVERLAY_COLOR, zIndex: 10, pointerEvents: "none" }} />}
          <EditorOutlineSection {...outlineProps} />
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <MergeEditorPanel
              sourceMode={sourceMode}
              sourceText={sourceText}
              onSourceChange={handleSourceChange}
              textareaAriaLabel={t("sourceEditor")}
              editor={editor}
              editorWrapperRef={editorWrapperRef}
              editorMountRef={editorMountCallback}
              autoResize
              bgGradient={leftBgGradient}
              diffLines={leftDiffLines}
              side="left"
              showHoverLabels
              onHoverLine={onHoverLine}
              paperSx={{
                bgcolor: getEditorBg(theme.palette.mode === "dark", settings),
                "&::-webkit-scrollbar": { background: "transparent" },
                "&::-webkit-scrollbar-thumb": { background: "transparent" },
              }}
            />
          </Box>
        </Box>
        )}
      </InlineMergeView>
    );
  }

  return (
    <Box component="main" ref={editorContainerRef} sx={{ display: "flex", flexDirection: "column", position: "relative" }} onDragOver={handleContainerDragOver} onDragLeave={handleContainerDragLeave} onDrop={handleContainerDrop}>
      <Box sx={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
      {fileDragOver && <Box sx={{ position: "absolute", inset: 0, bgcolor: FILE_DROP_OVERLAY_COLOR, zIndex: 10, pointerEvents: "none" }} />}
      {!sourceMode && <EditorOutlineSection {...outlineProps} />}

      {/* Editor */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {sourceMode ? (
          <Box
            sx={{ position: "relative" }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "f") {
                e.preventDefault();
                setSourceSearchOpen(true);
                setTimeout(() => sourceSearch.focusSearch(), 50);
              } else if (e.key === "Escape" && sourceSearchOpen) {
                e.preventDefault();
                setSourceSearchOpen(false);
                sourceSearch.reset();
              }
            }}
          >
            {sourceSearchOpen && (
              <SourceSearchBar
                search={sourceSearch}
                onClose={() => { setSourceSearchOpen(false); sourceSearch.reset(); }}
                t={t}
              />
            )}
            <SourceModeEditor
              sourceText={sourceText}
              onSourceChange={handleSourceChange}
              editorHeight={editorHeight}
              ariaLabel={t("sourceEditor")}
              textareaRef={sourceTextareaRef}
              searchMatches={sourceSearchOpen ? sourceSearch.matches : undefined}
              searchCurrentIndex={sourceSearchOpen ? sourceSearch.currentIndex : undefined}
            />
          </Box>
        ) : (
          <Box
            ref={editorWrapperRef}
            onKeyDown={(readonlyMode || reviewMode) ? (e: React.KeyboardEvent) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "f") {
                e.preventDefault();
                editor?.commands.openSearch();
              }
            } : undefined}
            sx={{ position: "relative", outline: "none" }}
          >
            {editor && <SearchReplaceBar editor={editor} t={t} />}
            <div ref={frontmatterRef}>
              <FrontmatterBlock frontmatter={frontmatterText} onChange={handleFrontmatterChange} readOnly={readonlyMode || reviewMode} t={t} />
            </div>
            <Paper
              id="md-editor-content"
              variant="outlined"
              sx={getEditorPaperSx(theme, settings, adjustedEditorHeight, { readonlyMode })}
            >
              <div ref={editorMountCallback} style={{ display: "contents" }} />
            </Paper>
          </Box>
        )}
      </Box>
      {commentOpen && editor && !sourceMode && (
        <CommentPanel editor={editor} open={commentOpen} onClose={() => setCommentOpen(false)} onSave={() => saveContent(getMarkdownFromEditor(editor))} t={t} />
      )}
      </Box>
    </Box>
  );
}
