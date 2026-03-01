"use client";

import dynamic from "next/dynamic";
import {
  Box,
  CircularProgress,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { getEditorPaperSx } from "./styles/editorStyles";
import { useEditor, EditorContent } from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef } from "react";

import { useMarkdownEditor } from "./useMarkdownEditor";
import { welcomeContent } from "./constants/welcomeContent";
import { EditorOutlineSection } from "./components/EditorOutlineSection";
import { SourceModeEditor } from "./components/SourceModeEditor";
import { StatusBar } from "./components/StatusBar";
import { EditorDialogs } from "./components/EditorDialogs";
import { EditorSettingsPanel } from "./components/EditorSettingsPanel";
import { useEditorSettings, EditorSettingsContext } from "./useEditorSettings";
import { EditorToolbar } from "./components/EditorToolbar";
import { SearchReplaceBar } from "./components/SearchReplaceBar";
import { EditorMenuPopovers } from "./components/EditorMenuPopovers";
import { EditorBubbleMenu } from "./components/EditorBubbleMenu";
import { SlashCommandMenu } from "./components/SlashCommandMenu";
import type { SlashCommandState } from "./extensions/slashCommandExtension";
import type { MergeUndoRedo } from "./components/InlineMergeView";

const InlineMergeView = dynamic(
  () => import("./components/InlineMergeView").then((m) => m.InlineMergeView),
  { loading: () => <CircularProgress size={32} sx={{ m: "auto" }} /> },
);
import { MergeEditorPanel } from "./components/MergeEditorPanel";
import type { Editor } from "@tiptap/react";
import {
  type HeadingItem,
  PlantUmlToolbarContext,
} from "./types";
import type { MarkdownTemplate } from "./constants/templates";
import { useSourceMode } from "./hooks/useSourceMode";
import { useEditorDialogs } from "./hooks/useEditorDialogs";
import { useOutline } from "./hooks/useOutline";
import { useEditorFileOps } from "./hooks/useEditorFileOps";
import { useFileSystem } from "./hooks/useFileSystem";
import { useEditorMenuState } from "./hooks/useEditorMenuState";
import { useEditorHeight } from "./hooks/useEditorHeight";
import { useMergeMode } from "./hooks/useMergeMode";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useFloatingToolbar } from "./hooks/useFloatingToolbar";
import { useEditorBlockActions } from "./hooks/useEditorBlockActions";
import { useEditorConfig } from "./hooks/useEditorConfig";
import { useEditorSideEffects } from "./hooks/useEditorSideEffects";
import type { FileSystemProvider } from "./types/fileSystem";


interface MarkdownEditorPageProps {
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideSettings?: boolean;
  hideHelp?: boolean;
  hideVersionInfo?: boolean;
  onCompareModeChange?: (active: boolean) => void;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  onLocaleChange?: (locale: string) => void;
  fileSystemProvider?: FileSystemProvider | null;
}

