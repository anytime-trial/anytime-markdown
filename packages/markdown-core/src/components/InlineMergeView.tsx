import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  Box,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import { useEditor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { FILE_DROP_OVERLAY_COLOR, getDivider, getEditorBg, getTextDisabled } from "../constants/colors";
import { MERGE_INFO_FONT_SIZE } from "../constants/dimensions";
import { setMergeEditors } from "../contexts/MergeEditorsContext";
import { getBaseExtensions } from "../editorExtensions";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { ReviewModeExtension } from "../extensions/reviewModeExtension";
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

  const hoverSetterRef = useRef<((v: number | null) => void) | null>(null);
  const handleHoverLine = useCallback((idx: number | null) => {
    hoverSetterRef.current?.(idx);
  }, []);

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

  useDiffHighlight(sourceMode, rightEditor, leftEditor, diffOptions.semantic);

  useScrollSync(leftContainerRef, rightScrollRef);

  const rightFrontmatter = useMemo(() => preprocessMarkdown(compareText).frontmatter, [compareText]);

  const { leftBgGradient, rightBgGradient } = useDiffBackground(diffResult, sourceMode);

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
