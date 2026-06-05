import type { AnyExtension, Editor } from "@anytime-markdown/markdown-react";
import { useEditor } from "@anytime-markdown/markdown-react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import {
  Box,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildEditorExtensions } from "../buildEditorExtensions";
import { FILE_DROP_OVERLAY_COLOR, getDivider, getEditorBg, getTextDisabled } from "../constants/colors";
import { MERGE_INFO_FONT_SIZE } from "../constants/dimensions";
import { setMergeEditors } from "../contexts/MergeEditorsContext";
import { useDiffBackground } from "../hooks/useDiffBackground";
import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { useMergeContentSync } from "../hooks/useMergeContentSync";
import { useMergeDiff } from "../hooks/useMergeDiff";
import { useMergeFileOps } from "../hooks/useMergeFileOps";
import { useScrollSync } from "../hooks/useScrollSync";
import { useEditorSettingsContext } from "../useEditorSettings";
import { type DiffLine } from "../utils/diffEngine";
import { preprocessMarkdown } from "../utils/frontmatterHelpers";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { LinePreviewPanel } from "./LinePreviewPanel";
import { MergeEditorPanel } from "./MergeEditorPanel";

/** 折りたたみ時に変更箇所の前後に残すコンテキスト量。
 *  ソースモードは行単位（3 行）、WYSIWYG はブロック単位（1 ブロック）で粒度が異なる。 */
const MERGE_COLLAPSE_CONTEXT_LINES = 3;
const MERGE_COLLAPSE_CONTEXT_BLOCKS = 1;

export interface MergeUndoRedo {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface MergeCollapseProps {
  collapse: boolean;
  contextLines: number;
  expandedStarts: Set<number>;
  onToggleExpand: (startIdx: number) => void;
}

interface InlineMergeViewProps {
  rightEditor?: Editor | null;
  /** codeBlock 拡張 (rich の CodeBlockWithMermaid)。左パネルの mermaid/plantuml/math/html/embed 描画に必須 */
  codeBlockExtension?: AnyExtension;
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
    collapseProps?: MergeCollapseProps,
  ) => React.ReactNode;
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
  codeBlockExtension,
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
    currentBlockIndex,
    totalBlocks,
    goToNextBlock,
    goToPrevBlock,
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

  // 未変更セクション折りたたみ（変更箇所のみ表示）
  const [collapseEnabled, setCollapseEnabled] = useState(false);
  const [expandedStarts, setExpandedStarts] = useState<Set<number>>(() => new Set());
  const handleToggleCollapse = useCallback(() => {
    setCollapseEnabled((prev) => !prev);
    setExpandedStarts(new Set()); // 切り替え時は手動展開をリセット
  }, []);
  const handleToggleExpand = useCallback((startIdx: number) => {
    setExpandedStarts((prev) => {
      const next = new Set(prev);
      if (next.has(startIdx)) next.delete(startIdx);
      else next.add(startIdx);
      return next;
    });
  }, []);
  const collapseProps = useMemo(
    () => ({
      collapse: collapseEnabled,
      contextLines: MERGE_COLLAPSE_CONTEXT_LINES,
      expandedStarts,
      onToggleExpand: handleToggleExpand,
    }),
    [collapseEnabled, expandedStarts, handleToggleExpand],
  );
  const expandBlocksLabel = useMemo(() => t("expandBlocks"), [t]);

