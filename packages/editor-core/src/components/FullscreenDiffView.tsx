import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { alpha, Box, IconButton, type Theme,Tooltip, useTheme } from "@mui/material";
import React, { useCallback, useEffect,useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { useEditorSettingsContext } from "../useEditorSettings";
import { applyMerge, computeDiff, type DiffLine } from "../utils/diffEngine";

interface FullscreenDiffViewProps {
  initialLeftCode: string;
  initialRightCode: string;
  onMergeApply: (newLeftCode: string, newRightCode: string) => void;
  t: (key: string) => string;
}

// --- Helpers ---

/** useDiffBackground と同じ配色（alpha 0.18） */
function buildBgGradient(
  lines: DiffLine[],
  fontSize: number,
  lineHeight: number,
  theme: Theme,
): string {
  const lineColors: (string | null)[] = [];
  for (const line of lines) {
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

  const lineH = fontSize * lineHeight;
  const padTop = 16; // py: 2 = 16px
  const stops: string[] = [`transparent 0px`, `transparent ${padTop}px`];
  let y = padTop;
  for (const run of runs) {
    stops.push(`${run.color} ${y}px`, `${run.color} ${y + run.count * lineH}px`);
    y += run.count * lineH;
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function buildDisplayData(diffLines: DiffLine[]) {
  const displayLines: string[] = [];
  const paddingIndices = new Set<number>();
  const lineNumbers: string[] = [];

  for (let i = 0; i < diffLines.length; i++) {
    const dl = diffLines[i];
    if (dl.type === "padding") {
      displayLines.push("");
      paddingIndices.add(i);
    } else {
      displayLines.push(dl.text);
    }
    lineNumbers.push(dl.lineNumber != null ? String(dl.lineNumber) : "");
  }

  return {
    displayText: displayLines.join("\n"),
    displayLines,
    paddingIndices,
    lineNumbers,
  };
}

function buildMergeButtonIndices(diffLines: DiffLine[]): Map<number, number> {
  const map = new Map<number, number>();
  const rendered = new Set<number>();
  for (let i = 0; i < diffLines.length; i++) {
    const dl = diffLines[i];
    if (
      dl.blockId !== null &&
      dl.type !== "equal" &&
      dl.type !== "padding" &&
      !rendered.has(dl.blockId)
    ) {
      rendered.add(dl.blockId);
      map.set(i, dl.blockId);
    }
  }
  return map;
}

// --- Component ---

export function FullscreenDiffView({
  initialLeftCode,
  initialRightCode,
  onMergeApply,
  t,
}: FullscreenDiffViewProps) {
  const theme = useTheme();
  const settings = useEditorSettingsContext();
  const { fontSize, lineHeight } = settings;

  const [editText, setEditText] = useState(initialLeftCode);
  const [compareText, setCompareText] = useState(initialRightCode);

  // Sync with props when dialog re-opens
  const prevInitialLeft = useRef(initialLeftCode);
  const prevInitialRight = useRef(initialRightCode);
  if (prevInitialLeft.current !== initialLeftCode || prevInitialRight.current !== initialRightCode) {
    prevInitialLeft.current = initialLeftCode;
    prevInitialRight.current = initialRightCode;
    setEditText(initialLeftCode);
    setCompareText(initialRightCode);
  }

  const diffResult = useMemo(() => computeDiff(editText, compareText), [editText, compareText]);

  const mergeButtonIndices = useMemo(
    () => buildMergeButtonIndices(diffResult.leftLines),
    [diffResult],
  );

  const handleMergeBlock = useCallback(
    (blockId: number, direction: "left-to-right" | "right-to-left") => {
      const block = diffResult.blocks.find((b) => b.id === blockId);
      if (!block) return;
      // 画面上の左=compareText, 右=editText なので direction を反転
      const flipped = direction === "left-to-right" ? "right-to-left" : "left-to-right";
      const { newLeftText, newRightText } = applyMerge(editText, compareText, block, flipped);
      setEditText(newLeftText);
      setCompareText(newRightText);
      onMergeApply(newLeftText, newRightText);
    },
    [diffResult, editText, compareText, onMergeApply],
  );

  const hasMergeButtons = mergeButtonIndices.size > 0;

  // Left panel data
  const leftData = useMemo(() => buildDisplayData(diffResult.leftLines), [diffResult]);
  const leftGradient = useMemo(
    () => buildBgGradient(diffResult.leftLines, fontSize, lineHeight, theme),
    [diffResult, fontSize, lineHeight, theme],
  );

  // Right panel data
  const rightData = useMemo(() => buildDisplayData(diffResult.rightLines), [diffResult]);
  const rightGradient = useMemo(
    () => buildBgGradient(diffResult.rightLines, fontSize, lineHeight, theme),
    [diffResult, fontSize, lineHeight, theme],
  );

  const handleLeftChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      let realText: string;
      if (leftData.paddingIndices.size === 0) {
        realText = newText;
      } else {
        // padding 行を除去して実テキストに変換
        const lines = newText.split("\n");
        const realLines: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (leftData.paddingIndices.has(i) && lines[i] === "") continue;
          realLines.push(lines[i]);
        }
        realText = realLines.join("\n");
      }
      setEditText(realText);
      onMergeApply(realText, compareText);
    },
    [leftData.paddingIndices, onMergeApply, compareText],
  );

  return (
    <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Left panel (read-only, compare) */}
      <DiffPanel
        diffLines={diffResult.rightLines}
        displayData={rightData}
        gradient={rightGradient}
        mergeButtonIndices={mergeButtonIndices}
        hasMergeButtons={hasMergeButtons}
        side="left"
        readOnly
        onMerge={handleMergeBlock}
        fontSize={fontSize}
        lineHeight={lineHeight}
        theme={theme}
        t={t}
      />

      {/* Right panel (editable) */}
      <DiffPanel
        diffLines={diffResult.leftLines}
        displayData={leftData}
        gradient={leftGradient}
        mergeButtonIndices={new Map()}
        hasMergeButtons={false}
        side="right"
        readOnly={false}
        onChange={handleLeftChange}
        onMerge={handleMergeBlock}
        fontSize={fontSize}
        lineHeight={lineHeight}
        theme={theme}
        t={t}
      />
    </Box>
  );
}

