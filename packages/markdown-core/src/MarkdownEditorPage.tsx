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
import { EditorErrorBoundary } from "./components/EditorErrorBoundary";
import { EditorFooterOverlays } from "./components/EditorFooterOverlays";
import { EditorMainContent } from "./components/EditorMainContent";
import { EditorToolbarSection } from "./components/EditorToolbarSection";
import { ReadonlyToolbar } from "./components/ReadonlyToolbar";
import { ScreenCaptureDialog } from "./components/ScreenCaptureDialog";
import { getDefaultContent } from "./constants/defaultContent";
import { STATUSBAR_HEIGHT } from "./constants/dimensions";
import type { ThemePresetName } from "./constants/themePresets";
import type { SlashCommandState } from "./extensions/slashCommandExtension";
import { useTextareaSearch } from "./hooks/useTextareaSearch";
import { PrintStyles } from "./styles/printStyles";
import { EditorSettingsContext,useEditorSettings } from "./useEditorSettings";
import { EditorFeaturesContext } from "./contexts/EditorFeaturesContext";
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
import { useSectionNumbers } from "./hooks/useSectionNumbers";
import { useSourceMode } from "./hooks/useSourceMode";
import { useVSCodeIntegration } from "./hooks/useVSCodeIntegration";
import { getEditorStorage, getMarkdownFromEditor, type HeadingItem, PlantUmlToolbarContext } from "./types";
import type { FileSystemProvider } from "./types/fileSystem";
import type { InlineComment } from "./utils/commentHelpers";
import { parseCommentData } from "./utils/commentHelpers";
import { preprocessMarkdown } from "./utils/frontmatterHelpers";

/** Insert template content into the WYSIWYG editor (extracted to reduce component CC) */
function insertTemplateIntoEditor(
  editor: Editor | null,
  content: string,
  frontmatterRef: React.RefObject<string | null>,
  setFrontmatterText: (fm: string | null) => void,
) {
  if (!editor) return;
  const { frontmatter, body } = preprocessMarkdown(content);
  if (frontmatter !== null) { frontmatterRef.current = frontmatter; setFrontmatterText(frontmatter); }
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    editor.chain().focus().insertContent(body).run();
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      editor.commands.setTextSelection(0);
      editor.view.dom.scrollTop = 0;
    });
  });
}

/** Handle change gutter keyboard shortcuts (extracted to reduce component CC) */
function handleChangeGutterKeydown(e: KeyboardEvent, editor: Editor) {
  if (e.key === "Escape") {
    editor.commands.setChangeGutterBaseline();
    return;
  }
  if (e.key === "F5" && e.altKey) {
    e.preventDefault();
    if (e.shiftKey) {
      editor.commands.goToPrevChange();
    } else {
      editor.commands.goToNextChange();
    }
  }
}

