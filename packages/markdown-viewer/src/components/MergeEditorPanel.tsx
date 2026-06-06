import type { Editor } from "@anytime-markdown/markdown-react";
import { EditorContent } from "@anytime-markdown/markdown-react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { Box, IconButton, Paper, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { alpha, useTheme } from "@mui/material/styles";
import React, { useEffect, useRef } from "react";

import { getActionHover, getErrorMain, getSuccessMain, getTextPrimary, getTextSecondary } from "../constants/colors";
import { useMarkdownT } from "../i18n/context";
import { useEditorSettingsContext } from "../useEditorSettings";
import { diffLineBgColor } from "../utils/colorRuns";
import { type CollapseRegion, computeCollapsedRegions, type DiffLine } from "../utils/diffEngine";
import { getMergeTiptapStyles } from "./mergeTiptapStyles";

export { getMergeTiptapStyles } from "./mergeTiptapStyles";

/** Normalize optional SxProps into a spreadable array (avoids nested ternary). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sx array type is complex; matches MUI's internal spread pattern
function normalizeSx(sx: SxProps<Theme> | undefined): any[] {
  if (!sx) return [];
  return Array.isArray(sx) ? sx : [sx];
}

function _getLineBgColor(type: DiffLine["type"], theme: Theme) {
  const isDark = theme.palette.mode === "dark";
  switch (type) {
    case "added":
    case "modified-new":
      return alpha(getSuccessMain(isDark), 0.15);
    case "removed":
    case "modified-old":
      return alpha(getErrorMain(isDark), 0.15);
    case "padding":
      return alpha(getActionHover(isDark), 0.05);
    default:
      return "transparent";
  }
}

interface MergeEditorPanelProps {
  sourceMode: boolean;
  sourceText?: string;
  onSourceChange?: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  autoResize?: boolean;
  textareaAriaLabel?: string;
  editor?: Editor | null;
  editorWrapperRef?: React.RefObject<HTMLDivElement | null>;
  editorMountRef?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  bgGradient?: string;
  paperSx?: SxProps<Theme>;
  hideScrollbar?: boolean;
  diffLines?: DiffLine[];
  side?: "left" | "right";
  readOnly?: boolean;
  showHoverLabels?: boolean;
  onMerge?: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  onHoverLine?: (lineIndex: number | null) => void;
  /** 未変更セクション折りたたみ ON/OFF（ソースモードのみ） */
  collapse?: boolean;
  /** 折りたたみ時に変更前後に残す行数 */
  contextLines?: number;
  /** 手動展開済み collapsed 領域の startIdx 集合 */
  expandedStarts?: Set<number>;
  /** collapsed 領域の展開トグル */
  onToggleExpand?: (startIdx: number) => void;
}

/** Build display text and padding indices from diffLines */
function buildDisplayText(diffLines: DiffLine[], rawText: string): { displayText: string; paddingIndices: Set<number> } {
  const displayLines: string[] = [];
  const paddingIndices = new Set<number>();
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type === "padding") {
      displayLines.push("");
      paddingIndices.add(i);
    } else {
      displayLines.push(diffLines[i].text);
    }
  }
  let displayText = displayLines.join("\n");
  if (rawText.endsWith("\n") && !displayText.endsWith("\n")) {
    displayText += "\n";
  }
  return { displayText, paddingIndices };
}

/** Build merge button map: diffLines index -> blockId (first line of each diff block only) */
function buildMergeButtonMap(diffLines: DiffLine[]): Map<number, number> {
  const map = new Map<number, number>();
  const renderedBlocks = new Set<number>();
  for (let i = 0; i < diffLines.length; i++) {
    const dl = diffLines[i];
    if (dl.blockId !== null && dl.type !== "equal" && dl.type !== "padding" && !renderedBlocks.has(dl.blockId)) {
      renderedBlocks.add(dl.blockId);
      map.set(i, dl.blockId);
    }
  }
  return map;
}

