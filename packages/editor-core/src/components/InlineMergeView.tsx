import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Divider,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { getBaseExtensions } from "../editorExtensions";
import { useMergeDiff } from "../hooks/useMergeDiff";
import { useCodeBlockAutoCollapse } from "../hooks/useCodeBlockAutoCollapse";
import { useDiffBackground } from "../hooks/useDiffBackground";
import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { useScrollSync } from "../hooks/useScrollSync";
import { useEditorSettingsContext } from "../useEditorSettings";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { MergeRightBubbleMenu } from "./MergeRightBubbleMenu";
import { RightEditorBlockMenu } from "./RightEditorBlockMenu";
import { getMarkdownFromEditor } from "../types";
import { preserveBlankLines } from "../utils/sanitizeMarkdown";
import { computeInlineDiff, type DiffLine, type DiffResult, type InlineSegment } from "../utils/diffEngine";

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

  const isRightEditorUpdate = useRef(false);
  const isProgrammaticUpdate = useRef(false);
  const [, setRightMeta] = useState<FileMetadata>(DEFAULT_METADATA);
  const hoverSetterRef = useRef<((v: number | null) => void) | null>(null);
  const handleHoverLine = useCallback((idx: number | null) => {
    hoverSetterRef.current?.(idx);
  }, []);
  const [rightHeadingMenu, setRightHeadingMenu] = useState<{
    anchorEl: HTMLElement; pos: number; currentLevel: number;
  } | null>(null);

  // Right tiptap editor (for WYSIWYG mode)
  const rightEditor = useEditor({
    extensions: getBaseExtensions(),
    editorProps: {
      handleDOMEvents: {
        click: (_view, event) => {
          const target = event.target as HTMLElement;
          const headingEl = target.closest("h1, h2, h3, h4, h5") as HTMLElement | null;
          let blockEl: HTMLElement | null = headingEl;
          let level = 0;
          if (headingEl) {
            level = parseInt(headingEl.tagName.substring(1));
          } else {
            const candidates = ["li", "p", "blockquote"] as const;
            for (const sel of candidates) {
              const el = target.closest(sel) as HTMLElement | null;
              if (el) {
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
            const posTarget = blockEl.tagName.toLowerCase() === "blockquote"
              ? (blockEl.querySelector("p") ?? blockEl)
              : blockEl;
            const pos = _view.posAtDOM(posTarget, 0);
            setRightHeadingMenu({ anchorEl: blockEl, pos, currentLevel: level });
            return true;
          }
          return false;
        },
      },
    },
    content: "",
    onUpdate: ({ editor: e }) => {
      if (isProgrammaticUpdate.current) {
        isProgrammaticUpdate.current = false;
        return;
      }
      isRightEditorUpdate.current = true;
      // コードブロック内の HTML エンティティを復元
      const md = getMarkdownFromEditor(e).replace(
        /(^```[^\n]*\n)([\s\S]*?)(^```)/gm,
        (_m, open, body, close) =>
          open + body.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&") + close,
      );
      setRightText(md);
    },
    immediatelyRender: false,
  });

  // editorContent -> leftText sync
  useEffect(() => {
    setLeftText(editorContent);
  }, [editorContent, setLeftText]);

  // rightText -> right tiptap editor sync (external changes only, e.g. file load)
  useEffect(() => {
    if (isRightEditorUpdate.current) {
      isRightEditorUpdate.current = false;
      return;
    }
    if (rightEditor && !sourceMode) {
      isProgrammaticUpdate.current = true;
      rightEditor.commands.setContent(preserveBlankLines(rightText));
      isProgrammaticUpdate.current = false;
    }
  }, [rightText, rightEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    if (prevSourceMode.current && !sourceMode && rightEditor) {
      isProgrammaticUpdate.current = true;
      rightEditor.commands.setContent(preserveBlankLines(rightText));
      isProgrammaticUpdate.current = false;
    }
    prevSourceMode.current = sourceMode;
  }, [sourceMode, rightEditor, rightText]);

  useDiffHighlight(sourceMode, leftEditor, rightEditor);

  useCodeBlockAutoCollapse(sourceMode, leftEditor, rightEditor);

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
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
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

      {/* Right editor heading/block type popover */}
      <RightEditorBlockMenu
        headingMenu={rightHeadingMenu}
        onClose={() => setRightHeadingMenu(null)}
        editor={rightEditor}
        t={t}
      />

      {/* BubbleMenu for right editor (text formatting) */}
      {rightEditor && (
        <MergeRightBubbleMenu
          editor={rightEditor}
          sourceMode={sourceMode}
          t={t}
        />
      )}

    </Box>
  );
}