interface MarkdownEditorPageProps {
  hideFileOps?: boolean;
  hideUndoRedo?: boolean;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  onCompareModeChange?: (active: boolean) => void;
  onHeadingsChange?: (headings: HeadingItem[]) => void;
  onCommentsChange?: (comments: Array<{ id: string; text: string; resolved: boolean; createdAt: string; targetText: string; pos: number; isPoint: boolean }>) => void;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
  onLocaleChange?: (locale: string) => void;
  fileSystemProvider?: FileSystemProvider | null;
  externalContent?: string;
  /** 外部コンテンツのファイル名（ステータスバー表示用） */
  externalFileName?: string;
  /** 外部コンテンツのリポジトリ内フルパス */
  externalFilePath?: string;
  /** 外部コンテンツの上書き保存コールバック */
  onExternalSave?: (content: string) => void;
  readOnly?: boolean;
  hideToolbar?: boolean;
  hideOutline?: boolean;
  hideComments?: boolean;
  hideTemplates?: boolean;
  hideFoldAll?: boolean;
  hideStatusBar?: boolean;
  onStatusChange?: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => void;
  /** 自動再読み込み状態（VS Code 拡張用） */
  autoReload?: boolean;
  /** エディタモード変更時のコールバック */
  onModeChange?: (mode: "wysiwyg" | "source" | "review" | "readonly") => void;
  /** 初期表示をソースモードにする */
  defaultSourceMode?: boolean;
  showReadonlyMode?: boolean;
  /** 外部から比較モードの右パネルにコンテンツをロード */
  externalCompareContent?: string | null;
  /** エクスプローラパネルの開閉状態 */
  explorerOpen?: boolean;
  /** エクスプローラパネルの開閉トグル */
  onToggleExplorer?: () => void;
  /** 右端に縦ツールバーを表示（アウトライン/コメント切替） */
  sideToolbar?: boolean;
  /** 比較モードトグルを非表示 */
  hideCompareToggle?: boolean;
  /** グラフ表示機能を非表示（jsxgraph/plotly 未バンドル環境向け） */
  hideGraph?: boolean;
  /** エクスプローラパネルのスロット（コメントパネルと同じ位置に表示） */
  explorerSlot?: React.ReactNode;
  /** スクロールなしで全体表示 */
  noScroll?: boolean;
  /** アウトラインパネルの初期表示状態 */
  defaultOutlineOpen?: boolean;
  /** エディタの高さを固定指定（useEditorHeight の自動計算を上書き） */
  fixedEditorHeight?: number;
  /** フォントサイズの上書き（px） — 常に強制適用 */
  defaultFontSize?: number;
  /** フォントサイズの初期値（px） — 初回のみ適用、ユーザー変更可 */
  initialFontSize?: number;
  /** ブロック要素の配置の上書き */
  defaultBlockAlign?: "left" | "center" | "right";
  /** コンテンツ保存時のコールバック（localStorage 書き込み後に呼ばれる） */
  onContentChange?: (content: string) => void;
  /** フロントマターブロックの表示（デフォルト: false） */
  showFrontmatter?: boolean;
  /** エディタ下部の追加オフセット（px） — useEditorHeight の bottomOffset に加算 */
  bottomOffset?: number;
  /** スプレッドシートのグリッド行数 */
  gridRows?: number;
  /** スプレッドシートのグリッド列数 */
  gridCols?: number;
}

/** Apply external compare content and open merge mode if needed (extracted to reduce component complexity). */
function applyExternalCompareContent(
  content: string,
  inlineMergeOpen: boolean,
  sourceMode: boolean,
  editor: ReturnType<typeof useEditor>,
  setCompareFileContent: (v: string) => void,
  setEditorMarkdown: (v: string) => void,
  setInlineMergeOpen: (v: boolean) => void,
): void {
  setCompareFileContent(content);
  if (!inlineMergeOpen) {
    if (!sourceMode && editor) {
      setEditorMarkdown(getMarkdownFromEditor(editor));
    }
    setInlineMergeOpen(true);
  }
}