export default function MarkdownEditorPage({ hideFileOps, hideUndoRedo, hideSettings, hideHelp, hideVersionInfo, onCompareModeChange, themeMode, onThemeModeChange, onLocaleChange, fileSystemProvider }: MarkdownEditorPageProps = {}) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const locale = useLocale() as "en" | "ja";
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const {
    initialContent,
    loading,
    saveContent,
    downloadMarkdown,
    clearContent,
  } = useMarkdownEditor(welcomeContent);

  const { settings, updateSettings, resetSettings } = useEditorSettings();
  const {
    settingsOpen, setSettingsOpen,
    sampleAnchorEl, setSampleAnchorEl,
    diagramAnchorEl, setDiagramAnchorEl,
    helpAnchorEl, setHelpAnchorEl,
    templateAnchorEl, setTemplateAnchorEl,
    headingMenu, setHeadingMenu,
  } = useEditorMenuState();
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Refs for callbacks used in useEditor config (avoids stale closures)
  const editorRef = useRef<Editor | null>(null);
  const setEditorMarkdownRef = useRef<(md: string) => void>(() => {});
  const setHeadingsRef = useRef<(h: HeadingItem[]) => void>(() => {});
  const headingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImportRef = useRef<(f: File) => void>(() => {});
  const slashCommandCallbackRef = useRef<(state: SlashCommandState) => void>(() => {});

  const editorConfig = useEditorConfig({
    t, initialContent, saveContent,
    editorRef, setEditorMarkdownRef, setHeadingsRef,
    headingsDebounceRef, handleImportRef, setHeadingMenu,
    slashCommandCallbackRef,
  });
  const editor = useEditor(editorConfig, [initialContent]);
  editorRef.current = editor;

  // --- Custom hooks ---
  const {
    sourceMode, sourceText, setSourceText, liveMessage, setLiveMessage,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSourceChange, appendToSource,
  } = useSourceMode({ editor, saveContent, t });

  const {
    linkDialogOpen, setLinkDialogOpen, linkUrl, setLinkUrl,
    handleLink, handleLinkInsert, imageDialogOpen, setImageDialogOpen,
    imageUrl, setImageUrl, imageAlt, setImageAlt, imageEditPos,
    handleImage, handleImageInsert, shortcutDialogOpen, setShortcutDialogOpen,
    versionDialogOpen, setVersionDialogOpen, helpDialogOpen, setHelpDialogOpen,
  } = useEditorDialogs({ editor, sourceMode, appendToSource });

  const {
    outlineOpen, headings, setHeadings, foldedIndices, hiddenByFold,
    outlineWidth, setOutlineWidth, handleToggleOutline, handleHeadingDragEnd,
    handleOutlineDelete, handleOutlineClick, toggleFold, foldAll, unfoldAll,
    handleOutlineResizeStart,
  } = useOutline({ editor, sourceMode });

  const {
    fileHandle, fileName, isDirty,
    supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  } = useFileSystem(fileSystemProvider ?? null);

  const {
    fileInputRef, handleClear, handleFileSelected,
    handleDownload, handleImport, handleCopy,
    handleOpenFile, handleSaveFile, handleSaveAsFile,
  } = useEditorFileOps({
    editor, sourceMode, sourceText, setSourceText,
    saveContent, downloadMarkdown, clearContent,
    openFile, saveFile, saveAsFile, resetFile,
  });

  // Update refs for useEditor callbacks
  setHeadingsRef.current = setHeadings;
  handleImportRef.current = handleImport;

  // Floating toolbar positions (M-5: unified hook)
  // Table toolbar is now embedded in TableNodeView
  // Mermaid toolbar is now embedded in MermaidNodeView
  const plantUmlFloating = useFloatingToolbar(editor, editorWrapperRef, "codeBlock", "plantuml");

  const {
    inlineMergeOpen, setInlineMergeOpen,
    editorMarkdown, setEditorMarkdown,
    mergeUndoRedo, setMergeUndoRedo,
    compareFileContent, setCompareFileContent,
    rightFileOps, setRightFileOps,
    handleMerge,
  } = useMergeMode({
    editor, sourceMode, isMd, outlineOpen, handleToggleOutline,
    onCompareModeChange, t, setLiveMessage,
  });

  // Update refs for useEditor callbacks (setEditorMarkdown comes from useMergeMode)
  setEditorMarkdownRef.current = setEditorMarkdown;

  useEditorSideEffects({ editor, isDirty, markDirty, setHeadingsRef, setEditorMarkdown });

  const { editorContainerRef, editorHeight } = useEditorHeight(isMobile, isMd);

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) {
      appendToSource(template.content);
      return;
    }
    if (!editor) return;
    editor.chain().focus().insertContent(template.content).run();
  }, [editor, sourceMode, appendToSource]);

  // PlantUML/Mermaid 編集中はMarkdownツールバーを無効化
  const isInDiagramBlock = !!plantUmlFloating;

  const { handleToggleAllBlocks, handleToggleDiagramCode } = useEditorBlockActions({ editor });

  useEditorShortcuts({
    editor, sourceMode, appendToSource,
    handleSaveFile, handleSaveAsFile, handleOpenFile, handleImage,
    handleClear, handleCopy,
    handleImport: () => fileInputRef.current?.click(),
    handleDownload,
    handleToggleAllBlocks, handleToggleOutline,
    handleSwitchToSource, handleSwitchToWysiwyg, handleMerge,
    setDiagramAnchorEl, setTemplateAnchorEl, t,
  });

  // PlantUML ツールバー Context 値
  const plantUmlToolbarCtx = useMemo(() => ({
    setSampleAnchorEl,
  }), [setSampleAnchorEl]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  const outlineProps = {
    isMd, outlineOpen, handleToggleOutline,
    outlineWidth, setOutlineWidth, editorHeight,
    headings, foldedIndices, hiddenByFold,
    foldAll, unfoldAll, toggleFold,
    handleOutlineClick, handleOutlineResizeStart,
    onHeadingDragEnd: handleHeadingDragEnd,
    onOutlineDelete: handleOutlineDelete,
    t,
  };

  return (
    <EditorSettingsContext.Provider value={settings}>
    <PlantUmlToolbarContext.Provider value={plantUmlToolbarCtx}>
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Skip link (WCAG 2.4.1) */}
      <Box
        component="a"
        href="#md-editor-content"
        sx={{
          position: "absolute",
          left: -9999,
          "&:focus": {
            left: 16,
            top: 16,
            zIndex: 9999,
            bgcolor: "background.paper",
            color: "primary.main",
            px: 2,
            py: 1,
            borderRadius: 1,
            boxShadow: 3,
            fontWeight: 600,
            fontSize: "0.875rem",
            textDecoration: "none",
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
      {/* Toolbar */}
      <EditorToolbar
        editor={editor}
        isInDiagramBlock={isInDiagramBlock}
        onImage={handleImage}
        onToggleAllBlocks={handleToggleAllBlocks}
        onToggleDiagramCode={handleToggleDiagramCode}
        onDownload={handleDownload}
        onImport={() => fileInputRef.current?.click()}
        onClear={handleClear}
        onSetDiagramAnchor={setDiagramAnchorEl}
        onSetTemplateAnchor={setTemplateAnchorEl}
        onSetHelpAnchor={setHelpAnchorEl}
        sourceMode={sourceMode}
        outlineOpen={outlineOpen}
        onToggleOutline={handleToggleOutline}
        onMerge={handleMerge}
        inlineMergeOpen={inlineMergeOpen}
        onSwitchToSource={handleSwitchToSource}
        onSwitchToWysiwyg={handleSwitchToWysiwyg}
        onSourceInsertHr={() => appendToSource("\n---\n")}
        onSourceInsertCodeBlock={() => appendToSource("\n```\n\n```\n")}
        onSourceInsertTable={() => appendToSource("\n| Header | Header | Header |\n| ------ | ------ | ------ |\n|        |        |        |\n|        |        |        |\n")}
        mergeUndoRedo={inlineMergeOpen ? mergeUndoRedo : null}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onSaveAsFile={handleSaveAsFile}
        hasFileHandle={fileHandle !== null}
        supportsDirectAccess={supportsDirectAccess}
        hideFileOps={hideFileOps}
        hideUndoRedo={hideUndoRedo}
        hideMoreMenu={hideHelp && hideVersionInfo && hideSettings}
        hideSettings={hideSettings}
        hideVersionInfo={hideVersionInfo}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenVersionDialog={() => setVersionDialogOpen(true)}
        onLoadRightFile={rightFileOps?.loadFile}
        onExportRightFile={rightFileOps?.exportFile}
        onAnnounce={setLiveMessage}
        t={t}
      />
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

      <EditorDialogs
        linkDialogOpen={linkDialogOpen}
        setLinkDialogOpen={setLinkDialogOpen}
        linkUrl={linkUrl}
        setLinkUrl={setLinkUrl}
        handleLinkInsert={handleLinkInsert}
        imageDialogOpen={imageDialogOpen}
        setImageDialogOpen={setImageDialogOpen}
        imageUrl={imageUrl}
        setImageUrl={setImageUrl}
        imageAlt={imageAlt}
        setImageAlt={setImageAlt}
        handleImageInsert={handleImageInsert}
        imageEditMode={imageEditPos !== null}
        shortcutDialogOpen={shortcutDialogOpen}
        setShortcutDialogOpen={setShortcutDialogOpen}
        versionDialogOpen={versionDialogOpen}
        setVersionDialogOpen={setVersionDialogOpen}
        helpDialogOpen={helpDialogOpen}
        setHelpDialogOpen={setHelpDialogOpen}
        locale={locale}
        t={t}
      />

      {!hideSettings && (
        <EditorSettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          updateSettings={updateSettings}
          resetSettings={resetSettings}
          t={t}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          onLocaleChange={onLocaleChange}
        />
      )}

      {/* Editor + Outline */}
      {inlineMergeOpen ? (
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
                hideScrollbar
                autoResize
                bgGradient={leftBgGradient}
                diffLines={leftDiffLines}
                side="left"
                onMerge={onMerge}
                onHoverLine={onHoverLine}
              />
            </Box>
          </Box>
          )}
        </InlineMergeView>
      ) : (
      <Box component="main" ref={editorContainerRef} sx={{ display: "flex", gap: 0 }}>
        <EditorOutlineSection {...outlineProps} />

        {/* Editor */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
      {sourceMode ? (
        <SourceModeEditor
          sourceText={sourceText}
          onSourceChange={handleSourceChange}
          editorHeight={editorHeight}
          ariaLabel={t("sourceEditor")}
        />
      ) : (
        <Box ref={editorWrapperRef} sx={{ position: "relative" }}>
        {editor && <SearchReplaceBar editor={editor} t={t} />}
        <Paper
          id="md-editor-content"
          variant="outlined"
          sx={getEditorPaperSx(theme, settings, editorHeight)}
        >
          <EditorContent editor={editor} />
        </Paper>
        </Box>
      )}
        </Box>
      </Box>
      )}

      {/* BubbleMenu (text formatting) – rendered for both merge and non-merge modes */}
      {editor && !sourceMode && (
        <EditorBubbleMenu editor={editor} onLink={handleLink} t={t} />
      )}

      {/* Slash command menu */}
      {editor && !sourceMode && (
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={slashCommandCallbackRef} />
      )}

      {/* Status bar */}
      {editor && <StatusBar editor={editor} sourceMode={sourceMode} sourceText={sourceText} t={t} fileName={fileName} isDirty={isDirty} />}

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
        onInsertTemplate={handleInsertTemplate}
        sourceMode={sourceMode}
        onSourceInsertMermaid={() => appendToSource("\n```mermaid\n\n```\n")}
        onSourceInsertPlantUml={() => appendToSource("\n```plantuml\n\n```\n")}
        headingMenu={headingMenu}
        setHeadingMenu={setHeadingMenu}
        setSettingsOpen={setSettingsOpen}
        setVersionDialogOpen={setVersionDialogOpen}
        setHelpDialogOpen={setHelpDialogOpen}
        hideSettings={hideSettings}
        hideHelp={hideHelp}
        hideVersionInfo={hideVersionInfo}
        t={t}
      />

    </Box>
    </PlantUmlToolbarContext.Provider>
    </EditorSettingsContext.Provider>
  );
}