/** Merge gutter column with directional buttons */
function MergeGutter({
  panelSide, alignedCount, mergeButtonIndices, fontSize, lineHeight, mergeGutterRef, onMerge, t,
}: Readonly<{
  panelSide: "left" | "right";
  alignedCount: number;
  mergeButtonIndices: Map<number, number>;
  fontSize: number;
  lineHeight: number;
  mergeGutterRef: React.RefObject<HTMLDivElement | null>;
  onMerge: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}>) {
  return (
    <Box ref={mergeGutterRef} sx={{ width: 24, minWidth: 24, py: 2, m: 0, overflow: "hidden", flexShrink: 0 }}>
      {Array.from({ length: alignedCount }, (_, i) => {
        const blockId = mergeButtonIndices.get(i);
        return (
          <MergeGutterCell key={i} blockId={blockId ?? null} panelSide={panelSide} fontSize={fontSize} lineHeight={lineHeight} onMerge={onMerge} t={t} />
        );
      })}
    </Box>
  );
}

function MergeGutterCell({
  blockId, panelSide, fontSize, lineHeight, onMerge, t,
}: Readonly<{
  blockId: number | null;
  panelSide: "left" | "right";
  fontSize: number;
  lineHeight: number;
  onMerge: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}>) {
  const label = panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft");
  const direction = panelSide === "left" ? "left-to-right" as const : "right-to-left" as const;
  return (
    <Box sx={{ position: "relative", fontFamily: "monospace", fontSize: `${fontSize}px`, lineHeight, textAlign: "center" }}>
      {"\u00A0"}
      {blockId != null && (
        <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Tooltip title={label} placement={panelSide === "left" ? "left" : "right"}>
            <IconButton size="small" aria-label={label} onClick={() => onMerge(blockId, direction)} sx={{ p: 0 }}>
              {panelSide === "left" ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ChevronLeftIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

/** Compute derived display state for SourceModePanel */
function computeSourcePanelState(
  sourceText: string | undefined,
  diffLines: DiffLine[] | undefined,
  side: "left" | "right" | undefined,
  onMerge: ((blockId: number, direction: "left-to-right" | "right-to-left") => void) | undefined,
  digitsOverride?: number,
) {
  const rawText = sourceText ?? "";
  const rawLineCount = rawText === "" ? 1 : rawText.split("\n").length;
  const digits = digitsOverride ?? String(rawLineCount).length;

  const { displayText, paddingIndices } = diffLines
    ? buildDisplayText(diffLines, rawText)
    : { displayText: rawText, paddingIndices: new Set<number>() };

  const alignedCount = diffLines ? diffLines.length : rawLineCount;
  const lineNumbersArray = diffLines
    ? diffLines.map(dl => dl.lineNumber == null ? "" : String(dl.lineNumber))
    : Array.from({ length: rawLineCount }, (_, i) => String(i + 1));

  const displayLines = displayText.split("\n");

  const mergeButtonIndices = diffLines && side && onMerge ? buildMergeButtonMap(diffLines) : new Map<number, number>();
  const hasMergeButtons = mergeButtonIndices.size > 0 && !!side && !!onMerge;

  return { rawText, digits, displayText, paddingIndices, alignedCount, lineNumbersArray, displayLines, mergeButtonIndices, hasMergeButtons };
}

/** 折りたたみ展開ボタン行（collapsed 領域の代わりに表示） */
function ExpanderRow({
  count, fontSize, lineHeight, isDark, onClick, t,
}: Readonly<{
  count: number;
  fontSize: number;
  lineHeight: number;
  isDark: boolean;
  onClick: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}>) {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={t("expandLines", { count })}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: "flex", alignItems: "center", gap: 1, cursor: "pointer",
        px: 2, py: 0.5, fontFamily: "monospace", fontSize: `${fontSize}px`, lineHeight,
        color: alpha(getTextSecondary(isDark), 0.8),
        bgcolor: alpha(getActionHover(isDark), 0.04),
        borderTop: `1px dashed ${alpha(getTextSecondary(isDark), 0.25)}`,
        borderBottom: `1px dashed ${alpha(getTextSecondary(isDark), 0.25)}`,
        userSelect: "none",
        "&:hover": { bgcolor: alpha(getActionHover(isDark), 0.1) },
      }}
    >
      <UnfoldMoreIcon sx={{ fontSize: 16 }} />
      {t("expandLines", { count })}
    </Box>
  );
}

/** ソースモードの 1 セグメント（diffLines スライス）。ガター・ミラー・textarea・マージガターと行高さ同期を内包する自己完結ユニット。 */
function SourceSegment({
  diffLines, baseAlignedIdx, side, readOnly, autoResize, textareaAriaLabel,
  onSliceChange, onMerge, onHoverLine, isDark, editorSettings, digits, hideScrollbarSx, t, textareaRef,
}: Readonly<{
  diffLines: DiffLine[];
  baseAlignedIdx: number;
  side: "left" | "right" | undefined;
  readOnly: boolean | undefined;
  autoResize: boolean | undefined;
  textareaAriaLabel: string | undefined;
  onSliceChange: ((value: string) => void) | undefined;
  onMerge: ((blockId: number, direction: "left-to-right" | "right-to-left") => void) | undefined;
  onHoverLine: ((lineIndex: number | null) => void) | undefined;
  isDark: boolean;
  editorSettings: { fontSize: number; lineHeight: number };
  digits: number;
  hideScrollbarSx: Record<string, unknown>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}>) {
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef ?? fallbackTextareaRef;
  const gutterRef = useRef<HTMLDivElement>(null);
  const mergeGutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // 差分の色付けは折り返し対応のため固定位置グラデーションではなく、
  // ミラー（行単位 div）の背景色で行う（diffLineBgColor）。bgGradient は使わない。
  const {
    paddingIndices, alignedCount, lineNumbersArray,
    displayText, displayLines, mergeButtonIndices, hasMergeButtons,
  } = computeSourcePanelState(undefined, diffLines, side, onMerge, digits);

  // textarea 自動リサイズ（autoResize 時のみ）
  useEffect(() => {
    if (!autoResize) return;
    const el = resolvedTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoResize, displayText, alignedCount, resolvedTextareaRef]);

  // ガターのスクロール同期（非 autoResize 時のみ）
  useEffect(() => {
    if (autoResize) return;
    const textarea = resolvedTextareaRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !gutter) return;
    const mergeGutter = mergeGutterRef.current;
    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop;
      if (mergeGutter) mergeGutter.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, [autoResize, resolvedTextareaRef]);

  // ミラー要素で各行の描画高さを計測し、行番号・マージボタンの高さに反映
  useEffect(() => {
    const applyHeights = () => {
      const mirror = mirrorRef.current;
      const gutter = gutterRef.current;
      if (!mirror || !gutter) return;
      for (let i = 0; i < mirror.children.length; i++) {
        const h = (mirror.children[i] as HTMLElement).getBoundingClientRect().height;
        if (i < gutter.children.length) {
          (gutter.children[i] as HTMLElement).style.height = `${h}px`;
        }
        const mg = mergeGutterRef.current;
        if (mg && i < mg.children.length) {
          (mg.children[i] as HTMLElement).style.height = `${h}px`;
        }
      }
    };
    applyHeights();
    const container = textContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(applyHeights);
    ro.observe(container);
    return () => ro.disconnect();
  }, [displayText, editorSettings.fontSize, editorSettings.lineHeight]);

  return (
    <Box sx={{ display: "flex" }}>
      {side === "right" && hasMergeButtons && (
        <MergeGutter panelSide="right" alignedCount={alignedCount} mergeButtonIndices={mergeButtonIndices} fontSize={editorSettings.fontSize} lineHeight={editorSettings.lineHeight} mergeGutterRef={mergeGutterRef} onMerge={onMerge ?? (() => {})} t={t} />
      )}

      <Box
        ref={gutterRef}
        sx={{
          width: `${Math.max(3, digits + 1)}ch`, minWidth: `${Math.max(3, digits + 1)}ch`,
          py: 2, px: 1, m: 0, textAlign: "right", fontFamily: "monospace",
          fontSize: `${editorSettings.fontSize}px`, lineHeight: editorSettings.lineHeight,
          color: alpha(getTextSecondary(isDark), 0.6), userSelect: "none",
          overflow: "hidden", boxSizing: "border-box", flexShrink: 0,
        }}
      >
        {lineNumbersArray.map((num, i) => {
          // data-diff-block-id: ブロック先頭行に付与する差分ナビゲーションのスクロールアンカー
          const navBlockId = mergeButtonIndices.get(i);
          return (
            <div
              key={`ln-${num || "pad"}-${i}`}
              {...(navBlockId !== undefined ? { "data-diff-block-id": String(navBlockId) } : {})}
            >
              {num || " "}
            </div>
          );
        })}
      </Box>

      <Box ref={textContainerRef} sx={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/*
          ミラー兼・差分背景レイヤー。
          textarea と同一の折り返し（pre-wrap）でテキストを透明描画し、各行 div の
          背景色で diff を着色する。これにより行が折り返しても色帯が実テキスト行と
          一致する（固定位置グラデーションのズレを解消）。textarea の背後に置く。
        */}
        <Box
          ref={mirrorRef}
          aria-hidden="true"
          sx={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 0, pointerEvents: "none",
            color: "transparent",
            fontFamily: "monospace", fontSize: `${editorSettings.fontSize}px`, lineHeight: editorSettings.lineHeight,
            whiteSpace: "pre-wrap", overflowWrap: "break-word", pt: 2, pb: 2,
            pr: side === "left" && hasMergeButtons ? 0 : 2, pl: 1, boxSizing: "border-box",
          }}
        >
          {displayLines.map((line, i) => (
            <div
              key={`dl-${i}-${line.length}`}
              style={{ backgroundColor: diffLineBgColor(diffLines[i]?.type ?? "equal", isDark) }}
            >
              {line || " "}
            </div>
          ))}
        </Box>
        <Box
          component="textarea"
          ref={resolvedTextareaRef}
          aria-label={textareaAriaLabel}
          readOnly={readOnly}
          value={displayText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newText = e.target.value;
            if (paddingIndices.size === 0) {
              onSliceChange?.(newText);
              return;
            }
            const lines = newText.split("\n");
            const realLines: string[] = [];
            for (let i = 0; i < lines.length; i++) {
              if (paddingIndices.has(i) && lines[i] === "") continue;
              realLines.push(lines[i]);
            }
            onSliceChange?.(realLines.join("\n"));
          }}
          onSelect={(e: React.SyntheticEvent<HTMLTextAreaElement>) => {
            if (!onHoverLine) return;
            const ta = e.currentTarget;
            const pos = ta.selectionStart ?? 0;
            const lineIdx = (ta.value.slice(0, pos).match(/\n/g) || []).length;
            onHoverLine(lineIdx < diffLines.length ? baseAlignedIdx + lineIdx : null);
          }}
          sx={{
            position: "relative", zIndex: 1,
            width: "100%", minHeight: "100%", pt: 2, pb: 2,
            pr: side === "left" && hasMergeButtons ? 0 : 2, pl: 1,
            border: "none", outline: "none", boxShadow: "none", resize: "none",
            ...(autoResize ? { overflow: "hidden" } : {}),
            ...hideScrollbarSx,
            fontFamily: "monospace", fontSize: `${editorSettings.fontSize}px`,
            lineHeight: editorSettings.lineHeight, color: getTextPrimary(isDark),
            bgcolor: "transparent", boxSizing: "border-box",
            "&:focus": { border: "none", outline: "none", boxShadow: "none" },
          }}
        />
      </Box>

      {side === "left" && hasMergeButtons && (
        <MergeGutter panelSide="left" alignedCount={alignedCount} mergeButtonIndices={mergeButtonIndices} fontSize={editorSettings.fontSize} lineHeight={editorSettings.lineHeight} mergeGutterRef={mergeGutterRef} onMerge={onMerge ?? (() => {})} t={t} />
      )}
    </Box>
  );
}

