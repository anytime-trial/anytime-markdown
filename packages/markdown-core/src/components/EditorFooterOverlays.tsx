import {
  Alert,
  Backdrop,
  CircularProgress,
  Snackbar,
  Typography,
} from "@mui/material";
import type { Editor } from "@tiptap/react";
import { EditorContent } from "@tiptap/react";
import { createPortal } from "react-dom";

import type { MarkdownTemplate } from "../constants/templates";
import { NOTIFICATION_DURATION } from "../constants/timing";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import type { NotificationKey } from "../hooks/useNotification";
import { useEditorMode } from "../contexts/EditorModeContext";
import type { EncodingLabel } from "../types";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { EditorMenuPopovers } from "./EditorMenuPopovers";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { StatusBar } from "./StatusBar";

interface EditorFooterOverlaysProps {
  editor: Editor | null;
  editorPortalTarget: HTMLDivElement | null;
  // bubble menu
  handleLink: () => void;
  executeInReviewMode: (fn: () => void) => void;
  // slash command
  slashCommandCallbackRef: React.RefObject<(state: SlashCommandState) => void>;
  // status bar
  sourceText: string;
  fileName: string | null;
  isDirty: boolean;
  handleLineEndingChange?: (ending: "LF" | "CRLF") => void;
  encoding: EncodingLabel;
  handleEncodingChange?: (e: EncodingLabel) => Promise<void>;
  onStatusChange?: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => void;
  hideStatusBar?: boolean;
  // menu popovers
  helpAnchorEl: HTMLElement | null;
  setHelpAnchorEl: (el: HTMLElement | null) => void;
  diagramAnchorEl: HTMLElement | null;
  setDiagramAnchorEl: (el: HTMLElement | null) => void;
  sampleAnchorEl: HTMLElement | null;
  setSampleAnchorEl: (el: HTMLElement | null) => void;
  templateAnchorEl: HTMLElement | null;
  setTemplateAnchorEl: (el: HTMLElement | null) => void;
  onInsertTemplate: (template: MarkdownTemplate) => void;
  headingMenu: { anchorEl: HTMLElement; pos: number; currentLevel: number } | null;
  setHeadingMenu: (menu: { anchorEl: HTMLElement; pos: number; currentLevel: number } | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setVersionDialogOpen: (open: boolean) => void;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  hideTemplates?: boolean;
  appendToSource: (text: string) => void;
  outlineOpen?: boolean;
  commentOpen?: boolean;
  onToggleOutline?: () => void;
  onToggleComments?: () => void;
  onOpenSettings?: () => void;
  // overlay state
  pdfExporting: boolean;
  notification: NotificationKey;
  setNotification: (n: NotificationKey) => void;
  t: (key: string) => string;
}

export function EditorFooterOverlays({
  editor,
  editorPortalTarget,
  handleLink,
  executeInReviewMode,
  slashCommandCallbackRef,
  sourceText,
  fileName,
  isDirty,
  handleLineEndingChange,
  encoding,
  handleEncodingChange,
  onStatusChange,
  hideStatusBar,
  helpAnchorEl,
  setHelpAnchorEl,
  diagramAnchorEl,
  setDiagramAnchorEl,
  sampleAnchorEl,
  setSampleAnchorEl,
  templateAnchorEl,
  setTemplateAnchorEl,
  onInsertTemplate,
  headingMenu,
  setHeadingMenu,
  setSettingsOpen,
  setVersionDialogOpen,
  hideSettings,
  hideVersionInfo,
  hideTemplates,
  appendToSource,
  outlineOpen,
  commentOpen,
  onToggleOutline,
  onToggleComments,
  onOpenSettings,
  pdfExporting,
  notification,
  setNotification,
  t,
}: Readonly<EditorFooterOverlaysProps>) {
  const { sourceMode, readonlyMode, reviewMode, inlineMergeOpen } = useEditorMode();
  return (
    <>
      {/* EditorContent は常時マウント – ポータル経由で DOM を移動 */}
      {editorPortalTarget && createPortal(<EditorContent editor={editor} />, editorPortalTarget)}

      {/* BubbleMenu (text formatting) – rendered for both merge and non-merge modes */}
      {editor && !sourceMode && (
        <EditorBubbleMenu editor={editor} onLink={handleLink} readonlyMode={readonlyMode} reviewMode={reviewMode} executeInReviewMode={executeInReviewMode} t={t} />
      )}

      {/* Slash command menu */}
      {editor && !sourceMode && !readonlyMode && !reviewMode && (
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={slashCommandCallbackRef} />
      )}

      {/* Status bar */}
      {editor && <StatusBar editor={editor} sourceMode={sourceMode} sourceText={sourceText} t={t} fileName={fileName} isDirty={isDirty} onLineEndingChange={hideStatusBar ? undefined : handleLineEndingChange} encoding={encoding} onEncodingChange={hideStatusBar ? undefined : handleEncodingChange} onStatusChange={onStatusChange} hidden={hideStatusBar} />}

      <EditorMenuPopovers
        editor={editor}
        helpAnchorEl={helpAnchorEl}
        setHelpAnchorEl={setHelpAnchorEl}
        diagramAnchorEl={diagramAnchorEl}
        setDiagramAnchorEl={setDiagramAnchorEl}
        sampleAnchorEl={sampleAnchorEl}
        setSampleAnchorEl={setSampleAnchorEl}
        templateAnchorEl={templateAnchorEl}
        setTemplateAnchorEl={setTemplateAnchorEl}
        onInsertTemplate={onInsertTemplate}
        sourceMode={sourceMode}
        onSourceInsertMermaid={() => appendToSource("\n```mermaid\n\n```\n")}
        onSourceInsertPlantUml={() => appendToSource("\n```plantuml\n\n```\n")}
        headingMenu={headingMenu}
        setHeadingMenu={setHeadingMenu}
        setSettingsOpen={setSettingsOpen}
        setVersionDialogOpen={setVersionDialogOpen}
        hideSettings={hideSettings}
        hideVersionInfo={hideVersionInfo}
        hideTemplates={hideTemplates}
        templateDisabled={readonlyMode || reviewMode || !!inlineMergeOpen}
        outlineOpen={outlineOpen}
        commentOpen={commentOpen}
        onToggleOutline={onToggleOutline}
        onToggleComments={onToggleComments}
        onOpenSettings={onOpenSettings}
        t={t}
      />

      <Backdrop open={pdfExporting} sx={{ zIndex: (theme) => theme.zIndex.modal + 1, flexDirection: "column", gap: 2, "@media print": { display: "none" } }}>
        <CircularProgress color="inherit" />
        <Typography variant="body2" color="inherit">{t("pdfPreparing")}</Typography>
      </Backdrop>

      <Snackbar
        open={notification !== null}
        autoHideDuration={NOTIFICATION_DURATION}
        onClose={() => setNotification(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification(null)}
          severity={notification?.endsWith("Error") ? "error" : "success"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {notification && t(notification)}
        </Alert>
      </Snackbar>
    </>
  );
}
