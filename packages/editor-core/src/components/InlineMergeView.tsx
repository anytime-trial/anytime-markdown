import {
  Box,
  Divider,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FILE_DROP_OVERLAY_COLOR, getEditorBg } from "../constants/colors";
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
  leftEditor?: Editor | null;
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
  leftEditor,
  editorContent,
  sourceMode,
  editorHeight,
  t,
  leftFrontmatter,
  onLeftFrontmatterChange,
  onUndoRedoReady,
  onLeftTextChange,
  externalRightContent,
  onExternalRightContentConsumed,
  onRightFileOpsReady,
  children,
}: InlineMergeViewProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const {
    rightText,
    setLeftText,
    setRightText,
    diffResult,
    mergeBlock,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useMergeDiff(onLeftTextChange);

  // Expose undo/redo to parent
  useEffect(() => {
    onUndoRedoReady?.({ undo, redo, canUndo, canRedo });
  }, [onUndoRedoReady, undo, redo, canUndo, canRedo]);

  // 外部から渡された比較ファイル内容を右パネルに反映（1回限り）
  useEffect(() => {
    if (externalRightContent != null) {
      setRightText(externalRightContent);
      onExternalRightContentConsumed?.();
    }
  }, [externalRightContent, setRightText, onExternalRightContentConsumed]);

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const rightTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRightRef = useRef<HTMLInputElement>(null);

  // 右パネルのファイル操作を親に公開
  useEffect(() => {
    onRightFileOpsReady?.({
      loadFile: () => fileInputRightRef.current?.click(),
      exportFile: () => {
        const n = new Date();
        const ts = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}_${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
        downloadText(rightText, `document_right_${ts}.md`);
      },
    });
  }, [onRightFileOpsReady, rightText]);

  // Ctrl+S で右パネル内容も保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        window.dispatchEvent(new CustomEvent('vscode-save-compare-file', { detail: rightText }));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [rightText]);

  const [, setRightMeta] = useState<FileMetadata>(DEFAULT_METADATA);
  const hoverSetterRef = useRef<((v: number | null) => void) | null>(null);
  const handleHoverLine = useCallback((idx: number | null) => {
    hoverSetterRef.current?.(idx);
  }, []);
  const [rightDragOver, setRightDragOver] = useState(false);

  // Right tiptap editor (for WYSIWYG mode) – readonly (cursor visible)
  const rightEditor = useEditor({
    extensions: [...getBaseExtensions({ disableComments: true }), CustomHardBreak, ReviewModeExtension],
    content: "",
    immediatelyRender: false,
    editorProps: {
      handleDOMEvents: {
        // Skip ProseMirror drop handling; let event bubble to parent Box handler
        drop: () => true,
      },
    },
  });

  // Enable transaction filter to block edits while keeping cursor visible
  useEffect(() => {
    if (rightEditor) {
      reviewModeStorage(rightEditor).enabled = true;
    }
  }, [rightEditor]);

  // editorContent -> leftText sync
  useEffect(() => {
    setLeftText(editorContent);
  }, [editorContent, setLeftText]);

  // rightText -> right tiptap editor sync
  useEffect(() => {
    if (rightEditor && !sourceMode) {
      // React レンダリング中の flushSync 競合を回避するため次フレームに遅延
      const id = requestAnimationFrame(() => {
        if (rightEditor.isDestroyed) return;
        reviewModeStorage(rightEditor).enabled = false;
        applyMarkdownToEditor(rightEditor, rightText);
        reviewModeStorage(rightEditor).enabled = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [rightText, rightEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    let id: number | undefined;
    if (prevSourceMode.current && !sourceMode && rightEditor) {
      id = requestAnimationFrame(() => {
        if (rightEditor.isDestroyed) return;
        reviewModeStorage(rightEditor).enabled = false;
        applyMarkdownToEditor(rightEditor, rightText);
        reviewModeStorage(rightEditor).enabled = true;
      });
    }
    prevSourceMode.current = sourceMode;
    return () => { if (id !== undefined) cancelAnimationFrame(id); };
  }, [sourceMode, rightEditor, rightText]);

  // 左エディタのブロック展開/折りたたみ状態を右エディタに同期
  useEffect(() => {
    if (!leftEditor || !rightEditor || sourceMode) return;
    let rafId: number | undefined;
    const syncCollapsed = () => {
      if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      const targetTypes = new Set(["codeBlock", "table", "image"]);
      // 左エディタの collapsed / codeCollapsed 状態を収集
      const leftStates: { type: string; index: number; collapsed?: boolean; codeCollapsed?: boolean }[] = [];
      const counters: Record<string, number> = {};
      leftEditor.state.doc.descendants((node) => {
        if (targetTypes.has(node.type.name)) {
          const key = node.type.name;
          counters[key] = (counters[key] || 0) + 1;
          leftStates.push({
            type: key,
            index: counters[key] - 1,
            collapsed: node.attrs.collapsed,
            codeCollapsed: node.attrs.codeCollapsed,
          });
        }
      });
      // rAF 内でトランザクションを作成して適用（stale state 回避）
      rafId = requestAnimationFrame(() => {
        if (rightEditor.isDestroyed) return;
        const rightCounters: Record<string, number> = {};
        let changed = false;
        const tr = rightEditor.state.tr;
        rightEditor.state.doc.descendants((node, pos) => {
          if (targetTypes.has(node.type.name)) {
            const key = node.type.name;
            rightCounters[key] = (rightCounters[key] || 0) + 1;
            const idx = rightCounters[key] - 1;
            const leftState = leftStates.find(s => s.type === key && s.index === idx);
            if (leftState) {
              let nodeChanged = false;
              const newAttrs: Record<string, unknown> = { ...node.attrs };
              if (leftState.collapsed !== undefined && node.attrs.collapsed !== leftState.collapsed) {
                newAttrs.collapsed = leftState.collapsed;
                nodeChanged = true;
              }
              if (leftState.codeCollapsed !== undefined && node.attrs.codeCollapsed !== leftState.codeCollapsed) {
                newAttrs.codeCollapsed = leftState.codeCollapsed;
                nodeChanged = true;
              }
              if (nodeChanged) {
                tr.setNodeMarkup(pos, undefined, newAttrs);
                changed = true;
              }
            }
          }
        });
        if (changed) {
          reviewModeStorage(rightEditor).enabled = false;
          rightEditor.view.dispatch(tr);
          reviewModeStorage(rightEditor).enabled = true;
        }
      });
    };
    leftEditor.on("update", syncCollapsed);
    return () => {
      leftEditor.off("update", syncCollapsed);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [leftEditor, rightEditor, sourceMode]);

  useDiffHighlight(sourceMode, leftEditor, rightEditor);

  useScrollSync(leftContainerRef, rightScrollRef);

  const rightFrontmatter = useMemo(() => preprocessMarkdown(rightText).frontmatter, [rightText]);

  const { leftBgGradient, rightBgGradient } = useDiffBackground(diffResult, sourceMode);

  const loadFile = (setter: (text: string) => void, metaSetter: (meta: FileMetadata) => void) => (file: File) => {
    readFileAsText(file).then(({ text, encoding, lineEnding }) => {
      metaSetter({ encoding, lineEnding });
      setter(text);
    });
  };

  // モジュールレベルストアに左右エディタを登録（NodeView ポータルからアクセス可能にする）
  useEffect(() => {
    setMergeEditors({ leftEditor: leftEditor ?? null, rightEditor: rightEditor ?? null });
    return () => setMergeEditors(null);
  }, [leftEditor, rightEditor]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: editorHeight, minWidth: 0, overflow: "hidden" }}>
      {/* Hidden file input for right panel */}
      <input
        ref={fileInputRightRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile(setRightText, setRightMeta)(f);
          e.target.value = "";
        }}
      />


      {/* Frontmatter comparison row */}
      {!sourceMode && (leftFrontmatter != null || rightFrontmatter != null) && (
        <Box sx={{ display: "flex", gap: 0, flexShrink: 0, alignItems: "stretch" }}>
          <Box sx={{ flex: 1, minWidth: 0, px: 1, pt: 1 }}>
            {leftFrontmatter != null ? (
              <FrontmatterBlock
                frontmatter={leftFrontmatter}
                onChange={onLeftFrontmatterChange ?? (() => {})}
                readOnly
                t={t}
              />
            ) : (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, mb: 1, opacity: 0.4, p: 1, height: "calc(100% - 8px)", boxSizing: "border-box" }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.disabled", fontSize: "0.75rem" }}>
                  No Frontmatter
                </Typography>
              </Box>
            )}
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: 1, minWidth: 0, px: 1, pt: 1 }}>
            {rightFrontmatter != null ? (
              <FrontmatterBlock
                frontmatter={rightFrontmatter}
                onChange={() => {}}
                readOnly
                t={t}
              />
            ) : (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, mb: 1, opacity: 0.4, p: 1, height: "calc(100% - 8px)", boxSizing: "border-box" }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.disabled", fontSize: "0.75rem" }}>
                  No Frontmatter
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Content area: left = editor (children), right = editor */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: editor (children) */}
        <Box
          ref={leftContainerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {children(leftBgGradient, diffResult?.leftLines, mergeBlock, handleHoverLine)}
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Right: editor + DiffMap */}
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
            // Box 外に出たときだけ解除（子要素間の移動では解除しない）
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
              loadFile(setRightText, setRightMeta)(file);
            }
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <MergeEditorPanel
              sourceMode={sourceMode}
              sourceText={rightText}
              onSourceChange={setRightText}
              textareaRef={rightTextareaRef}
              autoResize
              scrollRef={rightScrollRef}
              bgGradient={rightBgGradient}
              editor={rightEditor}
              diffLines={diffResult?.rightLines}
              side="right"
              readOnly
              onMerge={mergeBlock}
              onHoverLine={handleHoverLine}
              paperSx={{ bgcolor: getEditorBg(isDark, settings) }}
            />
          </Box>
        </Box>
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
