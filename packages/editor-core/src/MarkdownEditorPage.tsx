"use client";

// Tiptap の ReactRenderer が componentDidMount 内で flushSync を呼ぶ問題を抑制
// @see https://github.com/ueberdosis/tiptap/issues/3764
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

import dynamic from "next/dynamic";
import {
  Box,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { PrintStyles } from "./styles/printStyles";
import { useEditor } from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMarkdownEditor } from "./useMarkdownEditor";
import { defaultContent } from "./constants/defaultContent";
import { EditorDialogs } from "./components/EditorDialogs";
import { EditorSettingsPanel } from "./components/EditorSettingsPanel";
import { useEditorSettings, EditorSettingsContext } from "./useEditorSettings";
import { EditorToolbar } from "./components/EditorToolbar";
import { useTextareaSearch } from "./hooks/useTextareaSearch";
import { EditorMainContent } from "./components/EditorMainContent";
import { EditorFooterOverlays } from "./components/EditorFooterOverlays";
import type { SlashCommandState } from "./extensions/slashCommandExtension";

const InlineMergeView = dynamic(
  () => import("./components/InlineMergeView").then((m) => m.InlineMergeView),
  { loading: () => <CircularProgress size={32} sx={{ m: "auto" }} /> },
);

import type { Editor } from "@tiptap/react";
import {
  type HeadingItem,
  PlantUmlToolbarContext,
  getMarkdownFromEditor,
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
import { useEditorFileHandling } from "./hooks/useEditorFileHandling";
import { useVSCodeIntegration } from "./hooks/useVSCodeIntegration";
import { useEditorCommentNotifications } from "./hooks/useEditorCommentNotifications";
import type { FileSystemProvider } from "./types/fileSystem";
import { sanitizeMarkdown, preserveBlankLines } from "./utils/sanitizeMarkdown";
import { parseFrontmatter } from "./utils/frontmatterHelpers";
import { parseCommentData } from "./utils/commentHelpers";
import type { InlineComment } from "./utils/commentHelpers";


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

export default function MarkdownEditorPage({ hideFileOps, hideUndoRedo, hideSettings, hideHelp, hideVersionInfo, featuresUrl, onCompareModeChange, onHeadingsChange, onCommentsChange, themeMode, onThemeModeChange, onLocaleChange, fileSystemProvider, externalContent, readOnly, hideToolbar, hideOutline, hideComments, hideTemplates, hideFoldAll, hideStatusBar, onStatusChange, showReadonlyMode }: MarkdownEditorPageProps = {}) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const locale = useLocale() as "en" | "ja";
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const noopSave = useCallback(() => {}, []);
  const {
    initialContent,
    loading,
    saveContent: _saveContent,
    downloadMarkdown,
    clearContent,
    frontmatterRef,
  } = useMarkdownEditor(externalContent ?? defaultContent, !!externalContent);
  const saveContent = readOnly ? noopSave : _saveContent;

  const [commentOpen, setCommentOpen] = useState(false);
  const clearContentWithFrontmatter = useCallback(() => {
    clearContent();
    fileHandling.setFrontmatterText(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearContent]);
  const commentDataRef = useRef<Map<string, InlineComment>>(new Map());

  // initialContent からコメントデータを分離
  const processedInitialContent = useMemo(() => {
    if (!initialContent) return initialContent;
    const { comments, body } = parseCommentData(initialContent);
    commentDataRef.current = comments;
    return body;
  }, [initialContent]);
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
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // EditorContent を常時マウントするための永続的なポータルターゲット
  const [editorPortalTarget] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  });
  // callback ref: DOM 出現時に即座にポータルターゲットを移動（dynamic import 対応）
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
  const handleImportRef = useRef<(f: File) => void>(() => {});
  const slashCommandCallbackRef = useRef<(state: SlashCommandState) => void>(() => {});

  const editorConfig = useEditorConfig({
    t, initialContent: processedInitialContent, saveContent,
    editorRef, setEditorMarkdownRef, setHeadingsRef,
    headingsDebounceRef, handleImportRef, setHeadingMenu,
    slashCommandCallbackRef,
  });
  const editor = useEditor(editorConfig, [processedInitialContent]);
  editorRef.current = editor;

  // コメントデータの初期化（editor 生成後に1回だけ実行）
  useEffect(() => {
    if (!editor || commentDataRef.current.size === 0) return;
    editor.commands.initComments(commentDataRef.current);
  }, [editor]);

  // --- Custom hooks ---
  const {
    sourceMode, readonlyMode, reviewMode, sourceText, setSourceText, liveMessage, setLiveMessage,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly,
    executeInReviewMode, handleSourceChange, appendToSource,
  } = useSourceMode({ editor, saveContent, t, frontmatterRef });

  const {
    fileHandle, fileName, isDirty,
    supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  } = useFileSystem(fileSystemProvider ?? null);

  const fileHandling = useEditorFileHandling({
    editor, sourceMode, sourceText, handleSourceChange, setSourceText, saveContent,
    fileHandle, frontmatterRef, initialFrontmatter: frontmatterRef.current,
  });

  // Sync frontmatterText state when mode switches update frontmatterRef
  useEffect(() => {
    fileHandling.setFrontmatterText(frontmatterRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, frontmatterRef]);

  useEffect(() => {
    if (readOnly && editor) {
      editor.setEditable(false);
    }
  }, [readOnly, editor]);

  const sourceSearch = useTextareaSearch(sourceTextareaRef, sourceText, handleSourceChange);

  const {
    commentDialogOpen, setCommentDialogOpen, commentText, setCommentText,
    handleCommentInsert,
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
    notification, setNotification, pdfExporting,
    fileInputRef, handleClear, handleFileSelected,
    handleDownload, handleImport, handleCopy,
    handleOpenFile, handleSaveFile, handleSaveAsFile,
    handleExportPdf,
  } = useEditorFileOps({
    editor, sourceMode, sourceText, setSourceText,
    saveContent, downloadMarkdown, clearContent: clearContentWithFrontmatter,
    openFile, saveFile, saveAsFile, resetFile,
    encoding: fileHandling.encoding, fileHandle, frontmatterRef,
  });

  // Update refs for useEditor callbacks
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;
  setHeadingsRef.current = (h: HeadingItem[]) => {
    setHeadings(h);
    onHeadingsChangeRef.current?.(h);
  };
  handleImportRef.current = handleImport;

  // コメント変更通知（extracted hook）
  useEditorCommentNotifications(editor, onCommentsChange);

  // Floating toolbar positions
  const plantUmlFloating = useFloatingToolbar(editor, editorWrapperRef, "codeBlock", "plantuml");

  // セクション自動番号の表示切替
  useEffect(() => {
    if (!editor) return;
    editor.commands.setShowHeadingNumbers(settings.showHeadingNumbers);
  }, [editor, settings.showHeadingNumbers]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("spellcheck", String(settings.spellCheck));
  }, [editor, settings.spellCheck]);

  const {
    inlineMergeOpen, setInlineMergeOpen: _setInlineMergeOpen,
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

  // VS Code integration (extracted hook)
  useVSCodeIntegration(editor, updateSettings);

  const statusBarHeight = hideStatusBar ? 0 : 33;
  const { editorContainerRef, editorHeight } = useEditorHeight(isMobile, isMd, statusBarHeight);

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) {
      appendToSource(template.content);
      return;
    }
    if (!editor) return;
    const { frontmatter, body } = parseFrontmatter(template.content);
    if (frontmatter !== null) {
      frontmatterRef.current = frontmatter;
      fileHandling.setFrontmatterText(frontmatter);
    }
    const preprocessed = preserveBlankLines(sanitizeMarkdown(body));
    requestAnimationFrame(() => {
      editor.chain().focus().insertContent(preprocessed).run();
      requestAnimationFrame(() => {
        editor.commands.setTextSelection(0);
        editor.view.dom.scrollTop = 0;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sourceMode, appendToSource, frontmatterRef]);

  // PlantUML/Mermaid 編集中はMarkdownツールバーを無効化
  const isInDiagramBlock = !!plantUmlFloating;

  const { handleToggleAllBlocks, handleExpandAllBlocks } = useEditorBlockActions({ editor });

  // hideFoldAll: エディタ準備完了時に全ブロックを展開
  useEffect(() => {
    if (hideFoldAll && editor) handleExpandAllBlocks();
  }, [hideFoldAll, editor, handleExpandAllBlocks]);

  useEditorShortcuts({
    editor, sourceMode, readonlyMode, reviewMode, appendToSource,
    handleSaveFile, handleSaveAsFile, handleOpenFile, handleImage,
    handleClear, handleCopy,
    handleImport: () => fileInputRef.current?.click(),
    handleDownload,
    handleToggleAllBlocks, handleToggleOutline,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly, handleMerge,
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
    onHeadingDragEnd: (readonlyMode || reviewMode) ? undefined : handleHeadingDragEnd,
    onOutlineDelete: (readonlyMode || reviewMode) ? undefined : handleOutlineDelete,
    showHeadingNumbers: settings.showHeadingNumbers,
    onToggleHeadingNumbers: () => updateSettings({ showHeadingNumbers: !settings.showHeadingNumbers }),
    t,
  };

  return (
    <EditorSettingsContext.Provider value={settings}>
    <PlantUmlToolbarContext.Provider value={plantUmlToolbarCtx}>
    <PrintStyles />
    <Box id="main-content" component="main" sx={{ p: { xs: 2, sm: 3 } }}>
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

      {/* Toolbar */}
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

      <EditorDialogs
        commentDialogOpen={commentDialogOpen}
        setCommentDialogOpen={setCommentDialogOpen}
        commentText={commentText}
        setCommentText={setCommentText}
        handleCommentInsert={handleCommentInsert}
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

      <EditorMainContent
        inlineMergeOpen={inlineMergeOpen}
        InlineMergeView={InlineMergeView}
        editor={editor}
        sourceMode={sourceMode}
        readonlyMode={readonlyMode}
        reviewMode={reviewMode}
        editorHeight={editorHeight}
        editorContainerRef={editorContainerRef}
        editorWrapperRef={editorWrapperRef}
        editorMountCallback={editorMountCallback}
        sourceText={sourceText}
        handleSourceChange={handleSourceChange}
        sourceTextareaRef={sourceTextareaRef}
        sourceSearchOpen={sourceSearchOpen}
        setSourceSearchOpen={setSourceSearchOpen}
        sourceSearch={sourceSearch}
        frontmatterText={fileHandling.frontmatterText}
        handleFrontmatterChange={fileHandling.handleFrontmatterChange}
        commentOpen={commentOpen}
        setCommentOpen={setCommentOpen}
        saveContent={saveContent}
        outlineProps={outlineProps}
        editorMarkdown={editorMarkdown}
        setMergeUndoRedo={setMergeUndoRedo}
        compareFileContent={compareFileContent}
        setCompareFileContent={setCompareFileContent}
        setRightFileOps={setRightFileOps}
        t={t}
      />

      <EditorFooterOverlays
        editor={editor}
        editorPortalTarget={editorPortalTarget}
        sourceMode={sourceMode}
        readonlyMode={readonlyMode}
        reviewMode={reviewMode}
        handleLink={handleLink}
        executeInReviewMode={executeInReviewMode}
        slashCommandCallbackRef={slashCommandCallbackRef}
        sourceText={sourceText}
        fileName={fileName}
        isDirty={isDirty}
        handleLineEndingChange={hideStatusBar ? undefined : fileHandling.handleLineEndingChange}
        encoding={fileHandling.encoding}
        handleEncodingChange={hideStatusBar ? undefined : fileHandling.handleEncodingChange}
        onStatusChange={onStatusChange}
        hideStatusBar={hideStatusBar}
        helpAnchorEl={helpAnchorEl}
        setHelpAnchorEl={setHelpAnchorEl}
        diagramAnchorEl={diagramAnchorEl}
        setDiagramAnchorEl={setDiagramAnchorEl}
        sampleAnchorEl={sampleAnchorEl}
        setSampleAnchorEl={setSampleAnchorEl}
        templateAnchorEl={templateAnchorEl}
        setTemplateAnchorEl={setTemplateAnchorEl}
        onInsertTemplate={handleInsertTemplate}
        headingMenu={headingMenu}
        setHeadingMenu={setHeadingMenu}
        setSettingsOpen={setSettingsOpen}
        setVersionDialogOpen={setVersionDialogOpen}
        setHelpDialogOpen={setHelpDialogOpen}
        hideSettings={hideSettings}
        hideHelp={hideHelp}
        hideVersionInfo={hideVersionInfo}
        featuresUrl={featuresUrl}
        appendToSource={appendToSource}
        pdfExporting={pdfExporting}
        notification={notification}
        setNotification={setNotification}
        t={t}
      />

    </Box>
    </PlantUmlToolbarContext.Provider>
    </EditorSettingsContext.Provider>
  );
}
