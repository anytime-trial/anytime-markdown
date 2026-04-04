"use client";

import CategoryIcon from "@mui/icons-material/Category";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import GridOnIcon from "@mui/icons-material/GridOn";
import ImageIcon from "@mui/icons-material/Image";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SchemaIcon from "@mui/icons-material/Schema";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import {
  Box,
  ButtonBase,
  Collapse,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import React, { useCallback, useMemo,useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getPrimaryMain, getTextDisabled, getTextPrimary, getTextSecondary } from "../constants/colors";
import { OUTLINE_FONT_SIZE, PANEL_HEADER_MIN_HEIGHT } from "../constants/dimensions";
import MermaidIcon from "../icons/MermaidIcon";
import type { HeadingItem, OutlineKind, TranslationFn } from "../types";

const blockIcon: Record<Exclude<OutlineKind, "heading">, React.ReactElement> = {
  codeBlock: <CodeIcon sx={{ fontSize: 14 }} />,
  table: <GridOnIcon sx={{ fontSize: 14 }} />,
  image: <ImageIcon sx={{ fontSize: 14 }} />,
  plantuml: <SchemaIcon sx={{ fontSize: 14 }} />,
  mermaid: <MermaidIcon sx={{ fontSize: 14 }} />,
};

/** Compute left padding for block (non-heading) items based on nearest preceding heading */
function computeBlockPadding(idx: number, headings: HeadingItem[]): number {
  for (let i = idx - 1; i >= 0; i--) {
    if (headings[i].kind === "heading") {
      return (headings[i].level - 1) * 1.5 + 3.25;
    }
  }
  return 1;
}

/** Build drag event handlers for a heading item (returns empty object for non-headings) */
function buildDragProps(
  isHeading: boolean,
  onHeadingDragEnd: ((fromIdx: number, toIdx: number) => void) | undefined,
  idx: number,
  handleDragStart: (e: React.DragEvent, idx: number) => void,
  handleDragOver: (e: React.DragEvent, idx: number) => void,
  handleDrop: (e: React.DragEvent, idx: number) => void,
  handleDragEnd: () => void,
): Record<string, unknown> {
  if (!isHeading || !onHeadingDragEnd) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, idx),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, idx),
    onDrop: (e: React.DragEvent) => handleDrop(e, idx),
    onDragEnd: handleDragEnd,
  };
}

/** Fold toggle button for heading items */
const HeadingFoldButton = React.memo(function HeadingFoldButton({
  isFolded, headingIndex, text, isDark, toggleFold, t,
}: {
  isFolded: boolean; headingIndex: number; text: string; isDark: boolean;
  toggleFold: (idx: number) => void; t: TranslationFn;
}) {
  return (
    <IconButton
      size="small"
      onClick={(e) => { e.stopPropagation(); toggleFold(headingIndex); }}
      aria-expanded={!isFolded}
      aria-label={`${isFolded ? t("expandSection") : t("collapseSection")} ${text || "(empty)"}`}
      sx={{ p: 0.5, mr: 0.25, color: getTextSecondary(isDark), flexShrink: 0 }}
    >
      <KeyboardArrowDownIcon sx={{ fontSize: 16, transition: "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, transform: isFolded ? "rotate(-90deg)" : "rotate(0deg)" }} />
    </IconButton>
  );
});

/** Block element icon indicator */
function BlockIconIndicator({ kind, isDark }: Readonly<{ kind: string; isDark: boolean }>) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", mr: 0.5, color: getTextDisabled(isDark), flexShrink: 0 }}>
      {blockIcon[kind as keyof typeof blockIcon]}
    </Box>
  );
}

/** Handle Alt+Arrow keyboard shortcut for reordering headings */
function handleHeadingKeyDown(
  e: React.KeyboardEvent,
  isHeading: boolean,
  onHeadingDragEnd: ((fromIdx: number, toIdx: number) => void) | undefined,
  hoIdx: number,
  headingOnlyIndices: number[],
) {
  if (!isHeading || !onHeadingDragEnd || !e.altKey) return;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const targetIdx = e.key === "ArrowUp" ? hoIdx - 1 : hoIdx + 1;
  if (targetIdx >= 0 && targetIdx < headingOnlyIndices.length) {
    onHeadingDragEnd(hoIdx, targetIdx);
  }
}