  const {
    rightDragOver, setRightDragOver,
    fileInputRightRef,
    handleFileInputChange,
    handleDragDropFile,
  } = useMergeFileOps({
    compareText, setCompareText,
    onRightFileOpsReady,
    externalRightContent, onExternalRightContentConsumed,
    downloadMarkdown: downloadText,
  });

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const compareTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 差分ナビゲーション: 選択中ブロックへ自動スクロール
  const diffResultRef = useRef(diffResult);
  diffResultRef.current = diffResult;
  useEffect(() => {
    const block = diffResultRef.current?.blocks?.[currentBlockIndex];
    if (!block) return;
    const raf = requestAnimationFrame(() => {
      for (const container of [rightScrollRef.current, leftContainerRef.current]) {
        if (!container) continue;
        // ソースモード: ブロック ID で厳密に特定。WYSIWYG モード: doc ベース diff の出現順で best-effort
        const anchor =
          container.querySelector(`[data-diff-block-id="${block.id}"]`) ??
          container.querySelectorAll("[data-diff-block]")[currentBlockIndex] ??
          null;
        if (anchor) {
          anchor.scrollIntoView({ block: "center", behavior: "smooth" });
          break;
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [currentBlockIndex]);

  const handleMergeNavKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "F8") return;
      e.preventDefault();
      if (e.shiftKey) goToPrevBlock();
      else goToNextBlock();
    },
    [goToNextBlock, goToPrevBlock],
  );

  const hoverSetterRef = useRef<((v: number | null) => void) | null>(null);
  const handleHoverLine = useCallback((idx: number | null) => {
    hoverSetterRef.current?.(idx);
  }, []);

  // Right tiptap editor (for WYSIWYG mode) – readonly (cursor visible)
  const leftEditor = useEditor({
    extensions: buildEditorExtensions({ mode: "compare", codeBlockExtension }),
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

  useMergeContentSync({
    sourceMode, leftEditor, rightEditor,
    editorContent, compareText,
    setEditText, setCompareText,
  });

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

  // WYSIWYG 比較モードは常に semantic で差分を取る（左右がセクション単位で揃い、
  // 片側のみの追加/削除セクションも整合する）。セマンティックトグルはソースモード専用。
  useDiffHighlight(sourceMode, rightEditor, leftEditor, true, collapseEnabled, MERGE_COLLAPSE_CONTEXT_BLOCKS, expandBlocksLabel);

  useScrollSync(leftContainerRef, rightScrollRef);

  const rightFrontmatter = useMemo(() => preprocessMarkdown(compareText).frontmatter, [compareText]);

  const { leftBgGradient, rightBgGradient } = useDiffBackground(diffResult, sourceMode);

  // モジュールレベルストアに左右エディタを登録（NodeView ポータルからアクセス可能にする）
  useEffect(() => {
    setMergeEditors({ rightEditor: rightEditor ?? null, leftEditor: leftEditor ?? null });
    return () => setMergeEditors(null);
  }, [rightEditor, leftEditor]);

  return (
    <Box onKeyDown={handleMergeNavKeyDown} sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      {/* Hidden file input for right panel */}
      <input
        ref={fileInputRightRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={handleFileInputChange}
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

      {/* Diff navigation + semantic diff toggle */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5, px: 1, py: 0.5, flexShrink: 0 }}>
        <Tooltip title={t("mergeNav.prev")}>
          <span>
            <IconButton
              size="small"
              onClick={goToPrevBlock}
              disabled={totalBlocks === 0}
              aria-label={t("mergeNav.prev")}
              sx={{ p: 0.5 }}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography
          variant="caption"
          aria-live="polite"
          sx={{ minWidth: "3.5em", textAlign: "center", fontVariantNumeric: "tabular-nums", color: getTextDisabled(isDark) }}
        >
          {totalBlocks === 0 ? "0 / 0" : `${currentBlockIndex + 1} / ${totalBlocks}`}
        </Typography>
        <Tooltip title={t("mergeNav.next")}>
          <span>
            <IconButton
              size="small"
              onClick={goToNextBlock}
              disabled={totalBlocks === 0}
              aria-label={t("mergeNav.next")}
              sx={{ p: 0.5 }}
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title={t("collapseUnchanged")}>
          <IconButton
            size="small"
            onClick={handleToggleCollapse}
            color={collapseEnabled ? "primary" : "default"}
            aria-label={t("collapseUnchanged")}
            aria-pressed={collapseEnabled}
            sx={{ p: 0.5 }}
          >
            <UnfoldLessIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* セマンティックトグルはソースモード専用（WYSIWYG は常に semantic） */}
        {sourceMode && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
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
          </>
        )}
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
              handleDragDropFile(file);
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
              {...collapseProps}
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
          {children(leftBgGradient, diffResult?.leftLines, flippedMergeBlock, handleHoverLine, collapseProps)}
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
