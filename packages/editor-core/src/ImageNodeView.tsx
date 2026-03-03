"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, useEditorState } from "@tiptap/react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import FocusTrap from "@mui/material/Unstable_TrapFocus";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useTranslations } from "next-intl";

const iconSx = { fontSize: 16 };
const MIN_WIDTH = 50;

export function ImageNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const collapsed = !!node.attrs.collapsed;
  const toggleCollapsed = useCallback(() => updateAttributes({ collapsed: !collapsed }), [collapsed, updateAttributes]);

  const isSelected = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || typeof getPos !== "function") return false;
      const pos = getPos();
      if (pos == null) return false;
      const from = ctx.editor.state.selection.from;
      return from >= pos && from <= pos + node.nodeSize;
    },
  });

  const { src, alt, title, width } = node.attrs;
  const showToolbar = collapsed || fullscreen || isSelected;

  const handleDeleteBlock = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    editor.chain().focus().command(({ tr }) => { tr.delete(pos, pos + node.nodeSize); return true; }).run();
  }, [editor, getPos, node.nodeSize]);

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
      <FocusTrap open={fullscreen}>
      <Box
        {...(fullscreen && {
          role: "dialog" as const,
          "aria-modal": true,
          "aria-label": t("image"),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); },
        })}
        tabIndex={fullscreen ? -1 : undefined}
        sx={{
        border: 1, borderRadius: fullscreen ? 0 : 1, overflow: "hidden", my: fullscreen ? 0 : 1,
        borderColor: showToolbar ? "divider" : "transparent",
        ...(fullscreen && {
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "background.paper",
          display: "flex",
          flexDirection: "column",
        }),
        ...(!showToolbar && {
          "& > [data-block-toolbar]": {
            maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
          },
        }),
      }}>
        <Box
          data-block-toolbar=""
          role="toolbar"
          aria-label={t("imageToolbar")}
          sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
          contentEditable={false}
        >
          {/* Drag handle (hidden in fullscreen) */}
          {!fullscreen && (
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
          )}
          {/* Collapse/Expand (hidden in fullscreen) */}
          {!fullscreen && (
            <Tooltip title={collapsed ? t("unfoldAll") : t("foldAll")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleCollapsed} aria-label={collapsed ? t("unfoldAll") : t("foldAll")}>
                {collapsed ? <UnfoldMoreIcon sx={iconSx} /> : <UnfoldLessIcon sx={iconSx} />}
              </IconButton>
            </Tooltip>
          )}
          {/* Fullscreen enter (not shown in fullscreen or collapsed) */}
          {!collapsed && !fullscreen && (
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
            {/* Edit URL */}
            <Tooltip title={t("imageUrl")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => {
                if (typeof getPos !== "function") return;
                const pos = getPos();
                if (pos == null) return;
                const storage = editor.storage as unknown as Record<string, Record<string, unknown>>;
                const onEdit = storage.image?.onEditImage as ((data: { pos: number; src: string; alt: string }) => void) | undefined;
                if (onEdit) onEdit({ pos, src: src || "", alt: alt || "" });
              }} aria-label={t("imageUrl")}>
                <EditIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          </>)}
          <Box sx={{ flex: 1 }} />

          {/* Size display */}
          {imgSize && !collapsed && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
              {imgSize.w}×{imgSize.h} / {t("imageOriginalSize")} {imgSize.nw}×{imgSize.nh}
            </Typography>
          </>)}

          {!collapsed && !fullscreen && (<>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            {/* Delete */}
            <Tooltip title={t("delete")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
                <DeleteOutlineIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          </>)}
          {/* Close fullscreen (right end) */}
          {fullscreen && (
            <Tooltip title={t("close")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFullscreen(false)} aria-label={t("close")}>
                <CloseIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {/* Image with resize handle */}
        {!collapsed && imgError && (
          <Box contentEditable={false} sx={{ height: "2em", borderTop: 1, borderColor: "divider", bgcolor: "action.hover" }} />
        )}
        {!collapsed && !imgError && (
          <Box
            ref={imgContainerRef}
            contentEditable={false}
            sx={{
              lineHeight: 0, position: "relative",
              ...(fullscreen
                ? { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", p: 2 }
                : { display: "inline-block" }),
            }}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          >
            <img
              ref={imgRef}
              src={src}
              alt={alt || t("imageNoAlt")}
              title={title || undefined}
              style={fullscreen
                ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }
                : { width: displayWidth, maxWidth: "100%", height: "auto", display: "block" }
              }
            />
            {/* Resize handle (bottom-right corner) */}
            {isSelected && (
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
                  // 三角形の視覚的ヒント
                  clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                }}
              />
            )}
            {/* リサイズ中のサイズ表示 */}
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
      </FocusTrap>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t("delete")}</DialogTitle>
        <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
          <Button color="error" variant="contained" onClick={() => { setDeleteDialogOpen(false); handleDeleteBlock(); }}>{t("delete")}</Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
}
