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
import { alpha } from "@mui/material/styles";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { getBaseExtensions } from "./editorExtensions";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMarkdownEditor } from "./useMarkdownEditor";
import { welcomeContent } from "./constants/welcomeContent";
import { Details, DetailsSummary } from "./detailsExtension";
import { StatusBar } from "./components/StatusBar";
import OutlinePanel from "./components/OutlinePanel";
import { EditorDialogs } from "./components/EditorDialogs";
import { EditorSettingsPanel } from "./components/EditorSettingsPanel";
import { useEditorSettings, EditorSettingsContext } from "./useEditorSettings";
import { SearchReplaceExtension } from "./searchReplaceExtension";
import { EditorToolbar } from "./components/EditorToolbar";
import { EditorMenuPopovers } from "./components/EditorMenuPopovers";
import { EditorBubbleMenu } from "./components/EditorBubbleMenu";
import type { MergeUndoRedo } from "./components/InlineMergeView";

const InlineMergeView = dynamic(
  () => import("./components/InlineMergeView").then((m) => m.InlineMergeView),
  { loading: () => <CircularProgress size={32} sx={{ m: "auto" }} /> },
);
import { MergeEditorPanel } from "./components/MergeEditorPanel";
import type { Editor } from "@tiptap/react";
import { CustomHardBreak } from "./extensions/customHardBreak";
import { DeleteLineExtension } from "./extensions/deleteLineExtension";
import {
  getMarkdownFromEditor,
  type HeadingItem, extractHeadings,
  PlantUmlToolbarContext,
} from "./types";
import type { MarkdownTemplate } from "./constants/templates";
import { useSourceMode } from "./hooks/useSourceMode";
import { useEditorDialogs } from "./hooks/useEditorDialogs";
import { useOutline } from "./hooks/useOutline";
import { useEditorFileOps } from "./hooks/useEditorFileOps";
import { useFileSystem } from "./hooks/useFileSystem";
import type { FileSystemProvider } from "./types/fileSystem";


