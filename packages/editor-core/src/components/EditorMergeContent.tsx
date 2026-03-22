import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { useEffect } from "react";

import { FILE_DROP_OVERLAY_COLOR, getEditorBg } from "../constants/colors";
import { getMergeEditors, setMergeEditors } from "../contexts/MergeEditorsContext";
import { useEditorSettingsContext } from "../useEditorSettings";
import type { DiffLine } from "../utils/diffEngine";
import type { OutlineProps } from "./EditorMainContent";
import { EditorOutlineSection } from "./EditorOutlineSection";
import { MergeEditorPanel } from "./MergeEditorPanel";

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

export interface EditorMergeContentProps {
  InlineMergeView: InlineMergeViewComponent;
  editor: Editor | null;
  sourceMode: boolean;
  reviewMode?: boolean;
  editorHeight: number;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  editorMountCallback: (node: HTMLDivElement | null) => void;
  sourceText: string;
  handleSourceChange: (text: string) => void;
  frontmatterText: string | null;
  handleFrontmatterChange: (value: string | null) => void;
  editorMarkdown: string;
  setMergeUndoRedo: (v: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null) => void;
  compareFileContent: string | null;
  setCompareFileContent: (v: string | null) => void;
  setRightFileOps: (ops: { loadFile: () => void; exportFile: () => void } | null) => void;
  outlineProps: OutlineProps;
  sideToolbar?: boolean;
  commentSlot: React.ReactNode;
  fileDragOver?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  t: (key: string) => string;
}

export function EditorMergeContent({
  InlineMergeView,
  editor,
  sourceMode,
  reviewMode,
  editorHeight,
  editorWrapperRef,
  editorMountCallback,
  sourceText,
  handleSourceChange,
  frontmatterText,
  handleFrontmatterChange,
  editorMarkdown,
  setMergeUndoRedo,
  compareFileContent,
  setCompareFileContent,
  setRightFileOps,
  outlineProps,
  sideToolbar,
  commentSlot,
  fileDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  t,
}: Readonly<EditorMergeContentProps>) {
  const theme = useTheme();

  // reviewMode を MergeEditorsContext に反映
  useEffect(() => {
    const current = getMergeEditors();
    if (current) {
      setMergeEditors({ ...current, isReviewMode: !!reviewMode });
    }
  }, [reviewMode]);
  const settings = useEditorSettingsContext();

  return (
    <InlineMergeView
      rightEditor={editor}
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
      commentSlot={sideToolbar ? undefined : commentSlot}
    >
      {(leftBgGradient, leftDiffLines, _onMerge, onHoverLine) => (
      <Box component="main" sx={{ display: "flex", gap: 0, height: "100%", position: "relative" }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {fileDragOver && <Box sx={{ position: "absolute", inset: 0, bgcolor: FILE_DROP_OVERLAY_COLOR, zIndex: 10, pointerEvents: "none" }} />}
        {!sideToolbar && <EditorOutlineSection {...outlineProps} />}
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
            side="right"
            showHoverLabels
            onHoverLine={onHoverLine}
            paperSx={{
              bgcolor: getEditorBg(theme.palette.mode === "dark", settings),
            }}
          />
        </Box>
      </Box>
      )}
    </InlineMergeView>
  );
}
