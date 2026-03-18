"use client";

import CancelIcon from "@mui/icons-material/Cancel";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import AutoFixOffIcon from "@mui/icons-material/AutoFixOff";
import { Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import React, { useCallback, useRef, useState } from "react";

import type { ImageAnnotation, AnnotationTool } from "../types/imageAnnotation";
import { ANNOTATION_COLORS, generateAnnotationId } from "../types/imageAnnotation";

interface ImageAnnotationDialogProps {
  open: boolean;
  onClose: () => void;
  src: string;
  annotations: ImageAnnotation[];
  onSave: (annotations: ImageAnnotation[]) => void;
  t: (key: string) => string;
}

/** マウス座標を SVG の % 座標に変換 */
function toPercent(e: React.MouseEvent, svgRef: React.RefObject<SVGSVGElement | null>): { x: number; y: number } | null {
  const svg = svgRef.current;
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

function renderAnnotation(a: ImageAnnotation, onClick?: (id: string) => void) {
  const stroke = a.color;
  const strokeWidth = 2;
  const fill = "none";
  const cursor = onClick ? "pointer" : "default";
  const handleClick = onClick ? () => onClick(a.id) : undefined;
  switch (a.type) {
    case "rect": {
      const x = Math.min(a.x1, a.x2);
      const y = Math.min(a.y1, a.y2);
      const w = Math.abs(a.x2 - a.x1);
      const h = Math.abs(a.y2 - a.y1);
      return <rect key={a.id} x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={strokeWidth} fill={fill} style={{ cursor }} onClick={handleClick} />;
    }
    case "circle": {
      const cx = (a.x1 + a.x2) / 2;
      const cy = (a.y1 + a.y2) / 2;
      const rx = Math.abs(a.x2 - a.x1) / 2;
      const ry = Math.abs(a.y2 - a.y1) / 2;
      return <ellipse key={a.id} cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke} strokeWidth={strokeWidth} fill={fill} style={{ cursor }} onClick={handleClick} />;
    }
    case "line":
      return <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={stroke} strokeWidth={strokeWidth} style={{ cursor }} onClick={handleClick} />;
    default:
      return null;
  }
}

export function ImageAnnotationDialog({
  open, onClose, src, annotations, onSave, t,
}: ImageAnnotationDialogProps) {
  const [tool, setTool] = useState<AnnotationTool>("rect");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [items, setItems] = useState<ImageAnnotation[]>(annotations);
  const [drawing, setDrawing] = useState<{ x1: number; y1: number } | null>(null);
  const [preview, setPreview] = useState<{ x2: number; y2: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === "eraser") return;
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
    // 最小サイズチェック（1% 未満はクリックミスとして無視）
    if (Math.abs(pt.x - drawing.x1) < 1 && Math.abs(pt.y - drawing.y1) < 1) {
      setDrawing(null); setPreview(null); return;
    }
    const newItem: ImageAnnotation = {
      id: generateAnnotationId(),
      type: tool as "rect" | "circle" | "line",
      x1: drawing.x1, y1: drawing.y1,
      x2: pt.x, y2: pt.y,
      color,
    };
    setItems(prev => [...prev, newItem]);
    setDrawing(null);
    setPreview(null);
  }, [drawing, tool, color]);

  const handleErase = useCallback((id: string) => {
    if (tool !== "eraser") return;
    setItems(prev => prev.filter(a => a.id !== id));
  }, [tool]);

  const handleClose = useCallback(() => {
    onSave(items);
    onClose();
  }, [items, onSave, onClose]);

  if (!open) return null;

  // 描画中のプレビュー図形
  const previewAnnotation = drawing && preview ? {
    id: "_preview",
    type: tool as "rect" | "circle" | "line",
    x1: drawing.x1, y1: drawing.y1,
    x2: preview.x2, y2: preview.y2,
    color,
  } : null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <ToggleButtonGroup
          value={tool}
          exclusive
          onChange={(_, v) => { if (v) setTool(v); }}
          size="small"
        >
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

        {/* Color selector */}
        <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
          {ANNOTATION_COLORS.map(c => (
            <IconButton
              key={c.value}
              size="small"
              onClick={() => setColor(c.value)}
              aria-label={c.label}
              sx={{
                width: 24, height: 24, p: 0,
                bgcolor: c.value,
                border: 2,
                borderColor: color === c.value ? "primary.main" : "divider",
                "&:hover": { borderColor: "primary.main" },
              }}
            />
          ))}
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Undo last */}
        <Tooltip title={t("undo")}>
          <span>
            <IconButton
              size="small"
              disabled={items.length === 0}
              onClick={() => setItems(prev => prev.slice(0, -1))}
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <IconButton size="small" onClick={handleClose} aria-label={t("close")}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Canvas */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          p: 2,
          cursor: tool === "eraser" ? "crosshair" : "crosshair",
        }}
      >
        <Box sx={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 80px)", objectFit: "contain", userSelect: "none" }}
          />
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {items.map(a => renderAnnotation(a, tool === "eraser" ? handleErase : undefined))}
            {previewAnnotation && renderAnnotation(previewAnnotation)}
          </svg>
        </Box>
      </Box>
    </Box>
  );
}