// Floating toolbar position hook (M-5: shared logic for table/plantuml/mermaid)
function useFloatingToolbar(
  editor: Editor | null,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  nodeType: string,
  language?: string,
): { top: number; left: number } | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor) { setPosition(null); return; }
    const update = () => {
      if (!wrapperRef.current) { setPosition(null); return; }
      const { $from } = editor.state.selection;
      let depth = $from.depth;
      let found = false;
      while (depth > 0) {
        const node = $from.node(depth);
        if (node.type.name === nodeType && (!language || node.attrs.language === language)) {
          found = true;
          break;
        }
        depth--;
      }
      if (!found) { setPosition(null); return; }
      const blockStart = $from.before(depth);
      const dom = editor.view.nodeDOM(blockStart);
      if (!(dom instanceof HTMLElement)) { setPosition(null); return; }
      const rect = dom.getBoundingClientRect();
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      setPosition({ top: rect.top - wrapperRect.top - 36, left: rect.right - wrapperRect.left });
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    update();
    return () => { editor.off("selectionUpdate", update); editor.off("update", update); };
  }, [editor, wrapperRef, nodeType, language]);

  return position;
}


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
  const isLg = useMediaQuery(theme.breakpoints.up("lg"));
  const {
    initialContent,
    loading,
    saveContent,
    downloadMarkdown,
    clearContent,
  } = useMarkdownEditor(welcomeContent);

  const { settings, updateSettings, resetSettings } = useEditorSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [sampleAnchorEl, setSampleAnchorEl] = useState<HTMLElement | null>(null);
  const [diagramAnchorEl, setDiagramAnchorEl] = useState<HTMLElement | null>(null);
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLElement | null>(null);
  const [templateAnchorEl, setTemplateAnchorEl] = useState<HTMLElement | null>(null);
  const [headingMenu, setHeadingMenu] = useState<{ anchorEl: HTMLElement; pos: number; currentLevel: number } | null>(null);
  const [inlineMergeOpen, setInlineMergeOpen] = useState(false);
  const [editorMarkdown, setEditorMarkdown] = useState("");
  const [mergeUndoRedo, setMergeUndoRedo] = useState<MergeUndoRedo | null>(null);
  const [compareFileContent, setCompareFileContent] = useState<string | null>(null);
  const [rightFileOps, setRightFileOps] = useState<{ loadFile: () => void; exportFile: () => void } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Refs for callbacks used in useEditor config (avoids stale closures)
  const setHeadingsRef = useRef<(h: HeadingItem[]) => void>(() => {});
  const headingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImportRef = useRef<(f: File) => void>(() => {});

  const editor = useEditor(
    {
      extensions: [
        ...getBaseExtensions(),
        CustomHardBreak,
        DeleteLineExtension,
        SearchReplaceExtension,
        Details,
        DetailsSummary,
        Placeholder.configure({ placeholder: t("placeholder") }),
      ],
      editorProps: {
        handleDrop: (view, event, _slice, moved) => {
          if (moved || !event.dataTransfer?.files.length) return false;
          const mdFile = Array.from(event.dataTransfer.files).find((f) => f.name.endsWith(".md") || f.type === "text/markdown");
          if (mdFile) { event.preventDefault(); handleImportRef.current(mdFile); return true; }
          const images = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
          if (!images.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
          images.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") return;
              const tr = view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: reader.result, alt: file.name }));
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
          });
          return true;
        },
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          const images = Array.from(items).filter((item) => item.type.startsWith("image/"));
          if (!images.length) return false;
          event.preventDefault();
          images.forEach((item) => {
            const file = item.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") return;
              const { from } = view.state.selection;
              const tr = view.state.tr.insert(from, view.state.schema.nodes.image.create({ src: reader.result, alt: file.name }));
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
          });
          return true;
        },
        handleDOMEvents: {
          click: (_view, event) => {
            const target = event.target as HTMLElement;
            const headingEl = target.closest("h1, h2, h3, h4, h5") as HTMLElement | null;
            let blockEl: HTMLElement | null = headingEl;
            let level = 0;
            if (headingEl) {
              level = parseInt(headingEl.tagName.substring(1));
            } else {
              // tiptap 直下の p, li, blockquote を検出
              const candidates = ["li", "p", "blockquote"] as const;
              for (const sel of candidates) {
                const el = target.closest(sel) as HTMLElement | null;
                if (el) {
                  // tiptap 直下、または直下の要素の子孫であること
                  let parent: HTMLElement | null = el;
                  while (parent && !parent.classList.contains("tiptap")) {
                    parent = parent.parentElement;
                  }
                  if (parent) { blockEl = el; break; }
                }
              }
            }
            if (!blockEl) return false;
            const rect = blockEl.getBoundingClientRect();
            if (event.clientX < rect.left) {
              event.preventDefault();
              // blockquote の場合は内部の最初の p から位置を取得
              const posTarget = blockEl.tagName.toLowerCase() === "blockquote"
                ? (blockEl.querySelector("p") ?? blockEl)
                : blockEl;
              const pos = _view.posAtDOM(posTarget, 0);
              editor?.chain().setTextSelection(pos).run();
              setHeadingMenu({ anchorEl: blockEl, pos, currentLevel: level });
              return true;
            }
            return false;
          },
          copy: (view, event) => {
            const { $from, $to } = view.state.selection;
            if ($from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
              if (!event.clipboardData) return false;
              event.clipboardData.setData("text/plain", view.state.doc.textBetween($from.pos, $to.pos));
              event.preventDefault();
              return true;
            }
            return false;
          },
          cut: (view, event) => {
            const { $from, $to } = view.state.selection;
            if ($from.parent.type.name === "codeBlock" && $from.sameParent($to)) {
              if (!event.clipboardData) return false;
              event.clipboardData.setData("text/plain", view.state.doc.textBetween($from.pos, $to.pos));
              event.preventDefault();
              view.dispatch(view.state.tr.deleteSelection());
              return true;
            }
            return false;
          },
        },
      },
      content: initialContent ?? "",
      onUpdate: ({ editor: e }) => {
        const md = getMarkdownFromEditor(e);
        saveContent(md);
        setEditorMarkdown(md);
        if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
        headingsDebounceRef.current = setTimeout(() => {
          setHeadingsRef.current(extractHeadings(e));
        }, 300);
      },
      onCreate: ({ editor: e }) => {
        setHeadingsRef.current(extractHeadings(e));
        setEditorMarkdown(getMarkdownFromEditor(e));
        // 引用ブロックのマークダウン出力で継続行に > を付加しない（lazy blockquote）
        const bqExt = e.extensionManager.extensions.find((ext) => ext.name === "blockquote");
        if (bqExt?.storage?.markdown) {
          bqExt.storage.markdown.serialize = (state: any, node: any) => {
            state.wrapBlock("> ", null, node, () => state.renderContent(node));
          };
        }
      },
      immediatelyRender: false,
    },
    [initialContent]
  );

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
    };
  }, []);

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

  // ファイル変更検知
  useEffect(() => {
    if (!editor || !markDirty) return;
    const handler = () => markDirty();
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, markDirty]);

  // H-03: 未保存変更の beforeunload 警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const {
    copied, fileInputRef, handleClear, handleFileSelected,
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

  // VS Code 拡張からの外部コンテンツ更新（メニュー Undo/Redo など）
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!editor || editor.isDestroyed) return;
      const currentMd = getMarkdownFromEditor(editor);
      if (content === currentMd) return;
      // emitUpdate=false でループを防止（onUpdate → saveContent → contentChanged を抑制）
      editor.commands.setContent(content, { emitUpdate: false });
      setHeadingsRef.current(extractHeadings(editor));
      setEditorMarkdown(getMarkdownFromEditor(editor));
    };
    window.addEventListener('vscode-set-content', handler);
    return () => window.removeEventListener('vscode-set-content', handler);
  }, [editor]);

  // マージモードが閉じたときにデコレーションをクリア
  useEffect(() => {
    if (!inlineMergeOpen && editor) {
      editor.commands.clearDiffHighlight();
    }
  }, [inlineMergeOpen, editor]);

  // 比較モード変更を外部に通知（VS Code 拡張用）
  useEffect(() => {
    onCompareModeChange?.(inlineMergeOpen);
  }, [inlineMergeOpen, onCompareModeChange]);

  // VS Code 拡張から比較ファイルを読み込む
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      setCompareFileContent(content);
      if (!inlineMergeOpen) {
        if (!sourceMode && editor) {
          setEditorMarkdown(getMarkdownFromEditor(editor));
        }
        setInlineMergeOpen(true);
      }
    };
    window.addEventListener('vscode-load-compare-file', handler);
    return () => window.removeEventListener('vscode-load-compare-file', handler);
  }, [editor, sourceMode, inlineMergeOpen]);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(isMd ? 600 : isMobile ? 350 : 450);

  useEffect(() => {
    const update = () => {
      if (!editorContainerRef.current) return;
      const top = editorContainerRef.current.getBoundingClientRect().top;
      const padding = isMobile ? 16 : 24;
      setEditorHeight(Math.max(Math.floor(window.innerHeight - top - padding), 200));
    };
    update();
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", update);
    };
  }, [isMobile]);

  const handleInsertTemplate = useCallback((template: MarkdownTemplate) => {
    if (sourceMode) {
      appendToSource(template.content);
      return;
    }
    if (!editor) return;
    editor.chain().focus().insertContent(template.content).run();
  }, [editor, sourceMode, appendToSource]);

  const handleMerge = useCallback(() => {
    if (inlineMergeOpen) {
      setInlineMergeOpen(false);
      setLiveMessage(t("switchedToNormal"));
    } else {
      if (!isLg) return; // xs/sm/md では比較モードを無効化
      if (outlineOpen) handleToggleOutline(); // アウトラインを閉じる
      if (!sourceMode && editor) {
        setEditorMarkdown(getMarkdownFromEditor(editor));
      }
      setInlineMergeOpen(true);
      setLiveMessage(t("switchedToCompare"));
    }
  }, [sourceMode, editor, inlineMergeOpen, isLg, outlineOpen, handleToggleOutline, t, setLiveMessage]);

  // 画面が小さくなったら比較モードを自動で閉じる
  useEffect(() => {
    if (!isLg && inlineMergeOpen) {
      setInlineMergeOpen(false);
    }
  }, [isLg, inlineMergeOpen]);

  // PlantUML/Mermaid 編集中はMarkdownツールバーを無効化
  const isInDiagramBlock = !!plantUmlFloating;

  /** コードブロック・テーブルの折りたたみを一括トグル */
  const handleToggleAllBlocks = useCallback(() => {
    if (!editor) return;
    let anyExpanded = false;
    editor.state.doc.descendants((node) => {
      if ((node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") && !node.attrs.collapsed) {
        anyExpanded = true;
        return false;
      }
    });
    const collapsed = anyExpanded;
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed });
      }
    });
    editor.view.dispatch(tr);
  }, [editor]);

  /** Mermaid/PlantUML ブロックのコード欄を一括トグル */
  const handleToggleDiagramCode = useCallback(() => {
    if (!editor) return;
    let anyExpanded = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") {
        const lang = (node.attrs.language || "").toLowerCase();
        if ((lang === "mermaid" || lang === "plantuml") && !node.attrs.codeCollapsed) {
          anyExpanded = true;
          return false;
        }
      }
    });
    const codeCollapsed = anyExpanded;
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") {
        const lang = (node.attrs.language || "").toLowerCase();
        if (lang === "mermaid" || lang === "plantuml") {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, codeCollapsed });
        }
      }
    });
    editor.view.dispatch(tr);
  }, [editor]);

  // ファイル操作ショートカット (Ctrl/Cmd+S, Ctrl/Cmd+O)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (key === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSaveFile, handleOpenFile]);

  // ツールバー操作のキーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "i") { e.preventDefault(); handleImage(); }
      else if (key === "r") {
        e.preventDefault();
        if (sourceMode) { appendToSource("\n---\n"); } else { editor?.chain().focus().setHorizontalRule().run(); }
      }
      else if (key === "t") {
        e.preventDefault();
        if (sourceMode) { appendToSource("\n| Header | Header | Header |\n| ------ | ------ | ------ |\n|        |        |        |\n|        |        |        |\n"); }
        else { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }
      }
      else if (key === "d") { e.preventDefault(); setDiagramAnchorEl(document.querySelector<HTMLElement>("[aria-label=\"" + t("insertDiagram") + "\"]")); }
      else if (key === "p") { e.preventDefault(); setTemplateAnchorEl(document.querySelector<HTMLElement>("[aria-label=\"" + t("templates") + "\"]")); }
      else if (key === "s") { e.preventDefault(); sourceMode ? handleSwitchToWysiwyg() : handleSwitchToSource(); }
      else if (key === "m") { e.preventDefault(); handleMerge(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, sourceMode, appendToSource, t, handleImage, handleSwitchToWysiwyg, handleSwitchToSource, handleMerge]);

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
        onCopy={handleCopy}
        onDownload={handleDownload}
        onImport={() => fileInputRef.current?.click()}
        onClear={handleClear}
        copied={copied}
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
            {outlineOpen && isLg && (
              <OutlinePanel
                outlineWidth={outlineWidth}
                setOutlineWidth={setOutlineWidth}
                editorHeight={editorHeight}
                headings={headings}
                foldedIndices={foldedIndices}
                hiddenByFold={hiddenByFold}
                foldAll={foldAll}
                unfoldAll={unfoldAll}
                toggleFold={toggleFold}
                handleOutlineClick={handleOutlineClick}
                handleOutlineResizeStart={handleOutlineResizeStart}
                onHeadingDragEnd={handleHeadingDragEnd}
                onOutlineDelete={handleOutlineDelete}
                t={t}
              />
            )}
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
        {/* Outline panel (lg 以上のみ表示) */}
        {outlineOpen && isLg && (
          <OutlinePanel
            outlineWidth={outlineWidth}
            setOutlineWidth={setOutlineWidth}
            editorHeight={editorHeight}
            headings={headings}
            foldedIndices={foldedIndices}
            hiddenByFold={hiddenByFold}
            foldAll={foldAll}
            unfoldAll={unfoldAll}
            toggleFold={toggleFold}
            handleOutlineClick={handleOutlineClick}
            handleOutlineResizeStart={handleOutlineResizeStart}
            onHeadingDragEnd={handleHeadingDragEnd}
            onOutlineDelete={handleOutlineDelete}
            t={t}
          />
        )}

        {/* Editor */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
      {sourceMode ? (
        <Paper
          variant="outlined"
          sx={{
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            maxHeight: editorHeight,
            overflow: "auto",
          }}
        >
          <Box sx={{ display: "flex", minHeight: "100%" }}>
            <Box
              component="pre"
              sx={{
                width: "auto",
                minWidth: "3ch",
                py: 2,
                px: 1,
                m: 0,
                textAlign: "right",
                whiteSpace: "pre",
                fontFamily: "monospace",
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                color: alpha(theme.palette.text.secondary, 0.6),
                userSelect: "none",
                overflow: "hidden",
                boxSizing: "border-box",
                flexShrink: 0,
              }}
            >
              {Array.from({ length: (sourceText || "").split("\n").length || 1 }, (_, i) => i + 1).join("\n")}
            </Box>
            <Box
              component="textarea"
              aria-label={t("sourceEditor")}
              value={sourceText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleSourceChange(e.target.value)
              }
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: editorHeight - 36,
                py: 2,
                pr: 2,
                pl: 1,
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "monospace",
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                color: theme.palette.text.primary,
                bgcolor: "transparent",
                boxSizing: "border-box",
              }}
            />
          </Box>
        </Paper>
      ) : (
        <Box ref={editorWrapperRef} sx={{ position: "relative" }}>
        <Paper
          id="md-editor-content"
          variant="outlined"
          sx={{
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            overflow: "hidden",
            bgcolor: theme.palette.mode === "dark"
              ? (settings.darkBgColor || undefined)
              : (settings.lightBgColor || (settings.editorBg === "grey" ? "grey.50" : "background.paper")),
            "& .tiptap": {
              minHeight: editorHeight - 36,
              maxHeight: editorHeight - 4,
              overflowY: "auto",
              py: 2,
              pr: 2,
              pl: 5,
              outline: "none",
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              color: theme.palette.mode === "dark"
                ? (settings.darkTextColor || theme.palette.text.primary)
                : (settings.lightTextColor || theme.palette.text.primary),
              "& .heading-folded::after": {
                content: "' ...'",
                fontSize: "0.75rem",
                color: theme.palette.text.disabled,
                fontWeight: 400,
                fontStyle: "italic",
              },
              "& h1, & h2, & h3, & h4, & h5": {
                position: "relative",
                "&::before": {
                  position: "absolute",
                  right: "calc(100% + 8px)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  bgcolor: theme.palette.action.hover,
                  color: theme.palette.text.secondary,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  opacity: 0,
                  transition: "opacity 0.15s",
                },
                "&:hover::before": {
                  opacity: 1,
                },
              },
              "& h1": {
                fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
                "&::before": { content: "'H1'" },
              },
              "& h2": {
                fontSize: "1.5em", fontWeight: 600, mt: 1.5, mb: 1,
                "&::before": { content: "'H2'" },
              },
              "& h3": {
                fontSize: "1.25em", fontWeight: 600, mt: 1, mb: 0.5,
                "&::before": { content: "'H3'" },
              },
              "& h4": {
                fontSize: "1.1em", fontWeight: 600, mt: 1, mb: 0.5,
                "&::before": { content: "'H4'" },
              },
              "& h5": {
                fontSize: "1em", fontWeight: 600, mt: 0.75, mb: 0.5,
                "&::before": { content: "'H5'" },
              },
              "& > p": {
                position: "relative",
                "&::before": {
                  content: "'P'",
                  position: "absolute",
                  right: "calc(100% + 8px)",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  bgcolor: theme.palette.action.hover,
                  color: theme.palette.text.secondary,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  opacity: 0,
                  transition: "opacity 0.15s",
                },
                "&:hover::before": {
                  opacity: 1,
                },
              },
              "& p": { mb: 1 },
              "& > blockquote > p": {
                position: "relative",
                "&::before": {
                  content: "'Quote'",
                  position: "absolute",
                  right: "calc(100% + 30px)",
                  top: 2,
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  bgcolor: theme.palette.action.hover,
                  color: theme.palette.text.secondary,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  opacity: 0,
                  transition: "opacity 0.15s",
                  "&:hover": { bgcolor: theme.palette.action.selected },
                },
                "&:hover::before": { opacity: 1 },
              },
              "& ul, & ol": { pl: 3, mb: 1 },
              "& li": {
                mb: 0.25,
                position: "relative",
                "&::before": {
                  position: "absolute",
                  right: "calc(100% + 32px)",
                  top: 2,
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  bgcolor: theme.palette.action.hover,
                  color: theme.palette.text.secondary,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  opacity: 0,
                  transition: "opacity 0.15s",
                  "&:hover": { bgcolor: theme.palette.action.selected },
                },
                "&:hover::before": { opacity: 1 },
              },
              "& > ul:not([data-type='taskList']) > li": {
                "&::before": { content: "'UL'" },
              },
              "& > ol > li": {
                "&::before": { content: "'OL'" },
              },
              "& > ul[data-type='taskList'] > li": {
                "&::before": { content: "'Task'", right: "calc(100% + 8px)" },
              },
              "& code": {
                bgcolor: theme.palette.action.hover,
                color: theme.palette.mode === "dark" ? theme.palette.grey[300] : theme.palette.error.main,
                px: 0.5,
                py: 0.25,
                borderRadius: 0.5,
                fontFamily: "monospace",
                fontSize: "0.875em",
              },
              "& pre": {
                bgcolor: theme.palette.mode === "dark" ? theme.palette.grey[900] : theme.palette.grey[100],
                border: 1,
                borderColor: theme.palette.mode === "dark" ? theme.palette.action.hover : "transparent",
                borderRadius: 1,
                p: 2,
                my: 1,
                overflow: "auto",
                "& code": { bgcolor: "transparent", color: theme.palette.mode === "dark" ? theme.palette.grey[300] : "inherit", p: 0, borderRadius: 0 },
              },
              "& blockquote": {
                borderLeft: `3px solid ${theme.palette.divider}`,
                pl: 2,
                ml: 0,
                my: 1,
                color: theme.palette.text.secondary,
              },
              "& table": {
                borderCollapse: "collapse",
                width: settings.tableWidth,
                "& th, & td": {
                  border: `1px solid ${theme.palette.divider}`,
                  px: 1,
                  py: 0.5,
                  textAlign: "left",
                  minWidth: 80,
                  fontSize: "inherit",
                  lineHeight: "inherit",
                },
                "& th": {
                  bgcolor: theme.palette.action.hover,
                  fontWeight: 600,
                },
                "& .selectedCell": {
                  bgcolor: theme.palette.action.selected,
                },
              },
              "& img": {
                maxWidth: "100%",
                height: "auto",
                borderRadius: 1,
                my: 1,
              },
              "& ul[data-type='taskList']": {
                listStyle: "none",
                pl: 0,
                "& li": {
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 0.25,
                  "& label": {
                    display: "flex",
                    alignItems: "center",
                    "& input[type='checkbox']": {
                      width: settings.fontSize - 2,
                      height: settings.fontSize - 2,
                      cursor: "pointer",
                      accentColor: theme.palette.primary.main,
                    },
                  },
                  "& > div": {
                    flex: 1,
                    "& p": { my: 1 },
                  },
                },
              },
              "& a": {
                color: theme.palette.primary.main,
                textDecoration: "underline",
                position: "relative",
                cursor: "pointer",
              },
              "& a:hover::after": {
                content: "attr(href)",
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: "4px",
                backgroundColor: theme.palette.grey[800],
                color: theme.palette.common.white,
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                whiteSpace: "nowrap",
                maxWidth: "400px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                zIndex: 1000,
                pointerEvents: "none",
              },
              "& hr": {
                border: "none",
                borderTop: `1px solid ${theme.palette.divider}`,
                my: 2,
              },
              "& p.is-editor-empty:first-of-type::before": {
                content: "attr(data-placeholder)",
                color: theme.palette.text.disabled,
                float: "left",
                height: 0,
                pointerEvents: "none",
              },
              "& .search-match": {
                bgcolor: alpha(theme.palette.warning.light, theme.palette.mode === "dark" ? 0.3 : 0.5),
                borderRadius: "2px",
              },
              "& .search-match-current": {
                bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.5 : 0.4),
                borderRadius: "2px",
                outline: `2px solid ${theme.palette.primary.main}`,
              },
            },
          }}
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
