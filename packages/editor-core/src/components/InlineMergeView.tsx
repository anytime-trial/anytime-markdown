import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  Box,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FILE_DROP_OVERLAY_COLOR, getDivider, getEditorBg, getTextDisabled } from "../constants/colors";
import { MERGE_INFO_FONT_SIZE } from "../constants/dimensions";
import { setMergeEditors } from "../contexts/MergeEditorsContext";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { ReviewModeExtension, reviewModeStorage } from "../extensions/reviewModeExtension";
import { useDiffBackground } from "../hooks/useDiffBackground";
import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { useMergeDiff } from "../hooks/useMergeDiff";
import { useScrollSync } from "../hooks/useScrollSync";
import { useEditorSettingsContext } from "../useEditorSettings";
import { type DiffLine } from "../utils/diffEngine";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { readFileAsText } from "../utils/fileReading";
import { preprocessMarkdown } from "../utils/frontmatterHelpers";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { LinePreviewPanel } from "./LinePreviewPanel";
import { MergeEditorPanel } from "./MergeEditorPanel";

export interface MergeUndoRedo {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface InlineMergeViewProps {
  rightEditor?: Editor | null;
  editorContent: string;
  sourceMode: boolean;
  editorHeight: number;
  t: (key: string) => string;
  leftFrontmatter?: string | null;
  onLeftFrontmatterChange?: (value: string | null) => void;
  onUndoRedoReady?: (ur: MergeUndoRedo) => void;
  onLeftTextChange?: (text: string) => void;
  externalRightContent?: string | null;
  onExternalRightContentConsumed?: () => void;
  onRightFileOpsReady?: (ops: { loadFile: () => void; exportFile: () => void }) => void;
  commentSlot?: React.ReactNode;
  children: (
    leftBgGradient: string,
    leftDiffLines?: DiffLine[],
    onMerge?: (blockId: number, direction: "left-to-right" | "right-to-left") => void,
    onHoverLine?: (lineIndex: number | null) => void,
  ) => React.ReactNode;
}

interface FileMetadata {
  encoding: string;
  lineEnding: string;
}

const DEFAULT_METADATA: FileMetadata = { encoding: "UTF-8", lineEnding: "LF" };

const SYNC_TARGET_TYPES = new Set(["codeBlock", "table", "image"]);

interface CollapsedState {
  type: string;
  index: number;
  collapsed?: boolean;
  codeCollapsed?: boolean;
}

/** Collect collapsed/codeCollapsed states from a ProseMirror doc */
function collectCollapsedStates(doc: ProseMirrorNode): CollapsedState[] {
  const states: CollapsedState[] = [];
  const counters: Record<string, number> = {};
  doc.descendants((node) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      states.push({
        type: key,
        index: counters[key] - 1,
        collapsed: node.attrs.collapsed,
        codeCollapsed: node.attrs.codeCollapsed,
      });
    }
  });
  return states;
}

