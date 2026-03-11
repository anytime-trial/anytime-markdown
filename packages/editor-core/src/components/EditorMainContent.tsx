import { Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";

import { getEditorPaperSx } from "../styles/editorStyles";
import { useEditorSettingsContext } from "../useEditorSettings";
import type { DiffLine } from "../utils/diffEngine";
import { EditorOutlineSection } from "./EditorOutlineSection";
import { SourceModeEditor } from "./SourceModeEditor";
import { SourceSearchBar } from "./SourceSearchBar";
import { SearchReplaceBar } from "./SearchReplaceBar";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { CommentPanel } from "./CommentPanel";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { getMarkdownFromEditor, type HeadingItem } from "../types";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";

// InlineMergeView は dynamic import のため親から渡す
// InlineMergeViewProps と同じシグネチャにする
type InlineMergeViewComponent = React.ComponentType<{
  leftEditor?: Editor | null;
  editorContent: string;
  sourceMode: boolean;
  editorHeight: number;
  t: (key: string) => string;
  onUndoRedoReady?: (ur: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
  onLeftTextChange?: (text: string) => void;
  externalRightContent?: string | null;
  onExternalRightContentConsumed?: () => void;
  onRightFileOpsReady?: (ops: { loadFile: () => void; exportFile: () => void }) => void;
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
  }, [frontmatterText]);
  const adjustedEditorHeight = editorHeight - frontmatterHeight;

  if (inlineMergeOpen) {
    return (
      <InlineMergeView
        leftEditor={editor}
        editorContent={sourceMode ? sourceText : editorMarkdown}
        sourceMode={sourceMode}
        editorHeight={editorHeight}
        t={t}
        onUndoRedoReady={setMergeUndoRedo}
        onLeftTextChange={handleSourceChange}
        externalRightContent={compareFileContent}
        onExternalRightContentConsumed={() => setCompareFileContent(null)}
        onRightFileOpsReady={setRightFileOps}
      >
        {(leftBgGradient, leftDiffLines, onMerge, onHoverLine) => (
        <Box component="main" ref={editorContainerRef} sx={{ display: "flex", gap: 0, height: "100%" }}>
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
    <Box component="main" ref={editorContainerRef} sx={{ display: "flex", gap: 0 }}>
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
  );
}
