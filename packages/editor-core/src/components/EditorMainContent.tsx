import { Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";

import { getEditorPaperSx } from "../styles/editorStyles";
import { useEditorSettings } from "../useEditorSettings";
import { EditorOutlineSection } from "./EditorOutlineSection";
import { SourceModeEditor } from "./SourceModeEditor";
import { SourceSearchBar } from "./SourceSearchBar";
import { SearchReplaceBar } from "./SearchReplaceBar";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { CommentPanel } from "./CommentPanel";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { getMarkdownFromEditor } from "../types";
import type { TextareaSearch } from "../hooks/useTextareaSearch";

// InlineMergeView は dynamic import のため親から渡す
type InlineMergeViewComponent = React.ComponentType<{
  leftEditor: Editor | null;
  editorContent: string;
  sourceMode: boolean;
  editorHeight: number;
  t: (key: string) => string;
  onUndoRedoReady: (v: { undo: () => void; redo: () => void } | null) => void;
  onLeftTextChange: (text: string) => void;
  externalRightContent: string | null;
  onExternalRightContentConsumed: () => void;
  onRightFileOpsReady: (ops: { loadFile: () => void; exportFile: () => void } | null) => void;
  children: (leftBgGradient: string, leftDiffLines: Set<number>, onMerge: (direction: "left" | "right", lineIndex: number) => void, onHoverLine: (line: number | null) => void) => React.ReactNode;
}>;

interface OutlineProps {
  isMd: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  outlineWidth: number;
  setOutlineWidth: (w: number) => void;
  editorHeight: number;
  headings: Array<{ level: number; text: string; pos: number }>;
  foldedIndices: Set<number>;
  hiddenByFold: Set<number>;
  foldAll: () => void;
  unfoldAll: () => void;
  toggleFold: (index: number) => void;
  handleOutlineClick: (pos: number) => void;
  handleOutlineResizeStart: (e: React.MouseEvent) => void;
  onHeadingDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  onOutlineDelete?: (pos: number) => void;
  showHeadingNumbers: boolean;
  onToggleHeadingNumbers: () => void;
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
  sourceSearch: TextareaSearch;
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
  setMergeUndoRedo: (v: { undo: () => void; redo: () => void } | null) => void;
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
  const settings = useEditorSettings().settings;

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
            <FrontmatterBlock frontmatter={frontmatterText} onChange={handleFrontmatterChange} readOnly={readonlyMode || reviewMode} t={t} />
            <Paper
              id="md-editor-content"
              variant="outlined"
              sx={getEditorPaperSx(theme, settings, editorHeight, { readonlyMode })}
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
