import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";

import { getBgPaper, getPrimaryMain } from "../constants/colors";
import { useEditorMode } from "../contexts/EditorModeContext";
import { SKIP_LINK_FONT_SIZE } from "../constants/dimensions";
import { Z_SKIP_LINK } from "../constants/zIndex";
import type { ToolbarVisibility } from "../types/toolbar";
import { EditorToolbar } from "./EditorToolbar";
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
}: Readonly<EditorToolbarSectionProps>) {
  const {
    sourceMode, readonlyMode, reviewMode, explorerOpen, inlineMergeOpen,
    onSwitchToSource, onSwitchToWysiwyg, onSwitchToReview,
  } = useEditorMode();
  const isDark = useTheme().palette.mode === "dark";
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
            left: 16, top: 16, zIndex: Z_SKIP_LINK, bgcolor: getBgPaper(isDark),
            color: getPrimaryMain(isDark), px: 2, py: 1, borderRadius: 1, boxShadow: 3,
            fontWeight: 600, fontSize: SKIP_LINK_FONT_SIZE, textDecoration: "none",
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