/** Apply collected collapsed states to a target doc via transaction */
function applyCollapsedStates(
  doc: ProseMirrorNode,
  tr: Transaction,
  sourceStates: CollapsedState[],
): boolean {
  const counters: Record<string, number> = {};
  let changed = false;
  doc.descendants((node, pos) => {
    if (SYNC_TARGET_TYPES.has(node.type.name)) {
      const key = node.type.name;
      counters[key] = (counters[key] || 0) + 1;
      const idx = counters[key] - 1;
      const srcState = sourceStates.find(s => s.type === key && s.index === idx);
      if (!srcState) return;
      let nodeChanged = false;
      const newAttrs: Record<string, unknown> = { ...node.attrs };
      if (srcState.collapsed !== undefined && node.attrs.collapsed !== srcState.collapsed) {
        newAttrs.collapsed = srcState.collapsed;
        nodeChanged = true;
      }
      if (srcState.codeCollapsed !== undefined && node.attrs.codeCollapsed !== srcState.codeCollapsed) {
        newAttrs.codeCollapsed = srcState.codeCollapsed;
        nodeChanged = true;
      }
      if (nodeChanged) {
        tr.setNodeMarkup(pos, undefined, newAttrs);
        changed = true;
      }
    }
  });
  return changed;
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function InlineMergeView({
  rightEditor,
  editorContent,
  sourceMode,
  editorHeight: _editorHeight,
  t,
  leftFrontmatter,
  onLeftFrontmatterChange,
  onUndoRedoReady,
  onLeftTextChange,
  externalRightContent,
  onExternalRightContentConsumed,
  onRightFileOpsReady,
  commentSlot,
  children,
}: Readonly<InlineMergeViewProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const {
    compareText,
    setEditText,
    setCompareText,
    diffResult,
    diffOptions,
    setDiffOptions,
    mergeBlock,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useMergeDiff(onLeftTextChange);

  // 画面上の左右とデータモデルの左右が逆なので direction を反転
  const flippedMergeBlock = useCallback(
    (blockId: number, direction: "left-to-right" | "right-to-left") => {
      const flipped = direction === "left-to-right" ? "right-to-left" : "left-to-right";
      mergeBlock(blockId, flipped);
    },
    [mergeBlock],
  );

  // Expose undo/redo to parent
  useEffect(() => {
    onUndoRedoReady?.({ undo, redo, canUndo, canRedo });
  }, [onUndoRedoReady, undo, redo, canUndo, canRedo]);

  // 外部から渡された比較ファイル内容を右パネルに反映（1回限り）
  useEffect(() => {
    if (externalRightContent != null) {
      setCompareText(externalRightContent);
      onExternalRightContentConsumed?.();
    }
  }, [externalRightContent, setCompareText, onExternalRightContentConsumed]);

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const compareTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRightRef = useRef<HTMLInputElement>(null);

  // 右パネルのファイル操作を親に公開
  useEffect(() => {
    onRightFileOpsReady?.({
      loadFile: () => fileInputRightRef.current?.click(),
      exportFile: () => {
        const n = new Date();
        const ts = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}_${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
        downloadText(compareText, `document_right_${ts}.md`);
      },
    });
  }, [onRightFileOpsReady, compareText]);

  // Ctrl+S で右パネル内容も保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        globalThis.dispatchEvent(new CustomEvent('vscode-save-compare-file', { detail: compareText }));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [compareText]);

  const [, setRightMeta] = useState<FileMetadata>(DEFAULT_METADATA);
  const hoverSetterRef = useRef<((v: number | null) => void) | null>(null);
  const handleHoverLine = useCallback((idx: number | null) => {
    hoverSetterRef.current?.(idx);
  }, []);
  const [rightDragOver, setRightDragOver] = useState(false);

  // Right tiptap editor (for WYSIWYG mode) – readonly (cursor visible)
  const leftEditor = useEditor({
    extensions: [...getBaseExtensions({ disableComments: true, disableCheckboxToggle: true }), CustomHardBreak, ReviewModeExtension],
    content: "",
    immediatelyRender: false,
    editorProps: {
      handleDOMEvents: {
        // Skip ProseMirror drop handling; let event bubble to parent Box handler
        drop: () => true,
      },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        // チェックボックスのクリックをブロック
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  // Enable transaction filter to block edits while keeping cursor visible
  useEffect(() => {
    if (leftEditor) {
      reviewModeStorage(leftEditor).enabled = true;
    }
  }, [leftEditor]);

  // 左側エディタのチェックボックスクリックをキャプチャフェーズでブロック
  useEffect(() => {
    if (!leftEditor) return;
    const dom = leftEditor.view.dom;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    dom.addEventListener("click", handler, true);
    dom.addEventListener("change", handler, true);
    dom.addEventListener("mousedown", handler, true);
    return () => {
      dom.removeEventListener("click", handler, true);
      dom.removeEventListener("change", handler, true);
      dom.removeEventListener("mousedown", handler, true);
    };
  }, [leftEditor]);

  // editorContent -> leftText sync
  useEffect(() => {
    setEditText(editorContent);
  }, [editorContent, setEditText]);

  // compareText -> right tiptap editor sync
  useEffect(() => {
    if (leftEditor && !sourceMode) {
      // React レンダリング中の flushSync 競合を回避するため次フレームに遅延
      const id = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        reviewModeStorage(leftEditor).enabled = false;
        applyMarkdownToEditor(leftEditor, compareText);
        reviewModeStorage(leftEditor).enabled = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [compareText, leftEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    let id: number | undefined;
    if (prevSourceMode.current && !sourceMode && leftEditor) {
      id = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        reviewModeStorage(leftEditor).enabled = false;
        applyMarkdownToEditor(leftEditor, compareText);
        reviewModeStorage(leftEditor).enabled = true;
      });
    }
    prevSourceMode.current = sourceMode;
    return () => { if (id !== undefined) cancelAnimationFrame(id); };
  }, [sourceMode, leftEditor, compareText]);

  // 左エディタのブロック展開/折りたたみ状態を右エディタに同期
  useEffect(() => {
    if (!rightEditor || !leftEditor || sourceMode) return;
    let rafId: number | undefined;
    const syncCollapsed = () => {
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      const sourceStates = collectCollapsedStates(rightEditor.state.doc);
      rafId = requestAnimationFrame(() => {
        if (leftEditor.isDestroyed) return;
        const tr = leftEditor.state.tr;
        const changed = applyCollapsedStates(leftEditor.state.doc, tr, sourceStates);
        if (changed) {
          reviewModeStorage(leftEditor).enabled = false;
          leftEditor.view.dispatch(tr);
          reviewModeStorage(leftEditor).enabled = true;
        }
      });
    };
    rightEditor.on("update", syncCollapsed);
    return () => {
      rightEditor.off("update", syncCollapsed);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [rightEditor, leftEditor, sourceMode]);

  useDiffHighlight(sourceMode, rightEditor, leftEditor, diffOptions.semantic);

  useScrollSync(leftContainerRef, rightScrollRef);

  const rightFrontmatter = useMemo(() => preprocessMarkdown(compareText).frontmatter, [compareText]);

  const { leftBgGradient, rightBgGradient } = useDiffBackground(diffResult, sourceMode);

  const loadFile = (setter: (text: string) => void, metaSetter: (meta: FileMetadata) => void) => (file: File) => {
    readFileAsText(file).then(({ text, encoding, lineEnding }) => {
      metaSetter({ encoding, lineEnding });
      setter(text);
    });
  };

  // モジュールレベルストアに左右エディタを登録（NodeView ポータルからアクセス可能にする）
  useEffect(() => {
    setMergeEditors({ rightEditor: rightEditor ?? null, leftEditor: leftEditor ?? null });
    return () => setMergeEditors(null);
  }, [rightEditor, leftEditor]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      {/* Hidden file input for right panel */}
      <input
        ref={fileInputRightRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile(setCompareText, setRightMeta)(f);
          e.target.value = "";
        }}
      />


      {/* Frontmatter comparison row */}
      {!sourceMode && (leftFrontmatter != null || rightFrontmatter != null) && (
        <Box sx={{ display: "flex", gap: 0, flexShrink: 0, alignItems: "stretch" }}>
          <Box sx={{ flex: 1, minWidth: 0, px: 1, pt: 1 }}>
            {rightFrontmatter == null ? (
              <Box sx={{ border: 1, borderColor: getDivider(isDark), borderRadius: 1, mb: 1, opacity: 0.4, p: 1, height: "calc(100% - 8px)", boxSizing: "border-box" }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: getTextDisabled(isDark), fontSize: MERGE_INFO_FONT_SIZE }}>
                  No Frontmatter
                </Typography>
              </Box>
            ) : (
              <FrontmatterBlock
                frontmatter={rightFrontmatter}
                onChange={() => {}}
                readOnly
                t={t}
              />
            )}
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: 1, minWidth: 0, px: 1, pt: 1 }}>
            {leftFrontmatter == null ? (
              <Box sx={{ border: 1, borderColor: getDivider(isDark), borderRadius: 1, mb: 1, opacity: 0.4, p: 1, height: "calc(100% - 8px)", boxSizing: "border-box" }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: getTextDisabled(isDark), fontSize: MERGE_INFO_FONT_SIZE }}>
                  No Frontmatter
                </Typography>
              </Box>
            ) : (
              <FrontmatterBlock
                frontmatter={leftFrontmatter}
                onChange={onLeftFrontmatterChange ?? (() => {})}
                t={t}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Semantic diff toggle */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, py: 0.5, flexShrink: 0 }}>
        <Tooltip title={t("semanticDiff")}>
          <IconButton
            size="small"
            onClick={() => setDiffOptions((prev) => ({ ...prev, semantic: !prev.semantic }))}
            color={diffOptions.semantic ? "primary" : "default"}
            aria-label={t("semanticDiff")}
            aria-pressed={!!diffOptions.semantic}
            sx={{ p: 0.5 }}
          >
            <AccountTreeOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content area: left = compare (read-only), right = editor (children) */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: compare (read-only) + DiffMap */}
        <Box
          sx={{
            flex: 1, minWidth: 0, display: "flex", overflow: "hidden",
            position: "relative",
            ...(rightDragOver && {
              "&::after": { content: '""', position: "absolute", inset: 0, bgcolor: FILE_DROP_OVERLAY_COLOR, pointerEvents: "none", zIndex: 1 },
            }),
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRightDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRightDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setRightDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRightDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && (file.name.endsWith(".md") || file.name.endsWith(".markdown") || file.type.startsWith("text/"))) {
              loadFile(setCompareText, setRightMeta)(file);
            }
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <MergeEditorPanel
              sourceMode={sourceMode}
              sourceText={compareText}
              onSourceChange={setCompareText}
              textareaRef={compareTextareaRef}
              autoResize
              scrollRef={rightScrollRef}
              bgGradient={rightBgGradient}
              editor={leftEditor}
              diffLines={diffResult?.rightLines}
              side="left"
              readOnly
              hideScrollbar
              onMerge={flippedMergeBlock}
              onHoverLine={handleHoverLine}
              paperSx={{ bgcolor: getEditorBg(isDark, settings), '& input[type="checkbox"]': { pointerEvents: "none" } }}
            />
          </Box>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Right: editor (children) */}
        <Box
          ref={leftContainerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {children(leftBgGradient, diffResult?.leftLines, flippedMergeBlock, handleHoverLine)}
        </Box>
        {commentSlot}
      </Box>

      {/* Line preview: hovered line text with inline diff highlight (source mode only) */}
      <LinePreviewPanel
        diffResult={diffResult}
        sourceMode={sourceMode}
        hoverSetterRef={hoverSetterRef}
      />


    </Box>
  );
}