/** diffLines の collapsed 領域を考慮し、各 region の実テキスト行範囲を求める */
function realLineRanges(diffLines: DiffLine[], regions: CollapseRegion[]): { start: number; end: number }[] {
  // prefix[i] = diffLines[0..i) の実テキスト行数（lineNumber !== null）
  const prefix = new Array<number>(diffLines.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < diffLines.length; i++) {
    prefix[i + 1] = prefix[i] + (diffLines[i].lineNumber !== null ? 1 : 0);
  }
  return regions.map((r) => ({ start: prefix[r.startIdx], end: prefix[r.endIdx] }));
}
function SourceModePanel({
  sourceText, onSourceChange, resolvedTextareaRef, autoResize, textareaAriaLabel,
  scrollRef, paperSx, hideScrollbarSx, diffLines, side, readOnly,
  onMerge, onHoverLine, isDark, editorSettings, t,
  collapse, contextLines, expandedStarts, onToggleExpand,
}: Readonly<{
  sourceText: string | undefined;
  onSourceChange: ((value: string) => void) | undefined;
  resolvedTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  autoResize: boolean | undefined;
  textareaAriaLabel: string | undefined;
  scrollRef: React.RefObject<HTMLDivElement | null> | undefined;
  paperSx: SxProps<Theme> | undefined;
  hideScrollbarSx: Record<string, unknown>;
  diffLines: DiffLine[] | undefined;
  side: "left" | "right" | undefined;
  readOnly: boolean | undefined;
  onMerge: ((blockId: number, direction: "left-to-right" | "right-to-left") => void) | undefined;
  onHoverLine: ((lineIndex: number | null) => void) | undefined;
  isDark: boolean;
  editorSettings: { fontSize: number; lineHeight: number };
  t: (key: string, vars?: Record<string, string | number>) => string;
  collapse: boolean | undefined;
  contextLines: number | undefined;
  expandedStarts: Set<number> | undefined;
  onToggleExpand: ((startIdx: number) => void) | undefined;
}>) {
  const rawText = sourceText ?? "";
  // diffLines 未指定時は全行 equal として扱い、SourceSegment 描画に統一する
  const effectiveLines: DiffLine[] = diffLines ?? (rawText === "" ? [] : rawText.split("\n")).map((text, i) => ({
    text, type: "equal" as const, blockId: null, lineNumber: i + 1,
  }));
  const totalRealLines = rawText === "" ? 1 : rawText.split("\n").length;
  const digits = String(totalRealLines).length;

  const paperSxArray = [
    // 通常エディタ（EditorContentArea の variant="outlined"）と同じ枠線を比較モードでも表示する。
    { flex: 1, overflow: autoResize ? "auto" : "hidden", borderRadius: 0, ...hideScrollbarSx },
    ...normalizeSx(paperSx),
  ];

  // 折りたたみ OFF（または collapse 不可）: 1 セグメントで全体描画（従来挙動）
  if (!collapse) {
    return (
      <Paper variant="outlined" ref={scrollRef} sx={paperSxArray}>
        <Box sx={{ minHeight: "100%" }}>
          <SourceSegment
            diffLines={effectiveLines} baseAlignedIdx={0}
            side={side} readOnly={readOnly} autoResize={autoResize}
            textareaAriaLabel={textareaAriaLabel}
            onSliceChange={onSourceChange} onMerge={onMerge} onHoverLine={onHoverLine}
            isDark={isDark} editorSettings={editorSettings} digits={digits}
            hideScrollbarSx={hideScrollbarSx} t={t} textareaRef={resolvedTextareaRef}
          />
        </Box>
      </Paper>
    );
  }

  const regions = computeCollapsedRegions(effectiveLines, contextLines ?? 3, expandedStarts);
  const ranges = realLineRanges(effectiveLines, regions);
  // 最初の可視セグメントにのみ外部 textareaRef を渡す（render 中の可変フラグを避け事前計算）
  const firstVisibleRi = regions.findIndex((r) => r.kind === "visible");

  const handleSliceChange = (range: { start: number; end: number }, sliceRealText: string) => {
    const fullLines = rawText === "" ? [] : rawText.split("\n");
    const next = [...fullLines.slice(0, range.start), ...sliceRealText.split("\n"), ...fullLines.slice(range.end)];
    onSourceChange?.(next.join("\n"));
  };

  return (
    <Paper variant="outlined" ref={scrollRef} sx={paperSxArray}>
      <Box sx={{ minHeight: "100%" }}>
        {regions.map((region, ri) => {
          if (region.kind === "collapsed") {
            return (
              <ExpanderRow
                key={`exp-${region.startIdx}`}
                count={region.collapsedCount}
                fontSize={editorSettings.fontSize}
                lineHeight={editorSettings.lineHeight}
                isDark={isDark}
                onClick={() => onToggleExpand?.(region.startIdx)}
                t={t}
              />
            );
          }
          const range = ranges[ri];
          const isFirst = ri === firstVisibleRi;
          return (
            <SourceSegment
              key={`seg-${region.startIdx}`}
              diffLines={effectiveLines.slice(region.startIdx, region.endIdx)}
              baseAlignedIdx={region.startIdx}
              side={side} readOnly={readOnly} autoResize={autoResize}
              textareaAriaLabel={textareaAriaLabel}
              onSliceChange={(text) => handleSliceChange(range, text)}
              onMerge={onMerge} onHoverLine={onHoverLine}
              isDark={isDark} editorSettings={editorSettings} digits={digits}
              hideScrollbarSx={hideScrollbarSx} t={t}
              textareaRef={isFirst ? resolvedTextareaRef : undefined}
            />
          );
        })}
      </Box>
    </Paper>
  );
}

