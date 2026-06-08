import type { Editor } from "@anytime-markdown/markdown-react";
import type React from "react";

import { useEditorMode } from "../contexts/EditorModeContext";
import type { ToolbarVisibility } from "../types/toolbar";
import { EditorToolbar } from "./EditorToolbar";
import styles from "./EditorToolbarSection.module.css";
import type { MergeUndoRedo } from "./InlineMergeView";

interface EditorToolbarSectionProps {
  editor: Editor | null;
  isInDiagramBlock: boolean;
  handleToggleAllBlocks: () => void;
  fileHandlers: {
    onDownload: () => void;
    onClear: () => void;
    onOpenFile: () => void | Promise<void>;
    onSaveFile: () => void | Promise<void>;
    onSaveAsFile: () => void | Promise<void>;
    onExportPdf: () => void | Promise<void>;
  };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelected: (f: File) => void;
  setTemplateAnchorEl: (el: HTMLElement | null) => void;
  setHelpAnchorEl: (el: HTMLElement | null) => void;
  outlineOpen: boolean;
  modeHandlers: {
    onSwitchToReadonly: () => void;
    onToggleOutline: () => void;
    onMerge: () => void;
    onToggleExplorer?: () => void;
  };
  hide?: ToolbarVisibility;
  mergeUndoRedo: MergeUndoRedo | null;
  fileHandle: unknown;
  supportsDirectAccess: boolean;
  externalSaveOnly?: boolean;
  readOnly?: boolean;
  setSettingsOpen: (open: boolean) => void;
  setVersionDialogOpen: (open: boolean) => void;
  rightFileOps: { loadFile: () => void; exportFile: () => void } | null;
  setLiveMessage: (msg: string) => void;
  commentOpen: boolean;
  setCommentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  liveMessage: string;
  t: (key: string) => string;
  onHomeClick?: () => void;
}

export function EditorToolbarSection({
  editor,
  isInDiagramBlock,
  handleToggleAllBlocks,
  fileHandlers,
  fileInputRef,
  handleFileSelected,
  setTemplateAnchorEl,
  setHelpAnchorEl,
  outlineOpen,
  modeHandlers,
  hide,
  mergeUndoRedo,
  fileHandle,
  supportsDirectAccess,
  externalSaveOnly,
  readOnly,
  setSettingsOpen,
  setVersionDialogOpen,
  rightFileOps,
  setLiveMessage,
  commentOpen,
  setCommentOpen,
  liveMessage,
  t,
  onHomeClick,
}: Readonly<EditorToolbarSectionProps>) {
  const {
    sourceMode, readonlyMode, reviewMode, explorerOpen, inlineMergeOpen,
    onSwitchToSource, onSwitchToWysiwyg, onSwitchToReview,
  } = useEditorMode();
  return (
    <>
      {/* Skip link (WCAG 2.4.1) */}
      <a href="#md-editor-content" className={styles.skipLink}>
        {t("skipToEditor")}
      </a>
      {/* Live region for mode switch announcements (WCAG 4.1.3) */}
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {liveMessage}
      </div>

      {!hide?.toolbar && <EditorToolbar
        editor={editor}
        isInDiagramBlock={isInDiagramBlock}
        onToggleAllBlocks={handleToggleAllBlocks}
        fileHandlers={{
          onDownload: fileHandlers.onDownload,
          onImport: () => fileInputRef.current?.click(),
          onClear: fileHandlers.onClear,
          onOpenFile: fileHandlers.onOpenFile,
          onSaveFile: fileHandlers.onSaveFile,
          onSaveAsFile: fileHandlers.onSaveAsFile,
          onExportPdf: fileHandlers.onExportPdf,
          onLoadRightFile: rightFileOps?.loadFile,
          onExportRightFile: rightFileOps?.exportFile,
        }}
        fileCapabilities={{
          hasFileHandle: fileHandle !== null,
          supportsDirectAccess,
          externalSaveOnly,
        }}
        onSetTemplateAnchor={setTemplateAnchorEl}
        onSetHelpAnchor={setHelpAnchorEl}
        modeState={{
          sourceMode, readonlyMode, reviewMode,
          outlineOpen, inlineMergeOpen, commentOpen,
          explorerOpen,
        }}
        modeHandlers={{
          onSwitchToSource: onSwitchToSource ?? (() => {}),
          onSwitchToWysiwyg: onSwitchToWysiwyg ?? (() => {}),
          onSwitchToReview,
          onSwitchToReadonly: modeHandlers.onSwitchToReadonly,
          onToggleOutline: modeHandlers.onToggleOutline,
          onToggleComments: () => setCommentOpen((prev) => !prev),
          onMerge: modeHandlers.onMerge,
          onToggleExplorer: modeHandlers.onToggleExplorer,
        }}
        hide={{
          fileOps: readOnly || hide?.fileOps,
          undoRedo: readOnly || hide?.undoRedo,
          moreMenu: (readOnly || hide?.versionInfo) && (readOnly || hide?.settings),
          modeToggle: readOnly,
          readonlyToggle: hide?.readonlyToggle,
          outline: hide?.outline,
          comments: hide?.comments,
          explorer: hide?.explorer,
          compareToggle: hide?.compareToggle,
          templates: hide?.templates,
          foldAll: hide?.foldAll,
          settings: hide?.settings,
          versionInfo: hide?.versionInfo,
        }}
        mergeUndoRedo={inlineMergeOpen ? mergeUndoRedo : null}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenVersionDialog={() => setVersionDialogOpen(true)}
        onAnnounce={setLiveMessage}
        onHomeClick={onHomeClick}
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
