"use client";

// Tiptap の ReactRenderer が componentDidMount 内で flushSync を呼ぶ問題を抑制
// @see https://github.com/ueberdosis/tiptap/issues/3764
// TODO: tiptap v3 で修正される見込み。アップグレード時にこのパッチが不要か確認し除去する。
if (typeof window !== "undefined") {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("flushSync was called from inside a lifecycle method")
    ) {
      return;
    }
    origError.apply(console, args);
  };
}

import { Box, CircularProgress, useMediaQuery, useTheme } from "@mui/material";
import { useEditor } from "@tiptap/react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditorDialogsSection } from "./components/EditorDialogsSection";
import { EditorFooterOverlays } from "./components/EditorFooterOverlays";
import { EditorMainContent } from "./components/EditorMainContent";
import { EditorToolbarSection } from "./components/EditorToolbarSection";
import { defaultContent } from "./constants/defaultContent";
import { STATUSBAR_HEIGHT } from "./constants/dimensions";
import type { SlashCommandState } from "./extensions/slashCommandExtension";
import { useTextareaSearch } from "./hooks/useTextareaSearch";
import { PrintStyles } from "./styles/printStyles";
import { EditorSettingsContext,useEditorSettings } from "./useEditorSettings";
import { useMarkdownEditor } from "./useMarkdownEditor";

const InlineMergeView = dynamic(
  () => import("./components/InlineMergeView").then((m) => m.InlineMergeView),
  { loading: () => <CircularProgress size={32} sx={{ m: "auto" }} /> },
);

import type { Editor } from "@tiptap/react";

import type { MarkdownTemplate } from "./constants/templates";
import { useEditorBlockActions } from "./hooks/useEditorBlockActions";
import { useEditorCommentNotifications } from "./hooks/useEditorCommentNotifications";
import { useEditorConfig } from "./hooks/useEditorConfig";
import { useEditorDialogs } from "./hooks/useEditorDialogs";
import { useEditorFileHandling } from "./hooks/useEditorFileHandling";
import { useEditorFileOps } from "./hooks/useEditorFileOps";
import { useEditorHeight } from "./hooks/useEditorHeight";
import { useEditorMenuState } from "./hooks/useEditorMenuState";
import { useEditorSettingsSync } from "./hooks/useEditorSettingsSync";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { useEditorSideEffects } from "./hooks/useEditorSideEffects";
import { useFileSystem } from "./hooks/useFileSystem";
import { useFloatingToolbar } from "./hooks/useFloatingToolbar";
import { useMergeMode } from "./hooks/useMergeMode";
import { useOutline } from "./hooks/useOutline";
import { useSourceMode } from "./hooks/useSourceMode";
import { useTimeline } from "./hooks/useTimeline";
import { useVSCodeIntegration } from "./hooks/useVSCodeIntegration";
import { type HeadingItem, PlantUmlToolbarContext } from "./types";
import type { FileSystemProvider } from "./types/fileSystem";
import type { TimelineDataProvider } from "./types/timeline";
import type { InlineComment } from "./utils/commentHelpers";
import { parseCommentData } from "./utils/commentHelpers";
import { preprocessMarkdown } from "./utils/frontmatterHelpers";

interface MarkdownEditorPageProps {
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideSettings?: boolean;
  hideHelp?: boolean;
  hideVersionInfo?: boolean;
  featuresUrl?: string;
  onCompareModeChange?: (active: boolean) => void;
  onHeadingsChange?: (headings: HeadingItem[]) => void;
  onCommentsChange?: (comments: Array<{ id: string; text: string; resolved: boolean; createdAt: string; targetText: string; pos: number; isPoint: boolean }>) => void;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  onLocaleChange?: (locale: string) => void;
  fileSystemProvider?: FileSystemProvider | null;
  timelineProvider?: TimelineDataProvider | null;
  externalContent?: string;
  readOnly?: boolean;
  hideToolbar?: boolean;
  hideOutline?: boolean;
  hideComments?: boolean;
  hideTemplates?: boolean;
  hideFoldAll?: boolean;
  hideStatusBar?: boolean;
  onStatusChange?: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => void;
  showReadonlyMode?: boolean;
}