export function MergeEditorPanel({
  sourceMode,
  sourceText,
  onSourceChange,
  textareaRef,
  autoResize,
  textareaAriaLabel,
  editor,
  editorWrapperRef,
  editorMountRef,
  children,
  scrollRef,
  paperSx,
  hideScrollbar,
  diffLines,
  side,
  readOnly,
  showHoverLabels,
  onMerge,
  onHoverLine,
  collapse,
  contextLines,
  expandedStarts,
  onToggleExpand,
}: Readonly<MergeEditorPanelProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const t = useMarkdownT("MarkdownEditor");
  const editorSettings = useEditorSettingsContext();
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef || fallbackTextareaRef;

  const hideScrollbarSx = hideScrollbar
    ? {
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none",
      }
    : {};

  // ソースモードの行高さ同期・ガター・グラデーションは SourceSegment が自己完結で担う
  if (sourceMode) {
    return (
      <SourceModePanel
        sourceText={sourceText} onSourceChange={onSourceChange}
        resolvedTextareaRef={resolvedTextareaRef} autoResize={autoResize}
        textareaAriaLabel={textareaAriaLabel} scrollRef={scrollRef}
        paperSx={paperSx} hideScrollbarSx={hideScrollbarSx}
        diffLines={diffLines} side={side} readOnly={readOnly}
        onMerge={onMerge} onHoverLine={onHoverLine}
        isDark={isDark} editorSettings={editorSettings} t={t}
        collapse={collapse} contextLines={contextLines}
        expandedStarts={expandedStarts} onToggleExpand={onToggleExpand}
      />
    );
  }

  const tiptapStyles = getMergeTiptapStyles(theme, editorSettings, { showHoverLabels });

  const paperContent = (
    <Paper
      variant="outlined"
      ref={scrollRef}
      sx={[
        {
          // 通常エディタと同じ枠線を比較モード（WYSIWYG）でも表示する（variant="outlined"）。
          flex: 1,
          overflow: "auto",
          borderRadius: 0,
          ...tiptapStyles,
          ...hideScrollbarSx,
        },
        ...normalizeSx(paperSx),
      ]}
    >
      {editorMountRef
        ? <div ref={editorMountRef} style={{ display: "contents" }} />
        : <EditorContent editor={editor ?? null} />
      }
      {children}
    </Paper>
  );

  if (editorWrapperRef) {
    return (
      <Box ref={editorWrapperRef} sx={{ position: "relative", flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {paperContent}
      </Box>
    );
  }

  return paperContent;
}
