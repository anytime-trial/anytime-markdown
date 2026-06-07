import React, { useCallback, useEffect,useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getErrorMain, getSuccessMain, getTextPrimary, getTextSecondary, useEditorSettingsContext, buildColorRuns, applyMerge, computeDiff, useIsDark, type DiffLine } from "@anytime-markdown/markdown-viewer";
import { alpha } from "@anytime-markdown/markdown-viewer/src/constants/colors";
import { IconButton } from "@anytime-markdown/markdown-viewer/src/ui/IconButton";
import { Tooltip } from "@anytime-markdown/markdown-viewer/src/ui/Tooltip";
import { ChevronLeftIcon, ChevronRightIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";

import styles from "./FullscreenDiffView.module.css";

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
  isDark: boolean,
): string {
  const lineColors: (string | null)[] = [];
  for (const line of lines) {
    switch (line.type) {
      case "added":
      case "modified-new":
        lineColors.push(alpha(getSuccessMain(isDark), 0.18));
        break;
      case "removed":
      case "modified-old":
        lineColors.push(alpha(getErrorMain(isDark), 0.18));
        break;
      default:
        lineColors.push(null);
    }
  }
  if (lineColors.length === 0) return "none";

  const runs = buildColorRuns(lineColors);

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
    lineNumbers.push(dl.lineNumber == null ? "" : String(dl.lineNumber));
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
}: Readonly<FullscreenDiffViewProps>) {
  const isDark = useIsDark();
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
    () => buildBgGradient(diffResult.leftLines, fontSize, lineHeight, isDark),
    [diffResult, fontSize, lineHeight, isDark],
  );

  // Right panel data
  const rightData = useMemo(() => buildDisplayData(diffResult.rightLines), [diffResult]);
  const rightGradient = useMemo(
    () => buildBgGradient(diffResult.rightLines, fontSize, lineHeight, isDark),
    [diffResult, fontSize, lineHeight, isDark],
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
    <div className={styles.diffRoot}>
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
        isDark={isDark}
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
        isDark={isDark}
        t={t}
      />
    </div>
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
  isDark: boolean;
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
  isDark,
  t,
}: Readonly<DiffPanelProps>) {
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
    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop;
      // マージガターは差分が出てから動的にマウントされるため、毎回 ref を読み直す
      // （マウント時にキャプチャすると後から現れたガターが追従しない）
      const mg = mergeGutterRef.current;
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

  const noPadRight = side === "left" && hasMergeButtons;

  // font-family は .mergeGutterRow（CSS）側。動的値のみを 1 オブジェクトに集約し map 内の再生成を避ける。
  const mergeGutterRowStyle: React.CSSProperties = { fontSize: `${fontSize}px`, lineHeight };

  const renderMergeGutter = (panelSide: "left" | "right") => (
    <div
      ref={mergeGutterRef}
      className={styles.mergeGutter}
    >
      {Array.from({ length: alignedCount }, (_, i) => {
        const blockId = mergeButtonIndices.get(i);
        return (
          <div
            key={i}
            className={styles.mergeGutterRow}
            style={mergeGutterRowStyle}
          >
            {" "}
            {blockId != null && (
              <div className={styles.mergeGutterOverlay}>
                <Tooltip
                  title={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                  placement={panelSide === "left" ? "right" : "left"}
                >
                  <IconButton
                    size="small"
                    aria-label={panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft")}
                    onClick={() => onMerge(blockId, panelSide === "left" ? "left-to-right" : "right-to-left")}
                    style={{ padding: 0 }}
                  >
                    {panelSide === "left"
                      ? <ChevronRightIcon fontSize={16} />
                      : <ChevronLeftIcon fontSize={16} />}
                  </IconButton>
                </Tooltip>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className={[styles.panel, side === "right" ? styles.panelRight : undefined].filter(Boolean).join(" ")}
      style={{
        borderColor: getDivider(isDark),
        backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      }}
    >
      <div className={styles.panelInner}>
        {/* 右パネル: マージガター（←）を行番号の左に配置 */}
        {side === "right" && hasMergeButtons && renderMergeGutter("right")}

        {/* 行番号ガター */}
        <div
          ref={gutterRef}
          className={styles.gutter}
          style={{
            width: `${digits}ch`,
            minWidth: `${digits}ch`,
            fontSize: `${fontSize}px`,
            lineHeight,
            color: alpha(getTextSecondary(isDark), 0.6),
          }}
        >
          {lineNumbers.map((num, i) => (
            <div key={`ln-${num ?? "empty"}-${i}`}>{num || " "}</div>
          ))}
        </div>

        {/* Textarea + mirror */}
        <div ref={textContainerRef} className={styles.textContainer}>
          {/* ミラー: 折り返し高さ計測用 */}
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className={[styles.mirror, noPadRight ? styles.mirrorNoPadRight : undefined].filter(Boolean).join(" ")}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight,
            }}
          >
            {displayLines.map((line, i) => (
              <div key={`mirror-${i}-${line.slice(0, 16)}`}>{line || " "}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={onChange}
            readOnly={readOnly}
            spellCheck={false}
            className={[styles.diffTextarea, noPadRight ? styles.diffTextareaNoPadRight : undefined].filter(Boolean).join(" ")}
            style={{
              ...gradientStyle,
              fontSize: `${fontSize}px`,
              lineHeight,
              color: getTextPrimary(isDark),
            }}
          />
        </div>

        {/* 左パネル: マージガター（→）をテキストの右に配置 */}
        {side === "left" && hasMergeButtons && renderMergeGutter("left")}

      </div>
    </div>
  );
}
