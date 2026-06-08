"use client";

import { CheckIcon, CloseIcon, CropIcon, GridOnIcon, PhotoSizeSelectLargeIcon, StraightenIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import styles from "./ImageCropTool.module.css";

import { useIsDark } from "../contexts/ThemeModeContext";
import { getDivider, getTextDisabled, getTextSecondary } from "../constants/colors";
import { CHIP_FONT_SIZE, PANEL_BUTTON_FONT_SIZE, STATUSBAR_FONT_SIZE } from "../constants/dimensions";
import { useCropEstimate } from "../hooks/useCropEstimate";
import { useCropInteraction } from "../hooks/useCropInteraction";
import { Text } from "../ui/Text";
import { SCALE_PRESETS } from "../utils/cropGeometry";

interface ImageCropToolProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  t: (key: string) => string;
}

export function ImageCropTool({ src, onCrop, t }: Readonly<ImageCropToolProps>) {
  const isDark = useIsDark();
  const [cropping, setCropping] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    cropRect, setCropRect,
    drawing, hoverCursor,
    handleMouseDown, handleMouseMove, handleMouseUp,
    resetInteraction,
  } = useCropInteraction({ cropping, imgRef });

  const cropEstimate = useCropEstimate({ cropRect, drawing, imgRef });

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
    try {
      const dataUrl = canvas.toDataURL("image/png");
      onCrop(dataUrl);
    } catch {
      // Canvas tainted by CORS-restricted image
      console.warn("Cannot crop: image source is CORS-restricted");
    }
    setCropping(false);
    setCropRect(null);
  }, [cropRect, onCrop, setCropRect]);

  const handleCancelCrop = useCallback(() => {
    setCropping(false);
    resetInteraction();
  }, [resetInteraction]);

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
    try {
      onCrop(canvas.toDataURL("image/png"));
    } catch {
      console.warn("Cannot resize: image source is CORS-restricted");
    }
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
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [cropping, handleCancelCrop]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Crop toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, borderBottom: `1px solid ${getDivider(isDark)}`, minHeight: 32 }}>
        {cropping ? (
          <>
            <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
              {t("imageCropSelect")}
            </Text>
            {cropEstimate && (
              <Text variant="caption" style={{ color: getTextDisabled(isDark), fontSize: STATUSBAR_FONT_SIZE, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {cropEstimate}
              </Text>
            )}
            <div style={{ flex: 1 }} />
            {cropRect && cropRect.width > 0.01 && cropRect.height > 0.01 && (
              <Button
                size="small"
                variant="contained"
                startIcon={<CheckIcon fontSize={14} />}
                onClick={handleApplyCrop}
                className={styles.applyBtn}
                style={{ fontSize: PANEL_BUTTON_FONT_SIZE }}
              >
                {t("imageCropApply")}
              </Button>
            )}
            <IconButton size="small" onClick={handleCancelCrop} aria-label={t("close")}>
              <CloseIcon fontSize={16} />
            </IconButton>
          </>
        ) : (
          <>
            <Tooltip title={t("imageCrop")}>
              <IconButton size="small" onClick={() => setCropping(true)} aria-label={t("imageCrop")}>
                <CropIcon fontSize={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("imageResize")}>
              <PhotoSizeSelectLargeIcon fontSize={16} color={getTextSecondary(isDark)} style={{ marginLeft: 4 }} />
            </Tooltip>
            {SCALE_PRESETS.map(s => (
              <Chip
                key={s}
                label={`${s}%`}
                size="small"
                variant="outlined"
                onClick={() => handleResize(s)}
                style={{ height: 22, fontSize: CHIP_FONT_SIZE }}
              />
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
              <Tooltip title={t("imageRuler")}>
                <IconButton
                  size="small"
                  onClick={() => setShowRuler(v => !v)}
                  className={showRuler ? styles.activeIcon : undefined}
                  aria-label={t("imageRuler")}
                  aria-pressed={showRuler}
                >
                  <StraightenIcon fontSize={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("imageGrid")}>
                <IconButton
                  size="small"
                  onClick={() => setShowGrid(v => !v)}
                  className={showGrid ? styles.activeIcon : undefined}
                  aria-label={t("imageGrid")}
                  aria-pressed={showGrid}
                >
                  <GridOnIcon fontSize={16} />
                </IconButton>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {/* Image + crop overlay */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          padding: 16,
          position: "relative",
          cursor: cropping ? hoverCursor : "default",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
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
          {/* Ruler + Grid overlay */}
          {(showRuler || showGrid) && imgNatural && (
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
              viewBox={`-20 -20 ${imgNatural.w + 20} ${imgNatural.h + 20}`}
              preserveAspectRatio="none"
            >
              {/* Grid lines */}
              {showGrid && (() => {
                const step = Math.max(50, Math.round(Math.max(imgNatural.w, imgNatural.h) / 10 / 50) * 50);
                const lines: React.ReactNode[] = [];
                for (let x = step; x < imgNatural.w; x += step) {
                  lines.push(<line key={`gv${x}`} x1={x} y1={0} x2={x} y2={imgNatural.h} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />);
                }
                for (let y = step; y < imgNatural.h; y += step) {
                  lines.push(<line key={`gh${y}`} x1={0} y1={y} x2={imgNatural.w} y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />);
                }
                return lines;
              })()}
              {/* Ruler - top */}
              {showRuler && (() => {
                const step = Math.max(50, Math.round(Math.max(imgNatural.w, imgNatural.h) / 10 / 50) * 50);
                const ticks: React.ReactNode[] = [
                  // Top ruler background
                  <rect key="rtbg" x={0} y={-20} width={imgNatural.w} height={20} fill="rgba(0,0,0,0.6)" />,
                ];
                for (let x = 0; x <= imgNatural.w; x += step) {
                  ticks.push(
                    <line key={`rt${x}`} x1={x} y1={-20} x2={x} y2={0} stroke="rgba(255,255,255,0.6)" strokeWidth={1} />,
                    <text key={`rtl${x}`} x={x + 3} y={-6} fontSize={10} fill="rgba(255,255,255,0.7)">{x}</text>,
                  );
                }
                // Left ruler background
                ticks.push(<rect key="rlbg" x={-20} y={0} width={20} height={imgNatural.h} fill="rgba(0,0,0,0.6)" />);
                for (let y = 0; y <= imgNatural.h; y += step) {
                  ticks.push(
                    <line key={`rl${y}`} x1={-20} y1={y} x2={0} y2={y} stroke="rgba(255,255,255,0.6)" strokeWidth={1} />,
                    <text key={`rll${y}`} x={-18} y={y + 12} fontSize={10} fill="rgba(255,255,255,0.7)">{y}</text>,
                  );
                }
                return ticks;
              })()}
            </svg>
          )}
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
        </div>
      </div>
    </div>
  );
}