/** Individual outline item (heading or block element) */
const OutlineItem = React.memo(function OutlineItem({
  h, idx, isHeading, isFolded, hoIdx, isDragging, isDropTarget, blockPl, isDark,
  toggleFold, handleOutlineClick, onHeadingDragEnd, onOutlineDelete,
  handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  headingOnlyIndices, t,
}: {
  h: HeadingItem;
  idx: number;
  isHeading: boolean;
  isFolded: boolean;
  hoIdx: number;
  isDragging: boolean;
  isDropTarget: boolean;
  blockPl: number;
  isDark: boolean;
  toggleFold: (idx: number) => void;
  handleOutlineClick: (pos: number) => void;
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
  handleDragStart: (e: React.DragEvent, idx: number) => void;
  handleDragOver: (e: React.DragEvent, idx: number) => void;
  handleDrop: (e: React.DragEvent, idx: number) => void;
  handleDragEnd: () => void;
  headingOnlyIndices: number[];
  t: TranslationFn;
}) {
  const dragProps = buildDragProps(isHeading, onHeadingDragEnd, idx, handleDragStart, handleDragOver, handleDrop, handleDragEnd);
  const isDraggable = isHeading && !!onHeadingDragEnd;

  return (
    <Box
      {...dragProps}
      sx={{
        display: "flex",
        alignItems: "center",
        pl: isHeading ? (h.level - 1) * 1.5 : blockPl,
        py: 0.25,
        borderRadius: 0.5,
        opacity: isDragging ? 0.4 : 1,
        borderTop: isDropTarget ? `2px solid ${getPrimaryMain(isDark)}` : "2px solid transparent",
        "&:hover": { bgcolor: getActionHover(isDark) },
        "& .outline-move-btns": { opacity: 0 },
        "&:hover .outline-move-btns, & .outline-move-btns:focus-within": { opacity: 1 },
        cursor: isDraggable ? "grab" : undefined,
      }}
    >
      {isHeading ? (
        <HeadingFoldButton isFolded={isFolded} headingIndex={h.headingIndex ?? -1} text={h.text} isDark={isDark} toggleFold={toggleFold} t={t} />
      ) : (
        <BlockIconIndicator kind={h.kind} isDark={isDark} />
      )}
      <ButtonBase
        component="div"
        onClick={() => handleOutlineClick(h.pos)}
        {...(isDraggable ? { "aria-roledescription": t("draggableHeading") } : {})}
        onKeyDown={(e: React.KeyboardEvent) => handleHeadingKeyDown(e, isHeading, onHeadingDragEnd, hoIdx, headingOnlyIndices)}
        sx={{
          cursor: "pointer", fontSize: OUTLINE_FONT_SIZE, fontWeight: 400,
          color: isFolded ? getTextDisabled(isDark) : getTextPrimary(isDark),
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          flex: 1, minWidth: 0, borderRadius: 0.5, justifyContent: "flex-start",
          "&:focus-visible": { outline: "2px solid", outlineColor: getPrimaryMain(isDark), outlineOffset: 1 },
        }}
      >
        {h.text || "(empty)"}
      </ButtonBase>
      <Box className="outline-move-btns" sx={{ display: "flex", flexShrink: 0, transition: "opacity 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}>
        {onOutlineDelete && (
          <Tooltip title={t("delete")} placement="top">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onOutlineDelete(h.pos, h.kind); }}
              aria-label={`${t("delete")} ${h.text || ""}`}
              sx={{ p: 0.5 }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
});

/** Outline heading list with fold/unfold, drag & drop, and block element display */
const OutlineItemList = React.memo(function OutlineItemList({
  headings, foldedIndices, hiddenByFold, showBlocks, isDark,
  toggleFold, handleOutlineClick, onHeadingDragEnd, onOutlineDelete,
  handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  headingOnlyIndices, toHeadingOnlyIdx, dragIdx, dropIdx, t,
}: {
  headings: HeadingItem[];
  foldedIndices: Set<number>;
  hiddenByFold: Set<number>;
  showBlocks: boolean;
  isDark: boolean;
  toggleFold: (idx: number) => void;
  handleOutlineClick: (pos: number) => void;
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
  handleDragStart: (e: React.DragEvent, idx: number) => void;
  handleDragOver: (e: React.DragEvent, idx: number) => void;
  handleDrop: (e: React.DragEvent, idx: number) => void;
  handleDragEnd: () => void;
  headingOnlyIndices: number[];
  toHeadingOnlyIdx: (arrIdx: number) => number;
  dragIdx: number | null;
  dropIdx: number | null;
  t: TranslationFn;
}) {
  return (
    <>
      {headings.map((h, idx) => {
        const isHeading = h.kind === "heading";
        const isHidden = hiddenByFold.has(idx) || (!isHeading && !showBlocks);
        const isFolded = isHeading && foldedIndices.has(h.headingIndex ?? -1);
        const hoIdx = isHeading ? toHeadingOnlyIdx(idx) : -1;
        const isDragging = isHeading && hoIdx === dragIdx;
        const isDropTarget = isHeading && hoIdx === dropIdx && hoIdx !== dragIdx;
        const blockPl = isHeading ? 0 : computeBlockPadding(idx, headings);
        return (
          <Collapse key={`${h.pos}-${idx}`} in={!isHidden} unmountOnExit timeout={150} sx={{ "@media (prefers-reduced-motion: reduce)": { transition: "none !important" } }}>
            <OutlineItem
              h={h} idx={idx} isHeading={isHeading} isFolded={isFolded}
              hoIdx={hoIdx} isDragging={isDragging} isDropTarget={isDropTarget}
              blockPl={blockPl} isDark={isDark}
              toggleFold={toggleFold} handleOutlineClick={handleOutlineClick}
              onHeadingDragEnd={onHeadingDragEnd} onOutlineDelete={onOutlineDelete}
              handleDragStart={handleDragStart} handleDragOver={handleDragOver}
              handleDrop={handleDrop} handleDragEnd={handleDragEnd}
              headingOnlyIndices={headingOnlyIndices} t={t}
            />
          </Collapse>
        );
      })}
      {/* 末尾ドロップゾーン */}
      <Box
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragLeave={() => { /* handled by parent */ }}
        onDrop={(e) => handleDrop(e, -1)}
        sx={{
          height: 16,
          borderTop: dropIdx === -1 && dragIdx !== null ? `2px solid ${getPrimaryMain(isDark)}` : "2px solid transparent",
        }}
      />
    </>
  );
});

interface OutlinePanelProps {
  outlineWidth: number;
  setOutlineWidth: React.Dispatch<React.SetStateAction<number>>;
  editorHeight: number;
  headings: HeadingItem[];
  foldedIndices: Set<number>;
  hiddenByFold: Set<number>;
  foldAll: () => void;
  unfoldAll: () => void;
  toggleFold: (idx: number) => void;
  handleOutlineClick: (pos: number) => void;
  handleOutlineResizeStart: (e: React.MouseEvent) => void;
  hideResize?: boolean;
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
  onInsertSectionNumbers?: () => void;
  onRemoveSectionNumbers?: () => void;
  t: TranslationFn;
}

export function OutlinePanel({
  outlineWidth,
  setOutlineWidth,
  editorHeight,
  headings,
  foldedIndices,
  hiddenByFold,
  foldAll,
  unfoldAll,
  toggleFold,
  handleOutlineClick,
  handleOutlineResizeStart,
  hideResize,
  onHeadingDragEnd,
  onOutlineDelete,
  onInsertSectionNumbers,
  onRemoveSectionNumbers,
  t,
}: Readonly<OutlinePanelProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [showBlocks, setShowBlocks] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // heading のみのインデックスマップ (headings 配列 idx → headingOnly idx)
  const headingOnlyIndices = useMemo(
    () => headings.map((h, i) => (h.kind === "heading" ? i : -1)).filter((i) => i !== -1),
    [headings]
  );

  const toHeadingOnlyIdx = useCallback(
    (arrIdx: number) => headingOnlyIndices.indexOf(arrIdx),
    [headingOnlyIndices]
  );


  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      const hoIdx = toHeadingOnlyIdx(idx);
      if (hoIdx === -1) return;
      setDragIdx(hoIdx);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(hoIdx));
    },
    [toHeadingOnlyIdx]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const hoIdx = toHeadingOnlyIdx(idx);
      if (hoIdx === -1 || hoIdx === dragIdx) {
        setDropIdx(null);
        return;
      }
      setDropIdx(hoIdx);
    },
    [dragIdx, toHeadingOnlyIdx]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      const fromIdx = dragIdx;
      const toIdx = idx === -1 ? -1 : toHeadingOnlyIdx(idx);
      setDragIdx(null);
      setDropIdx(null);
      if (fromIdx === null || toIdx === fromIdx) return;
      onHeadingDragEnd?.(fromIdx, toIdx);
    },
    [dragIdx, toHeadingOnlyIdx, onHeadingDragEnd]
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropIdx(null);
  }, []);

  return (
    <>
      <Paper
        variant="outlined"
        role="navigation"
        aria-label={t("outlineNavigation")}
        sx={{
          width: outlineWidth,
          minWidth: outlineWidth,
          maxWidth: outlineWidth,
          flex: "0 0 auto",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderRight: "none",
          overflow: "auto",
          maxHeight: editorHeight,
          bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1, minHeight: PANEL_HEADER_MIN_HEIGHT, borderBottom: 1, borderColor: getDivider(isDark) }}>
            <Typography
              id="outline-panel-title"
              variant="subtitle2"
              component="h2"
              sx={{
                fontWeight: 700,
                flex: 1,
              }}
            >
              {t("outline")}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              {onInsertSectionNumbers && (
                <Tooltip title={t("insertSectionNumbers")}>
                  <IconButton
                    aria-label={t("insertSectionNumbers")}
                    size="small"
                    onClick={onInsertSectionNumbers}
                    sx={{ p: 0.5 }}
                  >
                    <FormatListNumberedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {onRemoveSectionNumbers && (
                <Tooltip title={t("removeSectionNumbers")}>
                  <IconButton
                    aria-label={t("removeSectionNumbers")}
                    size="small"
                    onClick={onRemoveSectionNumbers}
                    sx={{ p: 0.5 }}
                  >
                    <FormatListBulletedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t("outlineShowBlocks")}>
                <IconButton
                  aria-label={t("outlineShowBlocks")}
                  aria-pressed={showBlocks}
                  size="small"
                  onClick={() => setShowBlocks((v) => !v)}
                  sx={{ p: 0.5, color: showBlocks ? getPrimaryMain(isDark) : getTextSecondary(isDark) }}
                >
                  <CategoryIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {headingOnlyIndices.length > 0 && (
                <Tooltip title={foldedIndices.size > 0 ? t("unfoldAll") : t("foldAll")}>
                  <IconButton
                    aria-label={foldedIndices.size > 0 ? t("unfoldAll") : t("foldAll")}
                    size="small"
                    onClick={foldedIndices.size > 0 ? unfoldAll : foldAll}
                    sx={{ p: 0.5 }}
                  >
                    {foldedIndices.size > 0 ? <UnfoldMoreIcon sx={{ fontSize: 16 }} /> : <UnfoldLessIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
          <Box sx={{ p: 1 }}>
          {headings.length === 0 ? (
            <Typography variant="body2" sx={{ color: getTextDisabled(isDark), fontSize: OUTLINE_FONT_SIZE }}>
              {t("noHeadings")}
            </Typography>
          ) : (
            <OutlineItemList
              headings={headings} foldedIndices={foldedIndices} hiddenByFold={hiddenByFold}
              showBlocks={showBlocks} isDark={isDark} toggleFold={toggleFold}
              handleOutlineClick={handleOutlineClick} onHeadingDragEnd={onHeadingDragEnd}
              onOutlineDelete={onOutlineDelete} handleDragStart={handleDragStart}
              handleDragOver={handleDragOver} handleDrop={handleDrop} handleDragEnd={handleDragEnd}
              headingOnlyIndices={headingOnlyIndices} toHeadingOnlyIdx={toHeadingOnlyIdx}
              dragIdx={dragIdx} dropIdx={dropIdx} t={t}
            />
          )}
          </Box>
        </Box>
      </Paper>
      {/* Resize handle */}
      {!hideResize && <Box
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t("resizeOutlinePanel")}
        aria-valuenow={outlineWidth}
        aria-valuemin={150}
        aria-valuemax={500}
        onMouseDown={handleOutlineResizeStart}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); setOutlineWidth((w) => Math.min(500, w + 20)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); setOutlineWidth((w) => Math.max(150, w - 20)); }
        }}
        sx={{
          width: 6,
          cursor: "col-resize",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "&:hover": { bgcolor: getActionHover(isDark) },
          "&:focus-visible": { outline: "2px solid", outlineColor: getPrimaryMain(isDark) },
          "&::after": {
            content: '""',
            width: 2,
            height: 32,
            borderRadius: 1,
            bgcolor: getDivider(isDark),
          },
        }}
      />}
    </>
  );
}

export default React.memo(OutlinePanel);