// --- DiffPanel sub-component ---

interface DiffPanelProps {
  diffLines: DiffLine[];
  displayData: ReturnType<typeof buildDisplayData>;
  gradient: string;
  mergeButtonIndices: Map<number, number>;
  hasMergeButtons: boolean;
  side: "left" | "right";
  readOnly: boolean;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onMerge: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  t: (key: string) => string;
}

function DiffPanel({
  diffLines,
  displayData,
  gradient,
  mergeButtonIndices,
  hasMergeButtons,
  side,
  readOnly,
  onChange,
  onMerge,
  fontSize,
  lineHeight,
  theme,
  t,
}: DiffPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mergeGutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const { displayText, displayLines, lineNumbers } = displayData;
  const alignedCount = diffLines.length;
  const maxLineNum = diffLines.reduce((m, l) => Math.max(m, l.lineNumber ?? 0), 0);
  const digits = Math.max(3, String(maxLineNum).length + 1);

  const gradientStyle: React.CSSProperties | undefined =
    gradient && gradient !== "none"
      ? { backgroundImage: gradient, backgroundAttachment: "local" }
      : undefined;

  // ガターのスクロール同期
  useEffect(() => {
    const textarea = textareaRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !gutter) return;
    const mg = mergeGutterRef.current;
    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop;
      if (mg) mg.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, []);

  // ミラーで各行の高さを計測し、ガターに反映
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
  }, [displayText, fontSize, lineHeight]);

  const renderMergeGutter = (panelSide: "left" | "right") => (
    <Box
      ref={mergeGutterRef}
      sx={{
        width: 24,
        minWidth: 24,
        py: 2,
        m: 0,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {Array.from({ length: alignedCount }, (_, i) => {
        const blockId = mergeButtonIndices.get(i);
        return (
          <Box
            key={i}
            sx={{
              position: "relative",
              fontFamily: "monospace",
              fontSize: `${fontSize}px`,
              lineHeight,
              textAlign: "center",
            }}
          >
            {"\u00A0"}
            {blockId != null && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Tooltip
                  title={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                  placement={panelSide === "left" ? "right" : "left"}
                >
                  <IconButton
                    size="small"
                    aria-label={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                    onClick={() => onMerge(blockId, panelSide === "left" ? "left-to-right" : "right-to-left")}
                    sx={{ p: 0 }}
                  >
                    {panelSide === "left"
                      ? <ChevronRightIcon sx={{ fontSize: 16 }} />
                      : <ChevronLeftIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );

  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        borderLeft: side === "right" ? 1 : 0,
        borderColor: "divider",
        bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      }}
    >
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* 右パネル: マージガター（←）を行番号の左に配置 */}
        {side === "right" && hasMergeButtons && renderMergeGutter("right")}

        {/* 行番号ガター */}
        <Box
          ref={gutterRef}
          sx={{
            width: `${digits}ch`,
            minWidth: `${digits}ch`,
            py: 2,
            px: 1,
            m: 0,
            textAlign: "right",
            fontFamily: "monospace",
            fontSize: `${fontSize}px`,
            lineHeight,
            color: alpha(theme.palette.text.secondary, 0.6),
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          {lineNumbers.map((num, i) => (
            <div key={i}>{num || "\u00A0"}</div>
          ))}
        </Box>

        {/* Textarea + mirror */}
        <Box ref={textContainerRef} sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          {/* ミラー: 折り返し高さ計測用 */}
          <Box
            ref={mirrorRef}
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              visibility: "hidden",
              pointerEvents: "none",
              fontFamily: "monospace",
              fontSize: `${fontSize}px`,
              lineHeight,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              py: 2,
              pr: side === "left" && hasMergeButtons ? 0 : 2,
              pl: 1,
              boxSizing: "border-box",
            }}
          >
            {displayLines.map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
          </Box>

          <Box
            component="textarea"
            ref={textareaRef}
            value={displayText}
            onChange={onChange}
            readOnly={readOnly}
            spellCheck={false}
            style={gradientStyle}
            sx={{
              width: "100%",
              minHeight: "100%",
              py: 2,
              pr: side === "left" && hasMergeButtons ? 0 : 2,
              pl: 1,
              border: "none",
              outline: "none",
              boxShadow: "none",
              resize: "none",
              fontFamily: "monospace",
              fontSize: `${fontSize}px`,
              lineHeight,
              color: theme.palette.text.primary,
              bgcolor: "transparent",
              boxSizing: "border-box",
              "&:focus": {
                border: "none",
                outline: "none",
                boxShadow: "none",
              },
            }}
          />
        </Box>

        {/* 左パネル: マージガター（→）をテキストの右に配置 */}
        {side === "left" && hasMergeButtons && renderMergeGutter("left")}

      </Box>
    </Box>
  );
}
