"use client";

import dynamic from "next/dynamic";
import {
  Alert,
  Backdrop,
  Box,
  CircularProgress,
  Paper,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { getEditorPaperSx } from "./styles/editorStyles";
import { PrintStyles } from "./styles/printStyles";
import { useEditor, EditorContent } from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { SourceSearchBar } from "./components/SourceSearchBar";
import { useTextareaSearch } from "./hooks/useTextareaSearch";
import { EditorMenuPopovers } from "./components/EditorMenuPopovers";
import { EditorBubbleMenu } from "./components/EditorBubbleMenu";
import { SlashCommandMenu } from "./components/SlashCommandMenu";
import type { SlashCommandState } from "./extensions/slashCommandExtension";


const InlineMergeView = dynamic(
  () => import("./components/InlineMergeView").then((m) => m.InlineMergeView),
  { loading: () => <CircularProgress size={32} sx={{ m: "auto" }} /> },
);
import { MergeEditorPanel } from "./components/MergeEditorPanel";
import type { Editor } from "@tiptap/react";
import {
  type EncodingLabel,
  type HeadingItem,
  type MarkdownStorage,
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
import type { FileSystemProvider } from "./types/fileSystem";
import { sanitizeMarkdown, preserveBlankLines } from "./utils/sanitizeMarkdown";

import { CommentPanel } from "./components/CommentPanel";
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
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  onLocaleChange?: (locale: string) => void;
  fileSystemProvider?: FileSystemProvider | null;
}

export default function MarkdownEditorPage({ hideFileOps, hideUndoRedo, hideSettings, hideHelp, hideVersionInfo, featuresUrl, onCompareModeChange, themeMode, onThemeModeChange, onLocaleChange, fileSystemProvider }: MarkdownEditorPageProps = {}) {
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

  const [encoding, setEncoding] = useState<EncodingLabel>("UTF-8");
  const [commentOpen, setCommentOpen] = useState(false);
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
    sourceMode, viewMode, sourceText, setSourceText, liveMessage, setLiveMessage,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToView, executeInViewMode,
    handleSourceChange, appendToSource,
  } = useSourceMode({ editor, saveContent, t });

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
    fileHandle, fileName, isDirty,
    supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  } = useFileSystem(fileSystemProvider ?? null);

  const {
    notification, setNotification, pdfExporting,
    fileInputRef, handleClear, handleFileSelected,
    handleDownload, handleImport, handleCopy,
    handleOpenFile, handleSaveFile, handleSaveAsFile,
    handleExportPdf,
  } = useEditorFileOps({
    editor, sourceMode, sourceText, setSourceText,
    saveContent, downloadMarkdown, clearContent,
    openFile, saveFile, saveAsFile, resetFile,
    encoding, fileHandle,
  });

  const handleLineEndingChange = useCallback(
    (ending: "LF" | "CRLF") => {
      const convert = (text: string) =>
        ending === "CRLF"
          ? text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
          : text.replace(/\r\n/g, "\n");

      if (sourceMode) {
        handleSourceChange(convert(sourceText));
      } else if (editor) {
        const md = convert(getMarkdownFromEditor(editor));
        setSourceText(md);
        editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));
        saveContent(md);
      }
    },
    [sourceMode, sourceText, handleSourceChange, editor, setSourceText, saveContent],
  );

  const handleEncodingChange = useCallback(
    async (newEncoding: EncodingLabel) => {
      setEncoding(newEncoding);
      // fileHandle がある場合、ファイルを新しいエンコーディングで再読み込み
      if (fileHandle?.nativeHandle) {
        try {
          const nativeHandle = fileHandle.nativeHandle as FileSystemFileHandle;
          const file = await nativeHandle.getFile();
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder(newEncoding.toLowerCase());
          const decoded = sanitizeMarkdown(decoder.decode(buffer));
          if (sourceMode) {
            setSourceText(decoded);
          } else if (editor) {
            editor.commands.setContent(
              (editor.storage as unknown as MarkdownStorage).markdown.parser.parse(
                preserveBlankLines(decoded),
              ),
            );
          }
          saveContent(decoded);
        } catch (e) {
          console.warn("Failed to re-read file with encoding:", newEncoding, e);
        }
      }
    },
    [fileHandle, sourceMode, setSourceText, editor, saveContent],
  );

  // Update refs for useEditor callbacks
  setHeadingsRef.current = setHeadings;
  handleImportRef.current = handleImport;

  // Floating toolbar positions (M-5: unified hook)
  // Table toolbar is now embedded in TableNodeView
  // Mermaid toolbar is now embedded in MermaidNodeView
  const plantUmlFloating = useFloatingToolbar(editor, editorWrapperRef, "codeBlock", "plantuml");

  // セクション自動番号の表示切替
  useEffect(() => {
    if (!editor) return;
    editor.commands.setShowHeadingNumbers(settings.showHeadingNumbers);
  }, [editor, settings.showHeadingNumbers]);

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

  const { editorContainerRef, editorHeight } = useEditorHeight(isMobile, isMd);

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) {
      appendToSource(template.content);
      return;
    }
    if (!editor) return;
    const preprocessed = sanitizeMarkdown(template.content);
    // requestAnimationFrame で次フレームに遅延し、Popover 閉じ等の React レンダリングと
    // Tiptap ReactRenderer の flushSync の競合を回避する
    requestAnimationFrame(() => {
      editor.chain().focus().insertContent(preprocessed).run();
      // テンプレート挿入後、カーソルを先頭に移動してスクロール
      requestAnimationFrame(() => {
        editor.commands.setTextSelection(0);
        editor.view.dom.scrollTop = 0;
      });
    });
  }, [editor, sourceMode, appendToSource]);

  // PlantUML/Mermaid 編集中はMarkdownツールバーを無効化
  const isInDiagramBlock = !!plantUmlFloating;

  const { handleToggleAllBlocks } = useEditorBlockActions({ editor });

  useEditorShortcuts({
    editor, sourceMode, viewMode, appendToSource,
    handleSaveFile, handleSaveAsFile, handleOpenFile, handleImage,
    handleClear, handleCopy,
    handleImport: () => fileInputRef.current?.click(),
    handleDownload,
    handleToggleAllBlocks, handleToggleOutline,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToView, handleMerge,
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
    onHeadingDragEnd: viewMode ? undefined : handleHeadingDragEnd,
    onOutlineDelete: viewMode ? undefined : handleOutlineDelete,
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
        onToggleAllBlocks={handleToggleAllBlocks}
        onDownload={handleDownload}
        onImport={() => fileInputRef.current?.click()}
        onClear={handleClear}
        onSetTemplateAnchor={setTemplateAnchorEl}
        onSetHelpAnchor={setHelpAnchorEl}
        sourceMode={sourceMode}
        viewMode={viewMode}
        outlineOpen={outlineOpen}
        onToggleOutline={handleToggleOutline}
        onMerge={handleMerge}
        inlineMergeOpen={inlineMergeOpen}
        onSwitchToSource={handleSwitchToSource}
        onSwitchToWysiwyg={handleSwitchToWysiwyg}
        onSwitchToView={handleSwitchToView}

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
        onExportPdf={handleExportPdf}
        onAnnounce={setLiveMessage}
        commentOpen={commentOpen}
        onToggleComments={() => setCommentOpen((prev) => !prev)}
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
          tabIndex={viewMode ? 0 : undefined}
          onKeyDown={viewMode ? (e: React.KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "f") {
              e.preventDefault();
              editor?.commands.openSearch();
            }
          } : undefined}
          sx={{ position: "relative", outline: "none" }}
        >
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
        {commentOpen && editor && !sourceMode && (
          <CommentPanel editor={editor} open={commentOpen} onClose={() => setCommentOpen(false)} onSave={() => saveContent(getMarkdownFromEditor(editor))} t={t} />
        )}
      </Box>
      )}

      {/* BubbleMenu (text formatting) – rendered for both merge and non-merge modes */}
      {editor && !sourceMode && (
        <EditorBubbleMenu editor={editor} onLink={handleLink} viewMode={viewMode} executeInViewMode={executeInViewMode} t={t} />
      )}

      {/* Slash command menu */}
      {editor && !sourceMode && !viewMode && (
        <SlashCommandMenu editor={editor} t={t} slashCommandCallbackRef={slashCommandCallbackRef} />
      )}

      {/* Status bar */}
      {editor && <StatusBar editor={editor} sourceMode={sourceMode} sourceText={sourceText} t={t} fileName={fileName} isDirty={isDirty} onLineEndingChange={handleLineEndingChange} encoding={encoding} onEncodingChange={handleEncodingChange} />}

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
        featuresUrl={featuresUrl}
        t={t}
      />

      <Backdrop open={pdfExporting} sx={{ zIndex: (theme) => theme.zIndex.modal + 1, flexDirection: "column", gap: 2, "@media print": { display: "none" } }}>
        <CircularProgress color="inherit" />
        <Typography variant="body2" color="inherit">{t("pdfPreparing")}</Typography>
      </Backdrop>

      <Snackbar
        open={notification !== null}
        autoHideDuration={3000}
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

    </Box>
    </PlantUmlToolbarContext.Provider>
    </EditorSettingsContext.Provider>
  );
}
