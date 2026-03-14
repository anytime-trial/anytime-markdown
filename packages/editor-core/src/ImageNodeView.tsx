"use client";

import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Dialog, DialogTitle, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect,useRef, useState } from "react";

import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getFullscreenBg } from "./constants/colors";
import { useDeleteBlock } from "./hooks/useDeleteBlock";
import { useEditorSettingsContext } from "./useEditorSettings";
import { useNodeSelected } from "./hooks/useNodeSelected";
import { getEditorStorage } from "./types";

const iconSx = { fontSize: 16 };
const MIN_WIDTH = 50;

export function ImageNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const collapsed = !!node.attrs.collapsed;

  const isSelected = useNodeSelected(editor, getPos, node.nodeSize);
  const handleDeleteBlock = useDeleteBlock(editor, getPos, node.nodeSize);

  const isEditable = editor?.isEditable ?? true;
  const { src, alt, title, width } = node.attrs;
  const showToolbar = isEditable && (collapsed || fullscreen || isSelected);

  // --- Image size display ---
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgError, setImgError] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);

  const updateImgSize = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    setImgSize({ w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height), nw: img.naturalWidth, nh: img.naturalHeight });
  }, []);

  useEffect(() => {
    setImgError(false);
    setImgSize(null);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const handleError = () => setImgError(true);
    if (img.complete) {
      if (img.naturalWidth === 0) setImgError(true);
      else updateImgSize();
    }
    img.addEventListener("load", updateImgSize);
    img.addEventListener("error", handleError);
    const ro = new ResizeObserver(updateImgSize);
    ro.observe(img);
    return () => { img.removeEventListener("load", updateImgSize); img.removeEventListener("error", handleError); ro.disconnect(); };
  }, [collapsed, updateImgSize, src]);

  // --- Resize ---
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = imgContainerRef.current;
    if (!container) return;
    const img = container.querySelector("img");
    if (!img) return;
    startXRef.current = e.clientX;
    startWidthRef.current = img.getBoundingClientRect().width;
    setResizing(true);
    setResizeWidth(startWidthRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = Math.max(MIN_WIDTH, Math.round(startWidthRef.current + delta));
    setResizeWidth(newWidth);
  }, [resizing]);

  const handleResizePointerUp = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    if (resizeWidth !== null) {
      updateAttributes({ width: `${resizeWidth}px` });
    }
    setResizeWidth(null);
  }, [resizing, resizeWidth, updateAttributes]);

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 50 : 10;
    const container = imgContainerRef.current;
    if (!container) return;
    const img = container.querySelector("img");
    if (!img) return;
    const currentWidth = parseInt(width, 10) || img.getBoundingClientRect().width;
    const delta = e.key === "ArrowRight" ? step : -step;
    const newWidth = Math.max(MIN_WIDTH, Math.round(currentWidth + delta));
    updateAttributes({ width: `${newWidth}px` });
  }, [width, updateAttributes]);

  const displayWidth = resizeWidth !== null ? `${resizeWidth}px` : width || undefined;

  return (
    <NodeViewWrapper>
      {/* Fullscreen Dialog */}
      <Dialog
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        fullScreen
        aria-labelledby="image-fullscreen-title"
        slotProps={{ paper: { sx: { bgcolor: getFullscreenBg(isDark, settings), display: "flex", flexDirection: "column" } } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Tooltip title={t("close")} placement="bottom">
            <IconButton size="small" onClick={() => setFullscreen(false)} sx={{ mr: 1 }} aria-label={t("close")}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <DialogTitle id="image-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
            {t("image")}
          </DialogTitle>
          <Box sx={{ flex: 1 }} />
          {imgSize && (
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>
              {imgSize.w}×{imgSize.h} / {imgSize.nw}×{imgSize.nh}
            </Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", p: 2, bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG }}>
          {src && !imgError && (
            <img
              src={src}
              alt={alt || t("imageNoAlt")}
              title={title || undefined}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
            />
          )}
        </Box>
      </Dialog>
      {/* Inline view */}
      <Box
        sx={{
          border: 1, borderRadius: 1, overflow: "hidden", my: 1,
          borderColor: showToolbar && isEditable ? "divider" : "transparent",
          ...(!showToolbar && {
            "& > [data-block-toolbar]": {
              maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
            },
          }),
        }}
      >
        {isEditable && <Box
          data-block-toolbar=""
          role="toolbar"
          aria-label={t("imageToolbar")}
          sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
          contentEditable={false}
        >
          <Box
            data-drag-handle=""
            role="button"
            tabIndex={0}
            aria-roledescription="drag"
            aria-label={t("dragHandle")}
            sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
          >
            <DragIndicatorIcon sx={iconSx} />
          </Box>
          {!collapsed && (
            <Tooltip title={t("fullscreen")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(true)} aria-label={t("fullscreen")}>
                <FullscreenIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", flexShrink: 0 }}>
            {t("image")}
          </Typography>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {alt ? (
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flexShrink: 1 }}
            >
              {alt}
            </Typography>
          ) : (
            <Tooltip title={t("imageNoAltWarning")} placement="top">
              <WarningAmberIcon sx={{ fontSize: 14, color: "warning.main" }} />
            </Tooltip>
          )}
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
          >
            {src?.startsWith("data:") ? "(base64)" : src ? `(${src})` : ""}
          </Typography>
          {imgError && (
            <Typography variant="caption" sx={{ color: "error.main", fontSize: "0.65rem", fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 0.25 }}>
              <ErrorOutlineIcon sx={{ fontSize: 14 }} />
              {t("imageNotFound")}
            </Typography>
          )}
          {!collapsed && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Tooltip title={t("imageUrl")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => {
                if (typeof getPos !== "function") return;
                const pos = getPos();
                if (pos == null) return;
                const storage = getEditorStorage(editor);
                const onEdit = storage.image?.onEditImage as ((data: { pos: number; src: string; alt: string }) => void) | undefined;
                if (onEdit) onEdit({ pos, src: src || "", alt: alt || "" });
              }} aria-label={t("imageUrl")}>
                <EditIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          </>)}
          <Box sx={{ flex: 1 }} />
          {imgSize && !collapsed && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
              {imgSize.w}×{imgSize.h} / {t("imageOriginalSize")} {imgSize.nw}×{imgSize.nh}
            </Typography>
          </>)}
          {!collapsed && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Tooltip title={t("delete")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                <DeleteOutlineIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          </>)}
        </Box>}
        {/* Image with resize handle */}
        {!collapsed && imgError && (
          <Box contentEditable={false} sx={{ height: "2em", borderTop: 1, borderColor: "divider", bgcolor: "action.hover" }} />
        )}
        {!collapsed && !imgError && (
          <Box
            ref={imgContainerRef}
            contentEditable={false}
            sx={{ lineHeight: 0, position: "relative", display: "inline-block" }}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onDoubleClick={!isEditable ? () => setFullscreen(true) : undefined}
          >
            <img
              ref={imgRef}
              src={src}
              alt={alt || t("imageNoAlt")}
              title={title || undefined}
              style={{ width: displayWidth, maxWidth: "100%", height: "auto", display: "block" }}
            />
            {/* Resize handle */}
            {isSelected && isEditable && (
              <Box
                role="slider"
                tabIndex={0}
                aria-label={t("resizeImage")}
                aria-valuemin={MIN_WIDTH}
                aria-valuemax={800}
                aria-valuenow={width ? parseInt(width, 10) || undefined : undefined}
                onPointerDown={handleResizePointerDown}
                onKeyDown={handleResizeKeyDown}
                sx={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: 16,
                  height: 16,
                  cursor: "nwse-resize",
                  bgcolor: "primary.main",
                  opacity: 0.7,
                  borderTopLeftRadius: 4,
                  "&:hover": { opacity: 1 },
                  "&:focus-visible": { opacity: 1, outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
                  clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                }}
              />
            )}
            {resizing && resizeWidth !== null && (
              <Box sx={{
                position: "absolute",
                bottom: 4,
                left: "50%",
                transform: "translateX(-50%)",
                bgcolor: "rgba(0,0,0,0.7)",
                color: "white",
                px: 1,
                py: 0.25,
                borderRadius: 1,
                fontSize: "0.7rem",
                fontFamily: "monospace",
                pointerEvents: "none",
              }}>
                {resizeWidth}px
              </Box>
            )}
          </Box>
        )}
      </Box>
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
    </NodeViewWrapper>
  );
}
