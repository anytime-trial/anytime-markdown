import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Divider,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { ReviewModeExtension, reviewModeStorage } from "../extensions/reviewModeExtension";
import { useMergeDiff } from "../hooks/useMergeDiff";
import { useDiffBackground } from "../hooks/useDiffBackground";
import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { useScrollSync } from "../hooks/useScrollSync";
import { useEditorSettingsContext } from "../useEditorSettings";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { computeInlineDiff, type DiffLine, type DiffResult, type InlineSegment } from "../utils/diffEngine";
import { setMergeEditors } from "../contexts/MergeEditorsContext";

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

function detectEncoding(buffer: ArrayBuffer): { encoding: string; bomLength: number } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "UTF-8 (BOM)", bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "UTF-16 LE", bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "UTF-16 BE", bomLength: 2 };
  }
  return { encoding: "UTF-8", bomLength: 0 };
}

function detectLineEnding(text: string): string {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const cr = (text.match(/\r(?!\n)/g) || []).length;
  if (crlf === 0 && lf === 0 && cr === 0) return "N/A";
  if (crlf > 0 && lf === 0 && cr === 0) return "CRLF";
  if (lf > 0 && crlf === 0 && cr === 0) return "LF";
  if (cr > 0 && crlf === 0 && lf === 0) return "CR";
  return "Mixed";
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

/** ホバー行プレビュー（独自 state で再レンダリングを局所化） */
const LinePreviewPanel = React.memo(function LinePreviewPanel({
  diffResult,
  sourceMode,
  hoverSetterRef,
}: {
  diffResult: DiffResult | null;
  sourceMode: boolean;
  hoverSetterRef: React.MutableRefObject<((v: number | null) => void) | null>;
}) {
  const theme = useTheme();
  const settings = useEditorSettingsContext();
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);
  const previewTopRef = useRef<HTMLDivElement>(null);
  const previewBottomRef = useRef<HTMLDivElement>(null);
  const isSyncingPreview = useRef(false);

  useEffect(() => {
    hoverSetterRef.current = setHoveredLineIdx;
    return () => { hoverSetterRef.current = null; };
  }, [hoverSetterRef]);

  if (!sourceMode || !diffResult) return null;

  const leftLine = hoveredLineIdx !== null ? diffResult.leftLines?.[hoveredLineIdx] : null;
  const rightLine = hoveredLineIdx !== null ? diffResult.rightLines?.[hoveredLineIdx] : null;
  const leftText = leftLine?.text ?? "";
  const rightText_ = rightLine?.text ?? "";
  const hasBoth = hoveredLineIdx !== null && leftText !== "" && rightText_ !== "" && leftText !== rightText_;
  const inlineDiff = hasBoth ? computeInlineDiff(leftText, rightText_) : null;

  const previewStyle: React.CSSProperties = {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 2,
    paddingBottom: 2,
    fontFamily: "monospace",
    fontSize: `${settings.fontSize + 4}px`,
    lineHeight: 1.4,
    whiteSpace: "pre",
    overflowX: "auto",
    overflowY: "hidden",
    color: theme.palette.text.primary,
  };

  const renderSegments = (segments: InlineSegment[], highlightType: "removed" | "added") =>
    segments.map((seg, i) => (
      <span
        key={i}
        style={
          seg.type === highlightType
            ? {
                backgroundColor: alpha(
                  highlightType === "removed"
                    ? theme.palette.error.main
                    : theme.palette.success.main,
                  0.35,
                ),
                textDecoration: highlightType === "removed" ? "line-through" : "underline",
                borderRadius: 2,
              }
            : undefined
        }
      >
        {seg.text}
      </span>
    ));

  const handlePreviewScroll = (source: React.UIEvent<HTMLDivElement>, targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (isSyncingPreview.current) return;
    isSyncingPreview.current = true;
    const target = targetRef.current;
    if (target) target.scrollLeft = source.currentTarget.scrollLeft;
    requestAnimationFrame(() => { isSyncingPreview.current = false; });
  };

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper", flexShrink: 0 }}>
      <div
        ref={previewTopRef}
        style={previewStyle}
        onScroll={(e) => handlePreviewScroll(e, previewBottomRef)}
      >
        {inlineDiff
          ? renderSegments(inlineDiff.oldSegments, "removed")
          : hoveredLineIdx !== null && leftText
            ? leftText
            : "\u00A0"}
      </div>
      <Divider />
      <div
        ref={previewBottomRef}
        style={previewStyle}
        onScroll={(e) => handlePreviewScroll(e, previewTopRef)}
      >
        {inlineDiff
          ? renderSegments(inlineDiff.newSegments, "added")
          : hoveredLineIdx !== null && rightText_
            ? rightText_
            : "\u00A0"}
      </div>
    </Box>
  );
});

export function InlineMergeView({
  leftEditor,
  editorContent,
  sourceMode,
  editorHeight,
  t,
  onUndoRedoReady,
  onLeftTextChange,
  externalRightContent,
  onExternalRightContentConsumed,
  onRightFileOpsReady,
  children,
}: InlineMergeViewProps) {
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
      requestAnimationFrame(() => {
        if (rightEditor.isDestroyed) return;
        reviewModeStorage(rightEditor).enabled = false;
        rightEditor.commands.setContent(preserveBlankLines(sanitizeMarkdown(rightText)));
        reviewModeStorage(rightEditor).enabled = true;
      });
    }
  }, [rightText, rightEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    if (prevSourceMode.current && !sourceMode && rightEditor) {
      requestAnimationFrame(() => {
        if (rightEditor.isDestroyed) return;
        reviewModeStorage(rightEditor).enabled = false;
        rightEditor.commands.setContent(preserveBlankLines(sanitizeMarkdown(rightText)));
        reviewModeStorage(rightEditor).enabled = true;
      });
    }
    prevSourceMode.current = sourceMode;
  }, [sourceMode, rightEditor, rightText]);

  // 左エディタのブロック展開/折りたたみ状態を右エディタに同期
  useEffect(() => {
    if (!leftEditor || !rightEditor || sourceMode) return;
    const syncCollapsed = () => {
      if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
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
      requestAnimationFrame(() => {
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
    };
  }, [leftEditor, rightEditor, sourceMode]);

  useDiffHighlight(sourceMode, leftEditor, rightEditor);

  useScrollSync(leftContainerRef, rightScrollRef);

  const { leftBgGradient, rightBgGradient } = useDiffBackground(diffResult, sourceMode);

  const loadFile = (setter: (text: string) => void, metaSetter: (meta: FileMetadata) => void) => (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) return;
      const buffer = reader.result;
      const { encoding, bomLength } = detectEncoding(buffer);
      let text: string;
      if (encoding.startsWith("UTF-16 LE")) {
        text = new TextDecoder("utf-16le").decode(buffer.slice(bomLength));
      } else if (encoding.startsWith("UTF-16 BE")) {
        text = new TextDecoder("utf-16be").decode(buffer.slice(bomLength));
      } else {
        text = new TextDecoder("utf-8").decode(buffer.slice(bomLength));
      }
      metaSetter({ encoding, lineEnding: detectLineEnding(text) });
      // ブラウザのtextareaはLFに正規化するため、diff比較のためにCRLF/CRもLFに統一
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      setter(normalized);
    };
    reader.readAsArrayBuffer(file);
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
              outline: "2px dashed",
              outlineColor: "primary.main",
              outlineOffset: -2,
              bgcolor: "action.hover",
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
          />
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
