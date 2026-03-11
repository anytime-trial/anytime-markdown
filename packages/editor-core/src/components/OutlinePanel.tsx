"use client";

import CategoryIcon from "@mui/icons-material/Category";
import CodeIcon from "@mui/icons-material/Code";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import GridOnIcon from "@mui/icons-material/GridOn";
import ImageIcon from "@mui/icons-material/Image";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SchemaIcon from "@mui/icons-material/Schema";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import {
  Box,
  Collapse,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import React, { useCallback, useMemo,useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import MermaidIcon from "../icons/MermaidIcon";
import type { HeadingItem, OutlineKind, TranslationFn } from "../types";

const MANUAL_NUMBER_RE = /^\d+(\.\d+)*\.?\s/;

const blockIcon: Record<Exclude<OutlineKind, "heading">, React.ReactElement> = {
  codeBlock: <CodeIcon sx={{ fontSize: 14 }} />,
  table: <GridOnIcon sx={{ fontSize: 14 }} />,
  image: <ImageIcon sx={{ fontSize: 14 }} />,
  plantuml: <SchemaIcon sx={{ fontSize: 14 }} />,
  mermaid: <MermaidIcon sx={{ fontSize: 14 }} />,
};

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
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
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
  onHeadingDragEnd,
  onOutlineDelete,
  t,
}: OutlinePanelProps) {
  const theme = useTheme();
  const [showBlocks, setShowBlocks] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // セクション番号マップ（見出しの pos → "1.2.3. "）
  // 自動判定: 見出しに手動番号が多い場合は非表示
  const sectionNumberMap = useMemo(() => {
    const headingItems = headings.filter((h) => h.kind === "heading");
    if (headingItems.length < 2) return null;
    const numberedCount = headingItems.filter((h) => MANUAL_NUMBER_RE.test(h.text)).length;
    if (numberedCount >= headingItems.length / 2) return null;
    const map = new Map<number, string>();
    const counters = [0, 0, 0, 0, 0]; // h1-h5
    for (const h of headingItems) {
      const level = h.level - 1; // 0-indexed
      counters[level]++;
      for (let i = level + 1; i < 5; i++) counters[i] = 0;
      map.set(h.pos, counters.slice(0, level + 1).join(".") + ". ");
    }
    return map;
  }, [headings]);

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
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderRight: "none",
          overflow: "auto",
          maxHeight: editorHeight,
          bgcolor: theme.palette.mode === "dark" ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
        }}
      >
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
            <Typography
              variant="caption"
              component="h2"
              sx={{
                fontWeight: 700,
                color: theme.palette.text.secondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("outline")}
            </Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              <Tooltip title={t("outlineShowBlocks")}>
                <IconButton
                  aria-label={t("outlineShowBlocks")}
                  aria-pressed={showBlocks}
                  size="small"
                  onClick={() => setShowBlocks((v) => !v)}
                  sx={{ p: 0.5, color: showBlocks ? "primary.main" : "text.secondary" }}
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
          {headings.length === 0 ? (
            <Typography variant="body2" sx={{ color: theme.palette.text.disabled, fontSize: "0.8rem" }}>
              {t("noHeadings")}
            </Typography>
          ) : (
            <>
              {headings.map((h, idx) => {
                const isHeading = h.kind === "heading";
                const isHidden = hiddenByFold.has(idx) || (!isHeading && !showBlocks);
                const isFolded = isHeading && foldedIndices.has(h.headingIndex ?? -1);
                const hoIdx = isHeading ? toHeadingOnlyIdx(idx) : -1;
                const isDragging = isHeading && hoIdx === dragIdx;
                const isDropTarget = isHeading && hoIdx === dropIdx && hoIdx !== dragIdx;
                // ブロック要素は直近の見出しレベルに合わせてインデント
                let blockPl = 1;
                if (!isHeading) {
                  for (let i = idx - 1; i >= 0; i--) {
                    if (headings[i].kind === "heading") {
                      // 見出しのpl + 折りたたみボタン幅(p:0.5*2 + icon16px + mr:0.25 ≈ 3.25)
                      blockPl = (headings[i].level - 1) * 1.5 + 3.25;
                      break;
                    }
                  }
                }
                return (
                  <Collapse key={`${h.pos}-${idx}`} in={!isHidden} unmountOnExit timeout={150} sx={{ "@media (prefers-reduced-motion: reduce)": { transition: "none !important" } }}>
                  <Box
                    draggable={isHeading && !!onHeadingDragEnd}
                    onDragStart={isHeading && onHeadingDragEnd ? (e) => handleDragStart(e, idx) : undefined}
                    onDragOver={isHeading && onHeadingDragEnd ? (e) => handleDragOver(e, idx) : undefined}
                    onDrop={isHeading && onHeadingDragEnd ? (e) => handleDrop(e, idx) : undefined}
                    onDragEnd={isHeading && onHeadingDragEnd ? handleDragEnd : undefined}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      pl: isHeading ? (h.level - 1) * 1.5 : blockPl,
                      py: 0.25,
                      borderRadius: 0.5,
                      opacity: isDragging ? 0.4 : 1,
                      borderTop: isDropTarget ? `2px solid ${theme.palette.primary.main}` : "2px solid transparent",
                      "&:hover": {
                        bgcolor: theme.palette.action.hover,
                      },
                      "& .outline-move-btns": { opacity: 0 },
                      "&:hover .outline-move-btns, & .outline-move-btns:focus-within": { opacity: 1 },
                      cursor: isHeading && onHeadingDragEnd ? "grab" : undefined,
                    }}
                  >
                    {isHeading ? (
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); toggleFold(h.headingIndex ?? -1); }}
                        aria-expanded={!isFolded}
                        aria-label={`${isFolded ? t("expandSection") : t("collapseSection")} ${h.text || "(empty)"}`}
                        sx={{
                          p: 0.5,
                          mr: 0.25,
                          color: theme.palette.text.secondary,
                          flexShrink: 0,
                        }}
                      >
                        <KeyboardArrowDownIcon sx={{ fontSize: 16, transition: "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, transform: isFolded ? "rotate(-90deg)" : "rotate(0deg)" }} />
                      </IconButton>
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", mr: 0.5, color: theme.palette.text.disabled, flexShrink: 0 }}>
                        {blockIcon[h.kind as keyof typeof blockIcon]}
                      </Box>
                    )}
                    <Tooltip title={h.text || ""} enterDelay={400} placement="bottom-start">
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOutlineClick(h.pos)}
                        {...(isHeading && onHeadingDragEnd ? { "aria-roledescription": t("draggableHeading") } : {})}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOutlineClick(h.pos); }
                          if (isHeading && onHeadingDragEnd && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                            e.preventDefault();
                            const targetIdx = e.key === "ArrowUp" ? hoIdx - 1 : hoIdx + 1;
                            if (targetIdx >= 0 && targetIdx < headingOnlyIndices.length) {
                              onHeadingDragEnd(hoIdx, targetIdx);
                            }
                          }
                        }}
                        sx={{
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 400,
                          color: isFolded ? theme.palette.text.disabled : theme.palette.text.primary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: 1,
                          minWidth: 0,
                          borderRadius: 0.5,
                          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
                        }}
                      >
                        {sectionNumberMap?.get(h.pos) ?? ""}{h.text || "(empty)"}
                      </Box>
                    </Tooltip>
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
                  </Collapse>
                );
              })}
              {/* 末尾ドロップゾーン */}
              <Box
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropIdx(-1); }}
                onDragLeave={() => { if (dropIdx === -1) setDropIdx(null); }}
                onDrop={(e) => handleDrop(e, -1)}
                sx={{
                  height: 16,
                  borderTop: dropIdx === -1 && dragIdx !== null ? `2px solid ${theme.palette.primary.main}` : "2px solid transparent",
                }}
              />
            </>
          )}
        </Box>
      </Paper>
      {/* Resize handle */}
      <Box
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
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
          "&::after": {
            content: '""',
            width: 2,
            height: 32,
            borderRadius: 1,
            bgcolor: "divider",
          },
        }}
      />
    </>
  );
}

export default React.memo(OutlinePanel);