export default function MarkdownEditorPage({ hideFileOps, hideUndoRedo, hideSettings, hideHelp, hideVersionInfo, featuresUrl, onCompareModeChange, onHeadingsChange, onCommentsChange, themeMode, onThemeModeChange, onLocaleChange, fileSystemProvider, timelineProvider, externalContent, readOnly, hideToolbar, hideOutline, hideComments, hideTemplates, hideFoldAll, hideStatusBar, onStatusChange, showReadonlyMode }: MarkdownEditorPageProps = {}) {
  const t = useTranslations("MarkdownEditor");
  const locale = useLocale() as "en" | "ja";
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const isMd = useMediaQuery(muiTheme.breakpoints.up("md"));
  const isDark = muiTheme.palette.mode === "dark";
  const noopSave = useCallback(() => {}, []);
  const {
    initialContent, loading, saveContent: _saveContent, downloadMarkdown, clearContent, frontmatterRef, initialTrailingNewline,
  } = useMarkdownEditor(externalContent ?? defaultContent, !!externalContent);
  const saveContent = readOnly ? noopSave : _saveContent;

  const [commentOpen, setCommentOpen] = useState(false);
  const commentDataRef = useRef<Map<string, InlineComment>>(new Map());
  const processedInitialContent = useMemo(() => {
    if (!initialContent) return initialContent;
    const { comments, body } = parseCommentData(initialContent);
    commentDataRef.current = comments;
    return body;
  }, [initialContent]);

  const { settings, updateSettings, resetSettings } = useEditorSettings();
  const {
    settingsOpen, setSettingsOpen, sampleAnchorEl, setSampleAnchorEl,
    diagramAnchorEl, setDiagramAnchorEl, helpAnchorEl, setHelpAnchorEl,
    templateAnchorEl, setTemplateAnchorEl, headingMenu, setHeadingMenu,
  } = useEditorMenuState();
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [editorPortalTarget] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  });
  const editorMountCallback = useCallback((node: HTMLDivElement | null) => {
    if (node && editorPortalTarget && editorPortalTarget.parentElement !== node) {
      node.appendChild(editorPortalTarget);
    }
  }, [editorPortalTarget]);
  const [sourceSearchOpen, setSourceSearchOpen] = useState(false);

  // Refs for callbacks used in useEditor config (avoids stale closures)
  const editorRef = useRef<Editor | null>(null);
  const setEditorMarkdownRef = useRef<(md: string) => void>(() => {});
  const setHeadingsRef = useRef<(h: HeadingItem[]) => void>(() => {});
  const headingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImportRef = useRef<(f: File, nativeHandle?: FileSystemFileHandle) => void>(() => {});
  const [fileDragOver, setFileDragOver] = useState(false);
  const onFileDragOverRef = useRef<(over: boolean) => void>((over) => setFileDragOver(over));
  const slashCommandCallbackRef = useRef<(state: SlashCommandState) => void>(() => {});

  const editorConfig = useEditorConfig({
    t, initialContent: processedInitialContent, initialTrailingNewline, saveContent,
    refs: {
      editor: editorRef, setEditorMarkdown: setEditorMarkdownRef, setHeadings: setHeadingsRef,
      headingsDebounce: headingsDebounceRef, handleImport: handleImportRef,
      onFileDragOver: onFileDragOverRef, slashCommandCallback: slashCommandCallbackRef,
    },
    setHeadingMenu,
  });
  const editor = useEditor(editorConfig, [processedInitialContent]);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || commentDataRef.current.size === 0) return;
    editor.commands.initComments(commentDataRef.current);
  }, [editor]);

  const {
    sourceMode, readonlyMode, reviewMode, sourceText, setSourceText, liveMessage, setLiveMessage,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly,
    executeInReviewMode, handleSourceChange, appendToSource,
  } = useSourceMode({ editor, saveContent, t, frontmatterRef });

  const {
    fileHandle, setFileHandle, fileName, isDirty, supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  } = useFileSystem(fileSystemProvider ?? null);

  const fileHandling = useEditorFileHandling({
    editor, sourceMode, sourceText, handleSourceChange, setSourceText, saveContent,
    fileHandle, frontmatterRef, initialFrontmatter: frontmatterRef.current,
  });

  useEffect(() => {
    fileHandling.setFrontmatterText(frontmatterRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, frontmatterRef]);

  const sourceSearch = useTextareaSearch(sourceTextareaRef, sourceText, handleSourceChange);

  const {
    commentDialogOpen, setCommentDialogOpen, commentText, setCommentText, handleCommentInsert,
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

  const clearContentWithFrontmatter = useCallback(() => {
    clearContent();
    fileHandling.setFrontmatterText(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearContent]);

  const {
    notification, setNotification, pdfExporting,
    fileInputRef, handleClear, handleFileSelected,
    handleDownload, handleImport, handleCopy,
    handleOpenFile, handleSaveFile, handleSaveAsFile, handleExportPdf,
  } = useEditorFileOps({
    editor, sourceMode, sourceText, setSourceText,
    saveContent, downloadMarkdown, clearContent: clearContentWithFrontmatter,
    openFile, saveFile, saveAsFile, resetFile,
    encoding: fileHandling.encoding, fileHandle, setFileHandle, frontmatterRef,
    onFrontmatterChange: fileHandling.setFrontmatterText,
  });

  // Update refs for useEditor callbacks
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;
  setHeadingsRef.current = (h: HeadingItem[]) => { setHeadings(h); onHeadingsChangeRef.current?.(h); };
  handleImportRef.current = handleFileSelected;

  useEditorCommentNotifications(editor, onCommentsChange);

  const plantUmlFloating = useFloatingToolbar(editor, editorWrapperRef, "codeBlock", "plantuml");
  const isInDiagramBlock = !!plantUmlFloating;
  const { handleToggleAllBlocks, handleExpandAllBlocks } = useEditorBlockActions({ editor });

  useEditorSettingsSync(editor, settings, { readOnly, hideFoldAll, handleExpandAllBlocks });

  const {
    inlineMergeOpen, editorMarkdown, setEditorMarkdown,
    mergeUndoRedo, setMergeUndoRedo,
    compareFileContent, setCompareFileContent,
    rightFileOps, setRightFileOps, handleMerge,
  } = useMergeMode({
    editor, sourceMode, isMd, outlineOpen, handleToggleOutline,
    onCompareModeChange, t, setLiveMessage,
  });

  const timeline = useTimeline(timelineProvider ?? null, null);
  const isTimelineActive = timeline.state.commits.length > 0;
  const handleOpenTimeline = useCallback((fp: string) => { timeline.loadTimeline(fp); }, [timeline]);

  setEditorMarkdownRef.current = setEditorMarkdown;
  useEditorSideEffects({ editor, isDirty, markDirty, setHeadingsRef, setEditorMarkdown });
  useVSCodeIntegration(editor);

  const TIMELINE_BAR_HEIGHT = 48;
  const statusBarHeight = hideStatusBar ? 0 : STATUSBAR_HEIGHT;
  const timelineBottomOffset = isTimelineActive ? TIMELINE_BAR_HEIGHT : 0;
  const { editorContainerRef, editorHeight } = useEditorHeight(isMobile, isMd, statusBarHeight + timelineBottomOffset);

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) { appendToSource(template.content); return; }
    if (!editor) return;
    const { frontmatter, body } = preprocessMarkdown(template.content);
    if (frontmatter !== null) { frontmatterRef.current = frontmatter; fileHandling.setFrontmatterText(frontmatter); }
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      editor.chain().focus().insertContent(body).run();
      requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        editor.commands.setTextSelection(0);
        editor.view.dom.scrollTop = 0;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sourceMode, appendToSource, frontmatterRef]);

  useEditorShortcuts({
    editor, sourceMode, readonlyMode, reviewMode, appendToSource,
    handleSaveFile, handleSaveAsFile, handleOpenFile, handleImage,
    handleClear, handleCopy, handleImport: () => fileInputRef.current?.click(),
    handleDownload, handleToggleAllBlocks, handleToggleOutline,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly, handleMerge,
    setDiagramAnchorEl, setTemplateAnchorEl, t,
  });

  const plantUmlToolbarCtx = useMemo(() => ({ setSampleAnchorEl }), [setSampleAnchorEl]);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  }

  const outlineProps = {
    isMd, outlineOpen, handleToggleOutline, outlineWidth, setOutlineWidth, editorHeight,
    headings, foldedIndices, hiddenByFold, foldAll, unfoldAll, toggleFold,
    handleOutlineClick, handleOutlineResizeStart,
    onHeadingDragEnd: (readonlyMode || reviewMode) ? undefined : handleHeadingDragEnd,
    onOutlineDelete: (readonlyMode || reviewMode) ? undefined : handleOutlineDelete,
    t,
  };

  return (
    <EditorSettingsContext.Provider value={{ ...settings, lineHeight: isDark ? 1.8 : 1.6 }}>
    <PlantUmlToolbarContext.Provider value={plantUmlToolbarCtx}>
    <PrintStyles />
    <Box id="main-content" component="main" sx={{ p: { xs: 2, sm: 3 } }}>
      <EditorToolbarSection
        editor={editor} isInDiagramBlock={isInDiagramBlock} handleToggleAllBlocks={handleToggleAllBlocks}
        fileHandlers={{
          onDownload: handleDownload, onClear: handleClear,
          onOpenFile: handleOpenFile, onSaveFile: handleSaveFile,
          onSaveAsFile: handleSaveAsFile, onExportPdf: handleExportPdf,
        }}
        fileInputRef={fileInputRef}
        handleFileSelected={handleFileSelected} setTemplateAnchorEl={setTemplateAnchorEl} setHelpAnchorEl={setHelpAnchorEl}
        sourceMode={sourceMode} readonlyMode={readonlyMode} reviewMode={reviewMode}
        outlineOpen={outlineOpen}
        modeHandlers={{
          onSwitchToSource: handleSwitchToSource, onSwitchToWysiwyg: handleSwitchToWysiwyg,
          onSwitchToReview: handleSwitchToReview, onSwitchToReadonly: handleSwitchToReadonly,
          onToggleOutline: handleToggleOutline, onMerge: handleMerge,
        }}
        inlineMergeOpen={inlineMergeOpen}
        hide={{
          outline: hideOutline, comments: hideComments,
          templates: hideTemplates, foldAll: hideFoldAll,
          fileOps: hideFileOps, undoRedo: hideUndoRedo,
          help: hideHelp, versionInfo: hideVersionInfo,
          settings: hideSettings, toolbar: hideToolbar,
          readonlyToggle: !showReadonlyMode,
        }}
        mergeUndoRedo={inlineMergeOpen ? mergeUndoRedo : null}
        fileHandle={fileHandle} supportsDirectAccess={supportsDirectAccess}
        readOnly={readOnly}
        setSettingsOpen={setSettingsOpen} setVersionDialogOpen={setVersionDialogOpen}
        rightFileOps={rightFileOps}
        setLiveMessage={setLiveMessage} commentOpen={commentOpen} setCommentOpen={setCommentOpen}
        liveMessage={liveMessage} t={t}
      />

      <EditorDialogsSection
        commentDialogOpen={commentDialogOpen} setCommentDialogOpen={setCommentDialogOpen}
        commentText={commentText} setCommentText={setCommentText} handleCommentInsert={handleCommentInsert}
        linkDialogOpen={linkDialogOpen} setLinkDialogOpen={setLinkDialogOpen} linkUrl={linkUrl} setLinkUrl={setLinkUrl} handleLinkInsert={handleLinkInsert}
        imageDialogOpen={imageDialogOpen} setImageDialogOpen={setImageDialogOpen}
        imageUrl={imageUrl} setImageUrl={setImageUrl} imageAlt={imageAlt} setImageAlt={setImageAlt}
        handleImageInsert={handleImageInsert} imageEditMode={imageEditPos !== null}
        shortcutDialogOpen={shortcutDialogOpen} setShortcutDialogOpen={setShortcutDialogOpen}
        versionDialogOpen={versionDialogOpen} setVersionDialogOpen={setVersionDialogOpen}
        helpDialogOpen={helpDialogOpen} setHelpDialogOpen={setHelpDialogOpen} locale={locale}
        hideSettings={hideSettings} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
        settings={settings} updateSettings={updateSettings} resetSettings={resetSettings}
        themeMode={themeMode} onThemeModeChange={onThemeModeChange} onLocaleChange={onLocaleChange} t={t}
      />

      <EditorMainContent
        inlineMergeOpen={inlineMergeOpen} InlineMergeView={InlineMergeView}
        editor={editor} sourceMode={sourceMode} readonlyMode={readonlyMode} reviewMode={reviewMode}
        editorHeight={editorHeight} editorContainerRef={editorContainerRef}
        editorWrapperRef={editorWrapperRef} editorMountCallback={editorMountCallback}
        sourceText={sourceText} handleSourceChange={handleSourceChange}
        sourceTextareaRef={sourceTextareaRef} sourceSearchOpen={sourceSearchOpen} setSourceSearchOpen={setSourceSearchOpen}
        sourceSearch={sourceSearch} frontmatterText={fileHandling.frontmatterText}
        handleFrontmatterChange={fileHandling.handleFrontmatterChange}
        commentOpen={commentOpen} setCommentOpen={setCommentOpen} saveContent={saveContent}
        outlineProps={outlineProps} editorMarkdown={editorMarkdown}
        setMergeUndoRedo={setMergeUndoRedo} compareFileContent={compareFileContent}
        setCompareFileContent={setCompareFileContent} setRightFileOps={setRightFileOps} t={t}
        onFileDrop={handleFileSelected}
        fileDragOver={fileDragOver} onFileDragOverChange={setFileDragOver}
        timelineState={isTimelineActive ? timeline.state : null}
        onTimelineSelectCommit={timeline.selectCommit}
        onTimelineStartPlayback={timeline.startPlayback}
        onTimelineStopPlayback={timeline.stopPlayback}
        onTimelineSetPlaybackSpeed={timeline.setPlaybackSpeed}
        onTimelineClose={timeline.close}
      />

      <EditorFooterOverlays
        editor={editor} editorPortalTarget={editorPortalTarget}
        sourceMode={sourceMode} readonlyMode={readonlyMode} reviewMode={reviewMode}
        handleLink={handleLink} executeInReviewMode={executeInReviewMode}
        slashCommandCallbackRef={slashCommandCallbackRef}
        sourceText={sourceText} fileName={fileName} isDirty={isDirty}
        handleLineEndingChange={hideStatusBar ? undefined : fileHandling.handleLineEndingChange}
        encoding={fileHandling.encoding} handleEncodingChange={hideStatusBar ? undefined : fileHandling.handleEncodingChange}
        onStatusChange={onStatusChange} hideStatusBar={hideStatusBar}
        helpAnchorEl={helpAnchorEl} setHelpAnchorEl={setHelpAnchorEl}
        diagramAnchorEl={diagramAnchorEl} setDiagramAnchorEl={setDiagramAnchorEl}
        sampleAnchorEl={sampleAnchorEl} setSampleAnchorEl={setSampleAnchorEl}
        templateAnchorEl={templateAnchorEl} setTemplateAnchorEl={setTemplateAnchorEl}
        onInsertTemplate={handleInsertTemplate} headingMenu={headingMenu} setHeadingMenu={setHeadingMenu}
        setSettingsOpen={setSettingsOpen} setVersionDialogOpen={setVersionDialogOpen} setHelpDialogOpen={setHelpDialogOpen}
        hideSettings={hideSettings} hideHelp={hideHelp} hideVersionInfo={hideVersionInfo}
        hideTemplates={hideTemplates} inlineMergeOpen={inlineMergeOpen}
        featuresUrl={featuresUrl} appendToSource={appendToSource}
        pdfExporting={pdfExporting} notification={notification} setNotification={setNotification} t={t}
      />
    </Box>
    </PlantUmlToolbarContext.Provider>
    </EditorSettingsContext.Provider>
  );
}
