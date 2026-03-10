import { Box } from "@mui/material";
import type { Editor } from "@tiptap/react";
import type React from "react";

import { EditorToolbar } from "./EditorToolbar";

interface EditorToolbarSectionProps {
  editor: Editor | null;
  isInDiagramBlock: boolean;
  handleToggleAllBlocks: () => void;
  handleDownload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleClear: () => void;
  handleFileSelected: (f: File) => void;
  setTemplateAnchorEl: (el: HTMLElement | null) => void;
  setHelpAnchorEl: (el: HTMLElement | null) => void;
  sourceMode: boolean;
  readonlyMode: boolean;
  reviewMode: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  handleMerge: () => void;
  inlineMergeOpen: boolean;
  handleSwitchToSource: () => void;
  handleSwitchToWysiwyg: () => void;
  handleSwitchToReview: () => void;
  handleSwitchToReadonly: () => void;
  showReadonlyMode?: boolean;
  hideOutline?: boolean;
  hideComments?: boolean;
  hideTemplates?: boolean;
  hideFoldAll?: boolean;
  mergeUndoRedo: { undo: () => void; redo: () => void } | null;
  handleOpenFile: () => void;
  handleSaveFile: () => void;
  handleSaveAsFile: () => void;
  fileHandle: unknown;
  supportsDirectAccess: boolean;
  readOnly?: boolean;
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideHelp?: boolean;
  hideVersionInfo?: boolean;
  hideSettings?: boolean;
  hideToolbar?: boolean;
  setSettingsOpen: (open: boolean) => void;
  setVersionDialogOpen: (open: boolean) => void;
  rightFileOps: { loadFile: () => void; exportFile: () => void } | null;
  handleExportPdf: () => void;
  setLiveMessage: (msg: string) => void;
  commentOpen: boolean;
  setCommentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  liveMessage: string;
  t: (key: string) => string;
}

export function EditorToolbarSection({
  editor,
  isInDiagramBlock,
  handleToggleAllBlocks,
  handleDownload,
  fileInputRef,
  handleClear,
  handleFileSelected,
  setTemplateAnchorEl,
  setHelpAnchorEl,
  sourceMode,
  readonlyMode,
  reviewMode,
  outlineOpen,
  handleToggleOutline,
  handleMerge,
  inlineMergeOpen,
  handleSwitchToSource,
  handleSwitchToWysiwyg,
  handleSwitchToReview,
  handleSwitchToReadonly,
  showReadonlyMode,
  hideOutline,
  hideComments,
  hideTemplates,
  hideFoldAll,
  mergeUndoRedo,
  handleOpenFile,
  handleSaveFile,
  handleSaveAsFile,
  fileHandle,
  supportsDirectAccess,
  readOnly,
  hideFileOps,
  hideUndoRedo,
  hideHelp,
  hideVersionInfo,
  hideSettings,
  hideToolbar,
  setSettingsOpen,
  setVersionDialogOpen,
  rightFileOps,
  handleExportPdf,
  setLiveMessage,
  commentOpen,
  setCommentOpen,
  liveMessage,
  t,
}: EditorToolbarSectionProps) {
  return (
    <>
      {/* Skip link (WCAG 2.4.1) */}
      <Box
        component="a"
        href="#md-editor-content"
        sx={{
          position: "absolute",
          left: -9999,
          "&:focus": {
            left: 16, top: 16, zIndex: 9999, bgcolor: "background.paper",
            color: "primary.main", px: 2, py: 1, borderRadius: 1, boxShadow: 3,
            fontWeight: 600, fontSize: "0.875rem", textDecoration: "none",
          },
        }}
      >
        {t("skipToEditor")}
      </Box>
      {/* Live region for mode switch announcements (WCAG 4.1.3) */}
      <Box
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
      >
        {liveMessage}
      </Box>

      {!hideToolbar && <EditorToolbar
        editor={editor}
        isInDiagramBlock={isInDiagramBlock}
        onToggleAllBlocks={handleToggleAllBlocks}
        onDownload={handleDownload}
        onImport={() => fileInputRef.current?.click()}
        onClear={handleClear}
        onSetTemplateAnchor={setTemplateAnchorEl}
        onSetHelpAnchor={setHelpAnchorEl}
        sourceMode={sourceMode}
        readonlyMode={readonlyMode}
        reviewMode={reviewMode}
        outlineOpen={outlineOpen}
        onToggleOutline={handleToggleOutline}
        onMerge={handleMerge}
        inlineMergeOpen={inlineMergeOpen}
        onSwitchToSource={handleSwitchToSource}
        onSwitchToWysiwyg={handleSwitchToWysiwyg}
        onSwitchToReview={handleSwitchToReview}
        onSwitchToReadonly={handleSwitchToReadonly}
        hideReadonlyToggle={!showReadonlyMode}
        hideOutline={hideOutline}
        hideComments={hideComments}
        hideTemplates={hideTemplates}
        hideFoldAll={hideFoldAll}
        mergeUndoRedo={inlineMergeOpen ? mergeUndoRedo : null}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onSaveAsFile={handleSaveAsFile}
        hasFileHandle={fileHandle !== null}
        supportsDirectAccess={supportsDirectAccess}
        hideFileOps={readOnly || hideFileOps}
        hideUndoRedo={readOnly || hideUndoRedo}
        hideMoreMenu={(readOnly || hideHelp) && (readOnly || hideVersionInfo) && (readOnly || hideSettings)}
        hideModeToggle={readOnly}
        hideSettings={hideSettings}
        hideVersionInfo={hideVersionInfo}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenVersionDialog={() => setVersionDialogOpen(true)}
        onLoadRightFile={rightFileOps?.loadFile}
        onExportRightFile={rightFileOps?.exportFile}
        onExportPdf={handleExportPdf}
        onAnnounce={setLiveMessage}
        commentOpen={commentOpen}
        onToggleComments={() => setCommentOpen((prev) => !prev)}
        t={t}
      />}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          e.target.value = "";
          handleFileSelected(f);
        }}
      />
    </>
  );
}
