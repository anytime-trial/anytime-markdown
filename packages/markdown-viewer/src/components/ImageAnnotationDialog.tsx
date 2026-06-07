"use client";

import { AutoFixOffIcon, CancelIcon, CircleOutlinedIcon, CloseIcon, DeleteOutlineIcon, HorizontalRuleIcon, RectangleOutlinedIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/TextField";
import { Tooltip } from "../ui/Tooltip";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import { useTheme } from "@mui/material/styles";
import React, { useCallback, useRef, useState } from "react";

import { getActionHover, getBgPaper, getDivider, getPrimaryMain, getTextSecondary } from "../constants/colors";
import { BADGE_NUMBER_FONT_SIZE, PANEL_INPUT_FONT_SIZE, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import type { AnnotationTool,ImageAnnotation } from "../types/imageAnnotation";
import { ANNOTATION_COLORS, generateAnnotationId } from "../types/imageAnnotation";
import { Text } from "../ui/Text";
import styles from "./ImageAnnotationDialog.module.css";

interface ImageAnnotationDialogProps {
  open: boolean;
  onClose: () => void;
  src: string;
  annotations: ImageAnnotation[];
  onSave: (annotations: ImageAnnotation[]) => void;
  t: (key: string) => string;
}

function toPercent(e: React.MouseEvent, svgRef: React.RefObject<SVGSVGElement | null>): { x: number; y: number } | null {
  const svg = svgRef.current;
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

function renderAnnotation(
  a: ImageAnnotation,
  index: number,
  selected: boolean,
  onClick?: (id: string) => void,
) {
  const stroke = a.color;
  const strokeWidth = selected ? 3 : 2;
  const fill = "none";
  const cursor = onClick ? "pointer" : "default";
  const handleClick = onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(a.id); } : undefined;
  const opacity = selected ? 1 : 0.8;

  // 番号バッジの位置
  const badgeX = Math.min(a.x1, a.x2);
  const badgeY = Math.min(a.y1, a.y2);

  return (
    <g key={a.id} opacity={opacity}>
      {a.type === "rect" && (
        <rect
          x={Math.min(a.x1, a.x2)} y={Math.min(a.y1, a.y2)}
          width={Math.abs(a.x2 - a.x1)} height={Math.abs(a.y2 - a.y1)}
          stroke={stroke} strokeWidth={strokeWidth} fill={fill}
          style={{ cursor }} onClick={handleClick}
        />
      )}
      {a.type === "circle" && (
        <ellipse
          cx={(a.x1 + a.x2) / 2} cy={(a.y1 + a.y2) / 2}
          rx={Math.abs(a.x2 - a.x1) / 2} ry={Math.abs(a.y2 - a.y1) / 2}
          stroke={stroke} strokeWidth={strokeWidth} fill={fill}
          style={{ cursor }} onClick={handleClick}
        />
      )}
      {a.type === "line" && (
        <line
          x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
          stroke={stroke} strokeWidth={strokeWidth}
          style={{ cursor }} onClick={handleClick}
        />
      )}
      {/* 番号バッジ */}
      <circle cx={badgeX} cy={badgeY} r={2.5} fill={stroke} onClick={handleClick} style={{ cursor }} />
      <text x={badgeX} y={badgeY} textAnchor="middle" dominantBaseline="central" fontSize={3} fill="white" fontWeight="bold" style={{ pointerEvents: "none" }}>
        {index + 1}
      </text>
    </g>
  );
}

export function ImageAnnotationDialog({
  open, onClose, src, annotations, onSave, t,
}: Readonly<ImageAnnotationDialogProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const [tool, setTool] = useState<AnnotationTool>("rect");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [items, setItems] = useState<ImageAnnotation[]>(annotations);
  const [drawing, setDrawing] = useState<{ x1: number; y1: number } | null>(null);
  const [preview, setPreview] = useState<{ x2: number; y2: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === "eraser") return;
    setSelectedId(null);
    const pt = toPercent(e, svgRef);
    if (pt) setDrawing({ x1: pt.x, y1: pt.y });
  }, [tool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    const pt = toPercent(e, svgRef);
    if (pt) setPreview({ x2: pt.x, y2: pt.y });
  }, [drawing]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing || tool === "eraser") { setDrawing(null); setPreview(null); return; }
    const pt = toPercent(e, svgRef);
    if (!pt) { setDrawing(null); setPreview(null); return; }
    if (Math.abs(pt.x - drawing.x1) < 1 && Math.abs(pt.y - drawing.y1) < 1) {
      setDrawing(null); setPreview(null); return;
    }
    const id = generateAnnotationId();
    const newItem: ImageAnnotation = {
      id,
      type: tool,
      x1: drawing.x1, y1: drawing.y1,
      x2: pt.x, y2: pt.y,
      color,
      comment: "",
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(id);
    setDrawing(null);
    setPreview(null);
  }, [drawing, tool, color]);

  const handleShapeClick = useCallback((id: string) => {
    if (tool === "eraser") {
      setItems(prev => prev.filter(a => a.id !== id));
      if (selectedId === id) setSelectedId(null);
    } else {
      setSelectedId(id);
    }
  }, [tool, selectedId]);

  const handleCommentChange = useCallback((id: string, comment: string) => {
    setItems(prev => prev.map(a => a.id === id ? { ...a, comment } : a));
  }, []);

  const handleDeleteItem = useCallback((id: string) => {
    setItems(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const handleClose = useCallback(() => {
    onSave(items);
    onClose();
  }, [items, onSave, onClose]);

  if (!open) return null;

  const previewAnnotation = drawing && preview ? {
    id: "_preview",
    type: tool as "rect" | "circle" | "line",
    x1: drawing.x1, y1: drawing.y1,
    x2: preview.x2, y2: preview.y2,
    color,
  } : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        flexDirection: "column",
        backgroundColor: getBgPaper(isDark),
      }}
    >
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: `1px solid ${getDivider(isDark)}`, flexShrink: 0 }}>
        <ToggleButtonGroup value={tool} exclusive onChange={(_, v) => { if (v) setTool(v); }} size="small">
          <ToggleButton value="rect" aria-label={t("annotationRect")}>
            <Tooltip title={t("annotationRect")}><RectangleOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="circle" aria-label={t("annotationCircle")}>
            <Tooltip title={t("annotationCircle")}><CircleOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="line" aria-label={t("annotationLine")}>
            <Tooltip title={t("annotationLine")}><HorizontalRuleIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="eraser" aria-label={t("annotationEraser")}>
            <Tooltip title={t("annotationEraser")}><AutoFixOffIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {ANNOTATION_COLORS.map(c => (
            <IconButton
              key={c.value}
              size="small"
              onClick={() => setColor(c.value)}
              aria-label={c.label}
              className={styles.colorSwatch}
              style={{
                backgroundColor: c.value,
                borderColor: color === c.value ? getPrimaryMain(isDark) : getDivider(isDark),
              }}
            />
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Tooltip title={t("undo")}>
          <span>
            <IconButton size="small" disabled={items.length === 0} onClick={() => { setItems(prev => prev.slice(0, -1)); setSelectedId(null); }}>
              <CancelIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <IconButton size="small" onClick={handleClose} aria-label={t("close")}>
          <CloseIcon />
        </IconButton>
      </div>

      {/* Main: Canvas + Comment Panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Canvas */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            padding: 16,
            cursor: "crosshair",
          }}
        >
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", userSelect: "none" }}
            />
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {items.map((a, i) => renderAnnotation(a, i, a.id === selectedId, handleShapeClick))}
              {previewAnnotation && renderAnnotation(previewAnnotation, items.length, false)}
            </svg>
          </div>
        </div>

        {/* Comment Panel */}
        <div
          style={{
            width: 280,
            borderLeft: `1px solid ${getDivider(isDark)}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${getDivider(isDark)}` }}>
            <Text variant="subtitle2" style={{ fontWeight: 700 }}>
              {t("commentPanel")} ({items.length})
            </Text>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
            {items.length === 0 && (
              <Text variant="caption" style={{ color: getTextSecondary(isDark), display: "block", textAlign: "center", padding: "32px 0" }}>
                {t("annotate")}
              </Text>
            )}
            {items.map((a, i) => {
              let annotationLabel: string;
              if (a.type === "rect") annotationLabel = t("annotationRect");
              else if (a.type === "circle") annotationLabel = t("annotationCircle");
              else annotationLabel = t("annotationLine");
              return (
              <div
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={styles.annotationItem}
                style={{
                  marginBottom: 8,
                  padding: 8,
                  border: `1px solid ${a.id === selectedId ? getPrimaryMain(isDark) : getDivider(isDark)}`,
                  borderRadius: 4,
                  ["--hover-bg" as string]: getActionHover(isDark),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Text variant="caption" style={{ color: "white", fontSize: BADGE_NUMBER_FONT_SIZE, fontWeight: 700 }}>{i + 1}</Text>
                  </div>
                  <Text variant="caption" style={{ color: getTextSecondary(isDark), fontSize: SMALL_CAPTION_FONT_SIZE }}>
                    {annotationLabel}
                  </Text>
                  <div style={{ flex: 1 }} />
                  <IconButton size="xs" onClick={(e) => { e.stopPropagation(); handleDeleteItem(a.id); }}>
                    <DeleteOutlineIcon style={{ fontSize: 14 }} />
                  </IconButton>
                </div>
                <TextField
                  size="small"
                  multiline
                  minRows={1}
                  maxRows={3}
                  fullWidth
                  placeholder={t("commentPanel")}
                  value={a.comment ?? ""}
                  onChange={(e) => handleCommentChange(a.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    ["--tf-input-font-size" as string]: PANEL_INPUT_FONT_SIZE,
                    ["--tf-input-pad-y" as string]: "4px",
                  }}
                />
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