export default function MarkdownEditorPage({ hideFileOps, hideUndoRedo, hideSettings, hideVersionInfo, onCompareModeChange, onHeadingsChange, onCommentsChange, themeMode, onThemeModeChange, presetName, onPresetChange, onLocaleChange, fileSystemProvider, externalContent, externalFileName, externalFilePath: _externalFilePath, onExternalSave, readOnly, hideToolbar, hideOutline, hideComments, hideTemplates, hideFoldAll, hideStatusBar, onStatusChange, autoReload, onModeChange, defaultSourceMode, showReadonlyMode, externalCompareContent, explorerOpen, onToggleExplorer, sideToolbar, hideCompareToggle, hideGraph, explorerSlot, noScroll, defaultOutlineOpen, fixedEditorHeight, defaultFontSize, initialFontSize, defaultBlockAlign, onContentChange, showFrontmatter, bottomOffset: extraBottomOffset, gridRows, gridCols }: MarkdownEditorPageProps = {}) {
  const t = useTranslations("MarkdownEditor");
  const locale = useLocale() as "en" | "ja";
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const isMd = useMediaQuery(muiTheme.breakpoints.up("md"));
  const isDark = muiTheme.palette.mode === "dark";
  const noopSave = useCallback(() => {}, []);
  const {
    initialContent, loading, saveContent: _saveContent, downloadMarkdown, clearContent, frontmatterRef, initialTrailingNewline,
  } = useMarkdownEditor(externalContent ?? getDefaultContent(locale), externalContent !== undefined, onContentChange);
  const saveContent = readOnly ? noopSave : _saveContent;

  const [commentOpen, setCommentOpen] = useState(false);
  const commentDataRef = useRef<Map<string, InlineComment>>(new Map());
  const processedInitialContent = useMemo(() => {
    if (!initialContent) return initialContent;
    const { comments, body } = parseCommentData(initialContent);
    commentDataRef.current = comments;
    return body;
  }, [initialContent]);

  const { settings: rawSettings, updateSettings, resetSettings } = useEditorSettings();
  const initialFontSizeApplied = useRef(false);
  if (initialFontSize && !initialFontSizeApplied.current) {
    initialFontSizeApplied.current = true;
    if (rawSettings.fontSize !== initialFontSize) {
      updateSettings({ fontSize: initialFontSize });
    }
  }
  const settings = useMemo(() => ({ ...rawSettings, ...(defaultFontSize && { fontSize: defaultFontSize }), ...(defaultBlockAlign && { blockAlign: defaultBlockAlign }) }), [rawSettings, defaultFontSize, defaultBlockAlign]);
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
  const handleImportRef = useRef<(f: File, nativeHandle?: FileSystemFileHandle) => void | Promise<void>>(() => {});
  const [fileDragOver, setFileDragOver] = useState(false);
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
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
    gridRows,
    gridCols,
  });
  const editor = useEditor(editorConfig, [processedInitialContent]);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || commentDataRef.current.size === 0) return;
    editor.commands.initComments(commentDataRef.current);
  }, [editor]);

  const {
    sourceMode, readonlyMode: _readonlyMode, reviewMode, sourceText, setSourceText, liveMessage, setLiveMessage,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly,
    executeInReviewMode, handleSourceChange, appendToSource,
  } = useSourceMode({ editor, saveContent, t, frontmatterRef, defaultSourceMode, onModeChange });
  // readOnly prop が true の場合は常に readonlyMode を強制
  const readonlyMode = readOnly || _readonlyMode;

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
    handleImage: _handleImage, handleImageInsert, shortcutDialogOpen, setShortcutDialogOpen,
    versionDialogOpen, setVersionDialogOpen,
  } = useEditorDialogs({ editor, sourceMode, appendToSource });

  const {
    outlineOpen, headings, setHeadings, foldedIndices, hiddenByFold,
    outlineWidth, setOutlineWidth, handleToggleOutline, handleHeadingDragEnd,
    handleOutlineDelete, handleOutlineClick, toggleFold, foldAll, unfoldAll,
    handleOutlineResizeStart,
  } = useOutline({ editor, sourceMode, defaultOutlineOpen });


  const clearContentWithFrontmatter = useCallback(() => {
    clearContent();
    fileHandling.setFrontmatterText(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearContent]);

  const {
    notification, setNotification, pdfExporting,
    fileInputRef, handleClear, handleFileSelected,
    handleDownload, handleCopy,
    handleOpenFile, handleSaveFile, handleSaveAsFile, handleExportPdf,
  } = useEditorFileOps({
    editor, sourceMode, sourceText, setSourceText,
    saveContent, downloadMarkdown, clearContent: clearContentWithFrontmatter,
    openFile, saveFile, saveAsFile, resetFile,
    encoding: fileHandling.encoding, fileHandle, setFileHandle, frontmatterRef,
    onFrontmatterChange: fileHandling.setFrontmatterText,
    onExternalSave,
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
    inlineMergeOpen, setInlineMergeOpen, editorMarkdown, setEditorMarkdown,
    mergeUndoRedo, setMergeUndoRedo,
    compareFileContent, setCompareFileContent,
    rightFileOps, setRightFileOps, handleMerge,
  } = useMergeMode({
    editor, sourceMode, isMd, outlineOpen, handleToggleOutline,
    onCompareModeChange, t, setLiveMessage,
  });

  // 外部から比較コンテンツを受け取ったら右パネルにロード＆比較モード自動オープン
  const prevCompareContentRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (externalCompareContent == null || externalCompareContent === prevCompareContentRef.current) return;
    prevCompareContentRef.current = externalCompareContent;
    applyExternalCompareContent(externalCompareContent, inlineMergeOpen, sourceMode, editor, setCompareFileContent, setEditorMarkdown, setInlineMergeOpen);
  }, [externalCompareContent, inlineMergeOpen, sourceMode, editor, setCompareFileContent, setEditorMarkdown, setInlineMergeOpen]);

  setEditorMarkdownRef.current = setEditorMarkdown;
  useEditorSideEffects({ editor, isDirty, markDirty, setHeadingsRef, setEditorMarkdown, frontmatterRef, onFrontmatterChange: fileHandling.setFrontmatterText });
  useVSCodeIntegration(editor);

  // スラッシュコマンドからフロントマターを操作するためのストレージ登録
  const setFrontmatterTextRef = useRef(fileHandling.setFrontmatterText);
  setFrontmatterTextRef.current = fileHandling.setFrontmatterText;
  useEffect(() => {
    if (!editor) return;
    let storage: Record<string, unknown>;
    try { storage = getEditorStorage(editor); } catch { return; }
    if (!storage) return;
    storage.frontmatter = {
      get: () => frontmatterRef.current,
      set: (value: string | null) => { frontmatterRef.current = value; setFrontmatterTextRef.current(value); },
    };
    return () => { delete storage.frontmatter; };
  }, [editor, frontmatterRef]);

  // VS Code 拡張からのモード切替イベント
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<string>).detail;
      if (mode === "review") handleSwitchToReview();
      else if (mode === "source") handleSwitchToSource();
      else if (mode === "wysiwyg") handleSwitchToWysiwyg();
    };
    globalThis.addEventListener("vscode-set-mode", handler);
    return () => globalThis.removeEventListener("vscode-set-mode", handler);
  }, [handleSwitchToReview, handleSwitchToSource, handleSwitchToWysiwyg]);

  // 自動再読み込みトグル: ON で baseline を保存、OFF でクリア
  useEffect(() => {
    if (!editor) return;
    const command = autoReload ? editor.commands.setChangeGutterBaseline : editor.commands.clearChangeGutter;
    command.call(editor.commands);
  }, [editor, autoReload]);

  // ESC: 変更ガター起点リセット、Alt+F5/Shift+Alt+F5: 変更箇所ナビ（autoReload ON 時のみ）
  useEffect(() => {
    if (!editor || !autoReload) return;
    const handler = (e: KeyboardEvent) => handleChangeGutterKeydown(e, editor);
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [editor, autoReload]);

  // VS Code Undo/Redo: ソースモード時は vscode-set-content で sourceText を更新
  // saveContent は呼ばない（contentChanged ループ防止）
  useEffect(() => {
    if (!sourceMode) return;
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (typeof content !== "string") return;
      const { body } = preprocessMarkdown(content);
      setSourceText(body);
    };
    globalThis.addEventListener("vscode-set-content", handler);
    return () => globalThis.removeEventListener("vscode-set-content", handler);
  }, [sourceMode, setSourceText]);

  // VS Code: クリップボード画像の保存完了 → エディタに相対パスで画像挿入
  // <base href> が設定されているため、相対パスで画像が表示される
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      editor.chain().focus().setImage({ src: detail, alt: "" }).run();
    };
    globalThis.addEventListener("vscode-image-saved", handler);
    return () => globalThis.removeEventListener("vscode-image-saved", handler);
  }, [editor]);

  // VS Code: 外部画像ダウンロード完了 → エディタ内の該当画像 src をローカルパスに差し替え
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const { originalUrl, localPath } = (e as CustomEvent<{ originalUrl: string; localPath: string }>).detail;
      if (!originalUrl || !localPath) return;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.src === originalUrl) {
          const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: localPath });
          editor.view.dispatch(tr);
        }
      });
    };
    globalThis.addEventListener("vscode-image-downloaded", handler);
    return () => globalThis.removeEventListener("vscode-image-downloaded", handler);
  }, [editor]);

  // Screen capture slash command event
  useEffect(() => {
    const handler = () => setScreenCaptureOpen(true);
    globalThis.addEventListener("open-screen-capture", handler);
    return () => globalThis.removeEventListener("open-screen-capture", handler);
  }, []);

  const statusBarHeight = hideStatusBar ? 0 : STATUSBAR_HEIGHT;
  const { editorContainerRef, editorHeight: autoEditorHeight } = useEditorHeight(isMobile, isMd, statusBarHeight + (extraBottomOffset ?? 0));
  const editorHeight = fixedEditorHeight ?? autoEditorHeight;

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) { appendToSource(template.content); return; }
    insertTemplateIntoEditor(editor, template.content, frontmatterRef, fileHandling.setFrontmatterText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sourceMode, appendToSource, frontmatterRef]);

  useEditorShortcuts({
    sourceMode, readonlyMode, reviewMode,
    handleSaveFile, handleSaveAsFile, handleOpenFile,
    handleClear, handleCopy,
    handleSwitchToSource, handleSwitchToWysiwyg, handleSwitchToReview, handleSwitchToReadonly, handleMerge,
  });

  const settingsValue = useMemo(
    () => ({ ...settings, lineHeight: isDark ? 1.8 : 1.6 }),
    [settings, isDark],
  );
  const plantUmlToolbarCtx = useMemo(() => ({ setSampleAnchorEl }), [setSampleAnchorEl]);

  const { handleInsertSectionNumbers, handleRemoveSectionNumbers } = useSectionNumbers(editor);

  if (loading) {
    return <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}><CircularProgress /></Box>;
  }

  const isRestrictedMode = readonlyMode || reviewMode;
  const outlineProps = {
    isMd, outlineOpen, handleToggleOutline, outlineWidth, setOutlineWidth, editorHeight,
    headings, foldedIndices, hiddenByFold, foldAll, unfoldAll, toggleFold,
    handleOutlineClick, handleOutlineResizeStart,
    onHeadingDragEnd: isRestrictedMode ? undefined : handleHeadingDragEnd,
    onOutlineDelete: isRestrictedMode ? undefined : handleOutlineDelete,
    onInsertSectionNumbers: isRestrictedMode ? undefined : handleInsertSectionNumbers,
    onRemoveSectionNumbers: isRestrictedMode ? undefined : handleRemoveSectionNumbers,
    t,
  };

  return (
    <EditorErrorBoundary>
    <EditorSettingsContext.Provider value={settingsValue}>
    <EditorFeaturesContext.Provider value={{ hideGraph: !!hideGraph }}>
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
          onToggleExplorer,
        }}
        explorerOpen={explorerOpen}
        inlineMergeOpen={inlineMergeOpen}
        hide={{
          outline: hideOutline || (sideToolbar && !readonlyMode && isMd), comments: hideComments || (sideToolbar && isMd),
          explorer: sideToolbar && isMd, compareToggle: hideCompareToggle,
          templates: hideTemplates, foldAll: hideFoldAll,
          fileOps: hideFileOps, undoRedo: hideUndoRedo,
          versionInfo: hideVersionInfo,
          settings: hideSettings, toolbar: hideToolbar || readOnly,
          readonlyToggle: !showReadonlyMode,
        }}
        mergeUndoRedo={inlineMergeOpen ? mergeUndoRedo : null}
        fileHandle={fileHandle ?? (onExternalSave ? true : null)} supportsDirectAccess={supportsDirectAccess}
        externalSaveOnly={!!onExternalSave}
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
        locale={locale}
        hideSettings={hideSettings} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
        settings={settings} updateSettings={updateSettings} resetSettings={resetSettings}
        themeMode={themeMode} onThemeModeChange={onThemeModeChange} presetName={presetName} onPresetChange={onPresetChange} onLocaleChange={onLocaleChange} t={t}
      />

      <ScreenCaptureDialog
        open={screenCaptureOpen}
        onClose={() => setScreenCaptureOpen(false)}
        onCapture={(dataUrl) => {
          editor?.chain().focus().setImage({ src: dataUrl, alt: "" }).run();
        }}
        t={t}
      />

      {(_readonlyMode || readOnly) && !hideToolbar && (
        <ReadonlyToolbar
          outlineOpen={outlineOpen}
          onToggleOutline={handleToggleOutline}
          fontSize={settings.fontSize}
          onFontSizeChange={(size) => updateSettings({ fontSize: size })}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          presetName={presetName}
          onPresetChange={onPresetChange}
          t={t}
        />
      )}

      <EditorMainContent
        inlineMergeOpen={inlineMergeOpen} InlineMergeView={InlineMergeView}
        editor={editor} sourceMode={sourceMode} readonlyMode={readonlyMode} reviewMode={reviewMode}
        editorHeight={editorHeight} editorContainerRef={editorContainerRef}
        editorWrapperRef={editorWrapperRef} editorMountCallback={editorMountCallback}
        sourceText={sourceText} handleSourceChange={handleSourceChange}
        sourceTextareaRef={sourceTextareaRef} sourceSearchOpen={sourceSearchOpen} setSourceSearchOpen={setSourceSearchOpen}
        sourceSearch={sourceSearch} frontmatterText={showFrontmatter ? fileHandling.frontmatterText : null}
        handleFrontmatterChange={fileHandling.handleFrontmatterChange}
        commentOpen={commentOpen} setCommentOpen={setCommentOpen} saveContent={saveContent}
        outlineProps={outlineProps} editorMarkdown={editorMarkdown}
        setMergeUndoRedo={setMergeUndoRedo} compareFileContent={compareFileContent}
        setCompareFileContent={setCompareFileContent} setRightFileOps={setRightFileOps} t={t}
        onFileDrop={handleFileSelected}
        fileDragOver={fileDragOver} onFileDragOverChange={setFileDragOver}
        sideToolbar={sideToolbar && !readonlyMode}
        onToggleOutline={handleToggleOutline}
        explorerOpen={explorerOpen}
        onToggleExplorer={onToggleExplorer}
        onOpenSettings={hideSettings ? undefined : () => setSettingsOpen(true)}
        explorerSlot={explorerSlot}
        noScroll={noScroll}
        onSwitchToReview={handleSwitchToReview}
        onSwitchToWysiwyg={handleSwitchToWysiwyg}
        onSwitchToSource={handleSwitchToSource}
      />

      <EditorFooterOverlays
        editor={editor} editorPortalTarget={editorPortalTarget}
        sourceMode={sourceMode} readonlyMode={readonlyMode} reviewMode={reviewMode}
        handleLink={handleLink} executeInReviewMode={executeInReviewMode}
        slashCommandCallbackRef={slashCommandCallbackRef}
        sourceText={sourceText} fileName={fileName ?? externalFileName ?? null} isDirty={isDirty}
        handleLineEndingChange={hideStatusBar ? undefined : fileHandling.handleLineEndingChange}
        encoding={fileHandling.encoding} handleEncodingChange={hideStatusBar ? undefined : fileHandling.handleEncodingChange}
        onStatusChange={onStatusChange} hideStatusBar={hideStatusBar}
        helpAnchorEl={helpAnchorEl} setHelpAnchorEl={setHelpAnchorEl}
        diagramAnchorEl={diagramAnchorEl} setDiagramAnchorEl={setDiagramAnchorEl}
        sampleAnchorEl={sampleAnchorEl} setSampleAnchorEl={setSampleAnchorEl}
        templateAnchorEl={templateAnchorEl} setTemplateAnchorEl={setTemplateAnchorEl}
        onInsertTemplate={handleInsertTemplate} headingMenu={headingMenu} setHeadingMenu={setHeadingMenu}
        setSettingsOpen={setSettingsOpen} setVersionDialogOpen={setVersionDialogOpen}
        hideSettings={hideSettings} hideVersionInfo={hideVersionInfo}
        hideTemplates={hideTemplates} inlineMergeOpen={inlineMergeOpen}
        appendToSource={appendToSource}
        outlineOpen={outlineOpen} commentOpen={commentOpen}
        onToggleOutline={handleToggleOutline}
        onToggleComments={() => setCommentOpen((prev) => !prev)}
        onOpenSettings={hideSettings ? undefined : () => setSettingsOpen(true)}
        pdfExporting={pdfExporting} notification={notification} setNotification={setNotification} t={t}
      />
    </Box>
    </PlantUmlToolbarContext.Provider>
    </EditorFeaturesContext.Provider>
    </EditorSettingsContext.Provider>
    </EditorErrorBoundary>
  );
}
