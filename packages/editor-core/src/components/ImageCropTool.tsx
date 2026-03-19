"use client";

import CropIcon from "@mui/icons-material/Crop";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import PhotoSizeSelectLargeIcon from "@mui/icons-material/PhotoSizeSelectLarge";
import { Box, Button, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface ImageCropToolProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  t: (key: string) => string;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ImageCropTool({ src, onCrop, t }: ImageCropToolProps) {
  const [cropping, setCropping] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [scaleInput, setScaleInput] = useState("100");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getRelativePos = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!cropping) return;
    const pos = getRelativePos(e);
    if (!pos) return;
    setDrawing(true);
    setStartPos(pos);
    setCropRect(null);
  }, [cropping, getRelativePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !startPos) return;
    const pos = getRelativePos(e);
    if (!pos) return;
    setCropRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    });
  }, [drawing, startPos, getRelativePos]);

  const handleMouseUp = useCallback(() => {
    setDrawing(false);
  }, []);

  const handleApplyCrop = useCallback(() => {
    if (!cropRect || !imgRef.current) return;
    const img = imgRef.current;
    const canvas = document.createElement("canvas");
    const sx = Math.round(cropRect.x * img.naturalWidth);
    const sy = Math.round(cropRect.y * img.naturalHeight);
    const sw = Math.round(cropRect.width * img.naturalWidth);
    const sh = Math.round(cropRect.height * img.naturalHeight);
    if (sw < 1 || sh < 1) return;
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL("image/png");
    onCrop(dataUrl);
    setCropping(false);
    setCropRect(null);
  }, [cropRect, onCrop]);

  const handleCancelCrop = useCallback(() => {
    setCropping(false);
    setCropRect(null);
  }, []);

  /** 倍率指定でリサイズ */
  const handleResize = useCallback((scale: number) => {
    const img = imgRef.current;
    if (!img) return;
    const newW = Math.round(img.naturalWidth * scale / 100);
    const newH = Math.round(img.naturalHeight * scale / 100);
    if (newW < 1 || newH < 1) return;
    const canvas = document.createElement("canvas");
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, newW, newH);
    onCrop(canvas.toDataURL("image/png"));
  }, [onCrop]);

  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Escape でキャンセル
  useEffect(() => {
    if (!cropping) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelCrop();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cropping, handleCancelCrop]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Crop toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderBottom: 1, borderColor: "divider", minHeight: 32 }}>
        {!cropping ? (
          <>
            <Tooltip title={t("imageCrop")}>
              <IconButton size="small" onClick={() => setCropping(true)} aria-label={t("imageCrop")}>
                <CropIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("imageResize")}>
              <PhotoSizeSelectLargeIcon sx={{ fontSize: 16, color: "text.secondary", ml: 0.5 }} />
            </Tooltip>
            <TextField
              size="small"
              type="number"
              value={scaleInput}
              onChange={(e) => setScaleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = parseInt(scaleInput, 10);
                  if (v > 0 && v <= 1000) handleResize(v);
                }
              }}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  sx: { fontSize: "0.75rem", py: 0, height: 26 },
                },
                htmlInput: { min: 1, max: 1000, style: { width: 50, textAlign: "right", padding: "2px 4px" } },
              }}
              sx={{ width: 100 }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const v = parseInt(scaleInput, 10);
                if (v > 0 && v <= 1000) handleResize(v);
              }}
              sx={{ textTransform: "none", fontSize: "0.7rem", py: 0, minWidth: 0, minHeight: 26, px: 1 }}
            >
              {t("imageCropApply")}
            </Button>
            {imgNatural && (
              <Typography variant="caption" sx={{ ml: "auto", color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace" }}>
                {imgNatural.w} × {imgNatural.h}
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              {t("imageCropSelect")}
            </Typography>
            <Box sx={{ flex: 1 }} />
            {cropRect && cropRect.width > 0.01 && cropRect.height > 0.01 && (
              <Button
                size="small"
                variant="contained"
                startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                onClick={handleApplyCrop}
                sx={{ textTransform: "none", fontSize: "0.75rem", py: 0.25 }}
              >
                {t("imageCropApply")}
              </Button>
            )}
            <IconButton size="small" onClick={handleCancelCrop} aria-label={t("close")}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </>
        )}
      </Box>

      {/* Image + crop overlay */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          p: 2,
          position: "relative",
          cursor: cropping ? "crosshair" : "default",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Box sx={{ position: "relative", display: "inline-block" }}>
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "calc(100vh - 150px)",
              objectFit: "contain",
              userSelect: "none",
            }}
          />
          {/* Crop overlay */}
          {cropping && cropRect && (
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              {/* 暗い背景 */}
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.5)" />
              {/* 選択範囲（透明に切り抜き） */}
              <rect
                x={`${cropRect.x * 100}%`}
                y={`${cropRect.y * 100}%`}
                width={`${cropRect.width * 100}%`}
                height={`${cropRect.height * 100}%`}
                fill="rgba(0,0,0,0)"
                stroke="white"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              {/* 切り抜き範囲の画像を表示するため、rect を clear */}
            </svg>
          )}
          {cropping && cropRect && (
            <div
              style={{
                position: "absolute",
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: `-${(cropRect.x / cropRect.width) * 100}%`,
                  top: `-${(cropRect.y / cropRect.height) * 100}%`,
                  width: `${(1 / cropRect.width) * 100}%`,
                  height: `${(1 / cropRect.height) * 100}%`,
                }}
              />
            </div>
          )}
        </Box>
      </Box>
    </Box>
  );
}
