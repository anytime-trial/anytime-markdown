import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Tooltip,
} from "@mui/material";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import Paper from "@mui/material/Paper";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import BorderColorIcon from "@mui/icons-material/BorderColor";
import CodeIcon from "@mui/icons-material/Code";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import { alpha, useTheme } from "@mui/material/styles";
import { useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { getBaseExtensions } from "../editorExtensions";
import { computeBlockDiff } from "../extensions/diffHighlight";
import { useMergeDiff } from "../hooks/useMergeDiff";
import { useEditorSettingsContext } from "../useEditorSettings";
import { MergeEditorPanel } from "./MergeEditorPanel";
import { getMarkdownFromEditor } from "../types";
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
  const theme = useTheme();
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

  const isSyncingScroll = useRef(false);
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
      rightEditor.commands.setContent(rightText);
      isProgrammaticUpdate.current = false;
    }
  }, [rightText, rightEditor, sourceMode]);

  // When switching from source -> WYSIWYG, populate right editor
  const prevSourceMode = useRef(sourceMode);
  useEffect(() => {
    if (prevSourceMode.current && !sourceMode && rightEditor) {
      isProgrammaticUpdate.current = true;
      rightEditor.commands.setContent(rightText);
      isProgrammaticUpdate.current = false;
    }
    prevSourceMode.current = sourceMode;
  }, [sourceMode, rightEditor, rightText]);

  // Block-level diff highlighting for WYSIWYG (preview) mode
  useEffect(() => {
    if (sourceMode) {
      // ソースモードではクリア（行単位ハイライトを使用）
      if (leftEditor && !leftEditor.isDestroyed) {
        leftEditor.commands.clearDiffHighlight();
      }
      if (rightEditor && !rightEditor.isDestroyed) {
        rightEditor.commands.clearDiffHighlight();
      }
      return;
    }
    if (!leftEditor || !rightEditor) return;

    const updateHighlights = () => {
      if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
      const { left, right } = computeBlockDiff(
        leftEditor.state.doc,
        rightEditor.state.doc,
      );
      requestAnimationFrame(() => {
        if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
        leftEditor.commands.setDiffHighlight(left, "left");
        rightEditor.commands.setDiffHighlight(right, "right");
      });
    };

    updateHighlights();
    leftEditor.on("update", updateHighlights);
    rightEditor.on("update", updateHighlights);

    return () => {
      leftEditor.off("update", updateHighlights);
      rightEditor.off("update", updateHighlights);
      if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      if (!rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
    };
  }, [sourceMode, leftEditor, rightEditor]);

  // マージプレビューモード時: mermaid/plantuml を常に折りたたむ
  useEffect(() => {
    if (sourceMode) return;
    const collapseIfNeeded = (ed: Editor) => {
      if (ed.isDestroyed) return;
      const { tr, doc } = ed.state;
      let modified = false;
      doc.descendants((node, pos) => {
        if (node.type.name === "codeBlock") {
          const lang = (node.attrs.language || "").toLowerCase();
          if ((lang === "mermaid" || lang === "plantuml") && !node.attrs.collapsed) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true });
            modified = true;
          }
        }
      });
      if (modified) ed.view.dispatch(tr);
    };

    const editors = [leftEditor, rightEditor].filter((e): e is Editor => !!e);
    // 初回折りたたみ
    for (const ed of editors) collapseIfNeeded(ed);

    // 展開操作されたら再折りたたみ
    const handlers = editors.map((ed) => {
      const handler = () => {
        requestAnimationFrame(() => collapseIfNeeded(ed));
      };
      ed.on("update", handler);
      return () => ed.off("update", handler);
    });

    return () => { for (const off of handlers) off(); };
  }, [sourceMode, leftEditor, rightEditor]);

  // Helper: find the first scrollable child element (BFS)
  const findScrollableChild = useCallback((container: HTMLElement): HTMLElement | null => {
    const queue: HTMLElement[] = [container];
    while (queue.length > 0) {
      const el = queue.shift();
      if (!el) continue;
      if (el.scrollHeight > el.clientHeight + 1) {
        const style = getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          return el;
        }
      }
      for (const child of Array.from(el.children)) {
        if (child instanceof HTMLElement) queue.push(child);
      }
    }
    return null;
  }, []);

  // Left -> Right scroll sync (capture phase)
  useEffect(() => {
    const container = leftContainerRef.current;
    if (!container) return;
    const handleScroll = (e: Event) => {
      if (isSyncingScroll.current) return;
      const target = e.target as HTMLElement;
      if (!target || !container.contains(target)) return;
      isSyncingScroll.current = true;
      requestAnimationFrame(() => {
        const right = rightScrollRef.current;
        if (right) {
          const maxLeft = target.scrollHeight - target.clientHeight;
          const ratio = maxLeft > 0 ? target.scrollTop / maxLeft : 0;
          right.scrollTop = ratio * (right.scrollHeight - right.clientHeight);
        }
        isSyncingScroll.current = false;
      });
    };
    container.addEventListener("scroll", handleScroll, true);
    return () => container.removeEventListener("scroll", handleScroll, true);
  }, []);

  // Right -> Left scroll sync
  useEffect(() => {
    const right = rightScrollRef.current;
    if (!right) return;
    const handleScroll = () => {
      if (isSyncingScroll.current) return;
      const container = leftContainerRef.current;
      if (!container) return;
      isSyncingScroll.current = true;
      requestAnimationFrame(() => {
        const scrollable = findScrollableChild(container);
        if (scrollable) {
          const maxRight = right.scrollHeight - right.clientHeight;
          const ratio = maxRight > 0 ? right.scrollTop / maxRight : 0;
          scrollable.scrollTop = ratio * (scrollable.scrollHeight - scrollable.clientHeight);
        }
        isSyncingScroll.current = false;
      });
    };
    right.addEventListener("scroll", handleScroll);
    return () => right.removeEventListener("scroll", handleScroll);
  }, [findScrollableChild]);

  // Build a CSS gradient from diff lines for source-mode textarea coloring
  const buildBgGradient = useCallback(
    (lines: { type: string }[] | undefined) => {
      if (!sourceMode || !lines) return "none";
      const lineColors: (string | null)[] = [];
      for (const line of lines) {
        // padding行もスキップせず含める（テキストエリアに空行として表示されるため）
        switch (line.type) {
          case "added":
          case "modified-new":
            lineColors.push(alpha(theme.palette.success.main, 0.18));
            break;
          case "removed":
          case "modified-old":
            lineColors.push(alpha(theme.palette.error.main, 0.18));
            break;
          default:
            lineColors.push(null);
        }
      }
      if (lineColors.length === 0) return "none";
      const runs: { color: string; count: number }[] = [];
      for (const c of lineColors) {
        const color = c ?? "transparent";
        if (runs.length > 0 && runs[runs.length - 1].color === color) {
          runs[runs.length - 1].count++;
        } else {
          runs.push({ color, count: 1 });
        }
      }
      // editorSettings から実際の行高さを計算（px単位）
      const lineH = settings.fontSize * settings.lineHeight;
      const padTop = 16; // pt: 2 = 16px (MUI spacing 8px * 2)
      const stops: string[] = [`transparent 0px`, `transparent ${padTop}px`];
      let y = padTop;
      for (const run of runs) {
        stops.push(`${run.color} ${y}px`, `${run.color} ${y + run.count * lineH}px`);
        y += run.count * lineH;
      }
      return `linear-gradient(to bottom, ${stops.join(", ")})`;
    },
    [sourceMode, theme, settings.fontSize, settings.lineHeight],
  );

  const leftBgGradient = useMemo(
    () => buildBgGradient(diffResult?.leftLines),
    [buildBgGradient, diffResult],
  );
  const rightBgGradient = useMemo(
    () => buildBgGradient(diffResult?.rightLines),
    [buildBgGradient, diffResult],
  );

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
      <Popover
        open={!!rightHeadingMenu}
        anchorEl={rightHeadingMenu?.anchorEl}
        onClose={() => setRightHeadingMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <Box sx={{ py: 0.5 }}>
          {[
            { level: 0, label: "Paragraph" },
            { level: 1, label: "H1" },
            { level: 2, label: "H2" },
            { level: 3, label: "H3" },
            { level: 4, label: "H4" },
            { level: 5, label: "H5" },
          ].map(({ level, label }) => (
            <MenuItem
              key={level}
              selected={
                rightHeadingMenu?.currentLevel === level
                && (level !== 0 || !(rightEditor?.isActive("bulletList") || rightEditor?.isActive("orderedList") || rightEditor?.isActive("taskList") || rightEditor?.isActive("blockquote")))
              }
              onClick={() => {
                if (!rightEditor || !rightHeadingMenu) return;
                const el = rightHeadingMenu.anchorEl;
                const inBlockquote = el.tagName.toLowerCase() === "blockquote" || !!el.closest("blockquote");
                const parentList = el.closest("ul, ol");
                const inTaskList = !!parentList?.getAttribute("data-type")?.includes("taskList");
                const inBulletList = !inTaskList && parentList?.tagName.toLowerCase() === "ul";
                const inOrderedList = parentList?.tagName.toLowerCase() === "ol";
                rightEditor.chain().focus().setTextSelection(rightHeadingMenu.pos).run();
                const chain = rightEditor.chain().focus();
                if (inBulletList) chain.toggleBulletList();
                else if (inOrderedList) chain.toggleOrderedList();
                else if (inTaskList) chain.toggleTaskList();
                if (inBlockquote) chain.lift("blockquote");
                if (level === 0) {
                  chain.setParagraph();
                } else {
                  chain.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 });
                }
                chain.run();
                setRightHeadingMenu(null);
              }}
              sx={{ fontSize: "0.85rem", minHeight: 36 }}
            >
              {label}
            </MenuItem>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              if (!rightEditor || !rightHeadingMenu) return;
              rightEditor.chain().focus().setTextSelection(rightHeadingMenu.pos).toggleBulletList().run();
              setRightHeadingMenu(null);
            }}
            selected={rightEditor?.isActive("bulletList")}
            sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
          >
            <FormatListBulletedIcon sx={{ fontSize: 18 }} />
            {t("bulletList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!rightEditor || !rightHeadingMenu) return;
              rightEditor.chain().focus().setTextSelection(rightHeadingMenu.pos).toggleOrderedList().run();
              setRightHeadingMenu(null);
            }}
            selected={rightEditor?.isActive("orderedList")}
            sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
          >
            <FormatListNumberedIcon sx={{ fontSize: 18 }} />
            {t("orderedList")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!rightEditor || !rightHeadingMenu) return;
              rightEditor.chain().focus().setTextSelection(rightHeadingMenu.pos).toggleTaskList().run();
              setRightHeadingMenu(null);
            }}
            selected={rightEditor?.isActive("taskList")}
            sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
          >
            <CheckBoxIcon sx={{ fontSize: 18 }} />
            {t("taskList")}
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              if (!rightEditor || !rightHeadingMenu) return;
              rightEditor.chain().focus().setTextSelection(rightHeadingMenu.pos).toggleBlockquote().run();
              setRightHeadingMenu(null);
            }}
            selected={rightEditor?.isActive("blockquote")}
            sx={{ fontSize: "0.85rem", minHeight: 36, gap: 1 }}
          >
            <FormatQuoteIcon sx={{ fontSize: 18 }} />
            {t("blockquote")}
          </MenuItem>
        </Box>
      </Popover>

      {/* BubbleMenu for right editor (text formatting) */}
      {rightEditor && !sourceMode && (
        <BubbleMenu
          editor={rightEditor}
          shouldShow={({ editor: e, state }) => {
            const { selection } = state;
            if (selection.empty) return false;
            if (e.isActive("codeBlock")) return false;
            return true;
          }}
        >
          <Paper
            elevation={8}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.25,
              px: 0.5,
              py: 0.25,
              borderRadius: 1,
            }}
          >
            <Tooltip title={t("bold")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleBold().run()}
                color={rightEditor.isActive("bold") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <FormatBoldIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("italic")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleItalic().run()}
                color={rightEditor.isActive("italic") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <FormatItalicIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("underline")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleUnderline().run()}
                color={rightEditor.isActive("underline") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <FormatUnderlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("strikethrough")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleStrike().run()}
                color={rightEditor.isActive("strike") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <StrikethroughSIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("highlight")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleHighlight().run()}
                color={rightEditor.isActive("highlight") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <BorderColorIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("code")}>
              <IconButton
                size="small"
                onClick={() => rightEditor.chain().focus().toggleCode().run()}
                color={rightEditor.isActive("code") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <CodeIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("link")}>
              <IconButton
                size="small"
                onClick={() => {
                  if (rightEditor.isActive("link")) {
                    rightEditor.chain().focus().unsetLink().run();
                    return;
                  }
                  const url = window.prompt("URL:");
                  if (url?.trim()) {
                    rightEditor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
                  }
                }}
                color={rightEditor.isActive("link") ? "primary" : "default"}
                sx={{ p: 0.5 }}
              >
                <InsertLinkIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Paper>
        </BubbleMenu>
      )}

    </Box>
  );
}
