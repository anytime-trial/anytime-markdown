"use client";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ImageIcon from "@mui/icons-material/Image";
import LinkIcon from "@mui/icons-material/Link";
import ScreenshotMonitorIcon from "@mui/icons-material/ScreenshotMonitor";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnnotationOverlay } from "./components/AnnotationOverlay";
import { BlockInlineToolbar } from "./components/codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./components/codeblock/DeleteBlockDialog";
import { EditDialogHeader } from "./components/EditDialogHeader";
import { EditDialogWrapper } from "./components/EditDialogWrapper";
import { ImageAnnotationDialog } from "./components/ImageAnnotationDialog";
import { ImageCropTool } from "./components/ImageCropTool";
import { ScreenCaptureDialog } from "./components/ScreenCaptureDialog";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getErrorMain, getPrimaryMain, getTextDisabled, getTextSecondary, getWarningMain } from "./constants/colors";
import { HANDLEBAR_CAPTION_FONT_SIZE, SMALL_CAPTION_FONT_SIZE, STATUSBAR_FONT_SIZE } from "./constants/dimensions";
import { useBlockCapture } from "./hooks/useBlockCapture";
import { useBlockNodeState } from "./hooks/useBlockNodeState";
import { useBlockResize } from "./hooks/useBlockResize";
import { getEditorStorage } from "./types";
import { type ImageAnnotation, parseAnnotations, serializeAnnotations } from "./types/imageAnnotation";

const MIN_WIDTH = 50;

/** base64 DataURL のバイトサイズを算出してフォーマットする */
function formatDataUrlSize(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return "";
  const base64 = dataUrl.slice(commaIdx + 1);
  const bytes = Math.ceil(base64.length * 3 / 4);
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// --- Extracted: image size tracking hook ---
function useImageSize(imgRef: React.RefObject<HTMLImageElement | null>, src: string, collapsed: boolean) {
  const [imgError, setImgError] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);

  const updateImgSize = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    setImgSize({ w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height), nw: img.naturalWidth, nh: img.naturalHeight });
  }, [imgRef]);

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
  }, [collapsed, updateImgSize, src, imgRef]);

  return { imgError, imgSize };
}

// --- Extracted: crop callback factory ---
function handleCropComplete(
  src: string,
  updateAttributes: (attrs: Record<string, unknown>) => void,
  croppedDataUrl: string,
): void {
  const isDataUrl = src.startsWith("data:");
  if (isDataUrl) {
    updateAttributes({ src: croppedDataUrl });
    return;
  }
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    vscodeApi.postMessage({ type: "overwriteImage", path: src, dataUrl: croppedDataUrl });
    updateAttributes({ src: src.split("?")[0] + "?t=" + Date.now() });
  } else {
    updateAttributes({ src: croppedDataUrl });
  }
}

// --- Extracted sub-component: Image toolbar extra info ---
function ImageToolbarExtra({
  alt, imgError, isCompareLeft, isEditable, collapsed, annotations, onAnnotationOpen, onEdit, onEditUrl, isDark, t,
}: Readonly<{
  alt: string; imgError: boolean;
  isCompareLeft: boolean; isEditable: boolean; collapsed: boolean;
  annotations: ImageAnnotation[]; onAnnotationOpen: () => void;
  onEdit?: () => void;
  onEditUrl?: () => void;
  isDark: boolean;
  t: (key: string) => string;
}>) {
  const iconSx = { fontSize: 16, color: getTextSecondary(isDark) };
  return (
    <>
      {!alt && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Tooltip title={t("imageNoAltWarning")} placement="top">
            <WarningAmberIcon sx={{ fontSize: 14, color: getWarningMain(isDark) }} />
          </Tooltip>
        </>
      )}
      {imgError && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Tooltip title={t("imageNotFound")} placement="top">
            <ErrorOutlineIcon sx={{ fontSize: 14, color: getErrorMain(isDark) }} />
          </Tooltip>
        </>
      )}
      {!isCompareLeft && isEditable && !collapsed && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {onEdit && (
            <Tooltip title={t("edit")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={onEdit} aria-label={t("edit")}>
                <EditIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
          {onEditUrl && (
            <Tooltip title={t("imageUrl")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={onEditUrl} aria-label={t("imageUrl")}>
                <LinkIcon sx={iconSx} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t("annotate")} placement="top">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={onAnnotationOpen} aria-label={t("annotate")}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 16, color: annotations.length > 0 ? getPrimaryMain(isDark) : getTextSecondary(isDark) }} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </>
  );
}

// --- Extracted sub-component: Image with resize handle ---
function ImageWithResize({
  imgRef, imgContainerRef, src, alt, title, displayWidth, annotations,
  isSelected, isEditable, resizing, resizeWidth,
  handleResizePointerDown, handleResizePointerMove, handleResizePointerUp, handleResizeKeyDown,
  onDoubleClick, width, isDark, t,
}: Readonly<{
  imgRef: React.RefObject<HTMLImageElement | null>;
  imgContainerRef: React.RefObject<HTMLDivElement | null>;
  src: string; alt: string; title: string; displayWidth: string | undefined;
  annotations: ImageAnnotation[];
  isSelected: boolean; isEditable: boolean;
  resizing: boolean; resizeWidth: number | null;
  handleResizePointerDown: (e: React.PointerEvent) => void;
  handleResizePointerMove: (e: React.PointerEvent) => void;
  handleResizePointerUp: (e: React.PointerEvent) => void;
  handleResizeKeyDown: (e: React.KeyboardEvent) => void;
  onDoubleClick: (() => void) | undefined;
  width: string; isDark: boolean; t: (key: string) => string;
}>) {
  return (
    <Box
      ref={imgContainerRef}
      contentEditable={false}
      sx={{ lineHeight: 0, position: "relative", display: "inline-block" }}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerUp}
      onDoubleClick={onDoubleClick}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt || t("imageNoAlt")}
        title={title || undefined}
        style={{ width: displayWidth, maxWidth: "100%", height: "auto", display: "block" }}
      />
      <AnnotationOverlay annotations={annotations} />
      {isSelected && isEditable && (
        <Box
          role="slider"
          tabIndex={0}
          aria-label={t("resizeImage")}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={800}
          aria-valuenow={width ? Number.parseInt(width, 10) || undefined : undefined}
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
          sx={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            bgcolor: getPrimaryMain(isDark),
            opacity: 0.7,
            borderTopLeftRadius: 4,
            "&:hover": { opacity: 1 },
            "&:focus-visible": { opacity: 1, outline: "2px solid", outlineColor: getPrimaryMain(isDark), outlineOffset: 1 },
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
          fontSize: SMALL_CAPTION_FONT_SIZE,
          fontFamily: "monospace",
          pointerEvents: "none",
        }}>
          {resizeWidth}px
        </Box>
      )}
    </Box>
  );
}

function ImageEditDialog({ editOpen, setEditOpen, src, imgError, imgSize, onCrop, onExport, onScreenCapture, isDark, t }: Readonly<{
  editOpen: boolean; setEditOpen: (v: boolean) => void;
  src: string; imgError: boolean; imgSize: { w: number; h: number; nw: number; nh: number } | null;
  onCrop: (croppedDataUrl: string) => void;
  onExport?: () => void;
  onScreenCapture?: () => void;
  isDark: boolean; t: (key: string) => string;
}>) {
  const iconSx = { fontSize: 18, color: getTextSecondary(isDark) };
  return (
    <EditDialogWrapper open={editOpen} onClose={() => setEditOpen(false)} ariaLabelledBy="image-edit-title">
      <EditDialogHeader
        label={t("image")}
        onClose={() => setEditOpen(false)}
        icon={<ImageIcon sx={{ fontSize: 18 }} />}
        t={t}
      />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG }}>
        {src && !imgError && (
          <ImageCropTool src={src} onCrop={onCrop} t={t} />
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 0.5, borderTop: 1, borderColor: getDivider(isDark), gap: 0.5 }}>
        {onScreenCapture && (
          <Tooltip title={t("screenCapture")} placement="top">
            <IconButton size="small" sx={{ p: 0.5 }} onClick={onScreenCapture} aria-label={t("screenCapture")}>
              <ScreenshotMonitorIcon sx={iconSx} />
            </IconButton>
          </Tooltip>
        )}
        {onExport && (
          <Tooltip title={t("capture")} placement="top">
            <IconButton size="small" sx={{ p: 0.5 }} onClick={onExport} aria-label={t("capture")}>
              <FileDownloadIcon sx={iconSx} />
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: getTextDisabled(isDark), fontSize: STATUSBAR_FONT_SIZE, fontFamily: "monospace", whiteSpace: "nowrap" }}>
          {imgSize ? `${imgSize.nw}x${imgSize.nh}` : ""}{imgSize && src?.startsWith("data:") ? " / " : ""}{src?.startsWith("data:") ? formatDataUrlSize(src) : ""}
        </Typography>
      </Box>
    </EditDialogWrapper>
  );
}

/** Trigger external image URL edit callback (extracted to reduce component complexity). */
function triggerImageEditUrl(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
  src: string,
  alt: string,
): void {
  if (typeof getPos !== "function") return;
  const pos = getPos();
  if (pos == null) return;
  const storage = getEditorStorage(editor);
  const onEdit = storage.image?.onEditImage as ((data: { pos: number; src: string; alt: string }) => void) | undefined;
  if (onEdit) onEdit({ pos, src: src || "", alt: alt || "" });
}

/** Handle arrow-key resizing of the image block (extracted to reduce component complexity). */
function handleResizeKeyDownImpl(
  e: React.KeyboardEvent,
  imgContainerRef: React.RefObject<HTMLDivElement | null>,
  width: string,
  updateAttributes: (attrs: Record<string, unknown>) => void,
): void {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const step = e.shiftKey ? 50 : 10;
  const container = imgContainerRef.current;
  if (!container) return;
  const img = container.querySelector("img");
  if (!img) return;
  const currentWidth = Number.parseInt(width, 10) || img.getBoundingClientRect().width;
  const delta = e.key === "ArrowRight" ? step : -step;
  const newWidth = Math.max(MIN_WIDTH, Math.round(currentWidth + delta));
  updateAttributes({ width: `${newWidth}px` });
}

/** Compute interaction flags from node state (extracted to reduce cognitive complexity). */
function computeImageInteractionFlags(collapsed: boolean, isCompareLeft: boolean, isCompareLeftEditable: boolean, isEditable: boolean, isSelected: boolean, showToolbar: boolean) {
  const canInteract = !collapsed && !isCompareLeft;
  const hasScreenCapture = canInteract && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const showBorder = showToolbar || (isCompareLeftEditable && isSelected);
  const showBlockToolbar = isEditable || isCompareLeftEditable;
  return { canInteract, hasScreenCapture, showBorder, showBlockToolbar };
}

/** Build the wrapper Box sx style (extracted to reduce cognitive complexity). */
export function buildImageWrapperSx(showBorder: boolean, isDark: boolean, insideImageRow: boolean) {
  const borderColor = showBorder ? getDivider(isDark) : "transparent";
  // imageRow 内では常に hover / selected 時のみツールバー表示
  const hideToolbar = !showBorder || insideImageRow;
  // display: none で完全にレイアウトから外す。opacity:0/max-height:0 だと
  // 非表示でもツールバーの min-content 幅が親要素を押し広げ、flex 配下の
  // 画像ブロックが親幅を取って縦積みになる。
  const hiddenToolbarSx = hideToolbar ? {
    "& > [data-block-toolbar]": {
      display: "none",
    },
    "&:hover > [data-block-toolbar], &[data-selected='true'] > [data-block-toolbar]": {
      display: "flex",
    },
  } : {};
  // 画像サイズに合わせて border フレームを縮める（単独・imageRow 両方）
  const widthSx = { width: "fit-content", maxWidth: "100%" };
  return { border: 1, borderRadius: 1, overflow: "hidden", my: 1, borderColor, ...widthSx, ...hiddenToolbarSx };
}

/** Determine whether the image's parent node is imageRow. */
function isInsideImageRow(editor: NodeViewProps["editor"], getPos: NodeViewProps["getPos"]): boolean {
  if (typeof getPos !== "function") return false;
  const pos = getPos();
  if (pos == null) return false;
  try {
    const $pos = editor.state.doc.resolve(pos);
    return $pos.parent?.type.name === "imageRow";
  } catch {
    return false;
  }
}

/** Image content area: either error placeholder or resizable image (extracted to reduce cognitive complexity). */
function ImageContentArea({
  collapsed, imgError, imgRef, imgContainerRef, src, alt, title, displayWidth, annotations,
  isSelected, isEditable, resizing, resizeWidth,
  handleResizePointerDown, handleResizePointerMove, handleResizePointerUp, handleResizeKeyDown,
  onDoubleClick, width, isDark, t,
}: Readonly<{
  collapsed: boolean; imgError: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  imgContainerRef: React.RefObject<HTMLDivElement | null>;
  src: string; alt: string; title: string; displayWidth: string | undefined;
  annotations: ImageAnnotation[];
  isSelected: boolean; isEditable: boolean;
  resizing: boolean; resizeWidth: number | null;
  handleResizePointerDown: (e: React.PointerEvent) => void;
  handleResizePointerMove: (e: React.PointerEvent) => void;
  handleResizePointerUp: (e: React.PointerEvent) => void;
  handleResizeKeyDown: (e: React.KeyboardEvent) => void;
  onDoubleClick: (() => void) | undefined;
  width: string; isDark: boolean; t: (key: string) => string;
}>) {
  if (collapsed) return null;
  if (imgError) {
    return <Box contentEditable={false} sx={{ height: "2em", borderTop: 1, borderColor: getDivider(isDark), bgcolor: getActionHover(isDark) }} />;
  }
  return (
    <ImageWithResize
      imgRef={imgRef}
      imgContainerRef={imgContainerRef}
      src={src}
      alt={alt}
      title={title}
      displayWidth={displayWidth}
      annotations={annotations}
      isSelected={isSelected}
      isEditable={isEditable}
      resizing={resizing}
      resizeWidth={resizeWidth}
      handleResizePointerDown={handleResizePointerDown}
      handleResizePointerMove={handleResizePointerMove}
      handleResizePointerUp={handleResizePointerUp}
      handleResizeKeyDown={handleResizeKeyDown}
      onDoubleClick={onDoubleClick}
      width={width}
      isDark={isDark}
      t={t}
    />
  );
}

export function ImageNodeView({ editor, node, updateAttributes, getPos }: Readonly<NodeViewProps>) {
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const {
    deleteDialogOpen, setDeleteDialogOpen, editOpen, setEditOpen,
    collapsed, isEditable, isSelected, handleDeleteBlock, showToolbar, isCompareLeft, isCompareLeftEditable,
  } = useBlockNodeState(editor, node, getPos);
  const handleCapture = useBlockCapture(editor, getPos, "image.png");
  const { src, alt, title, width, annotations: annotationsJson } = node.attrs;
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [screenCaptureOpen, setScreenCaptureOpen] = useState(false);
  const annotations = parseAnnotations(annotationsJson as string | null);

  const imgRef = useRef<HTMLImageElement>(null);
  const { imgError, imgSize } = useImageSize(imgRef, src, collapsed);

  // --- Resize ---
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef: imgContainerRef, updateAttributes, currentWidth: width });

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => handleResizeKeyDownImpl(e, imgContainerRef, width, updateAttributes),
    [width, updateAttributes],
  );

  const handleEditUrl = useCallback(
    () => triggerImageEditUrl(editor, getPos, src, alt),
    [editor, getPos, src, alt],
  );

  const onCrop = useCallback((croppedDataUrl: string) => {
    handleCropComplete(src, updateAttributes, croppedDataUrl);
  }, [src, updateAttributes]);

  const { canInteract, hasScreenCapture, showBorder, showBlockToolbar } = computeImageInteractionFlags(collapsed, isCompareLeft, isCompareLeftEditable, isEditable, isSelected, showToolbar);

  const onDeleteAction = canInteract ? () => setDeleteDialogOpen(true) : undefined;
  const onEditAction = canInteract ? () => setEditOpen(true) : undefined;
  const onEditUrlAction = canInteract ? handleEditUrl : undefined;
  const onScreenCaptureAction = hasScreenCapture ? () => setScreenCaptureOpen(true) : undefined;
  const onImageDoubleClick = isEditable ? undefined : () => setEditOpen(true);

  const insideImageRow = isInsideImageRow(editor, getPos);

  return (
    <NodeViewWrapper
      className="image-node-wrapper"
      data-image-block=""
      data-inside-image-row={insideImageRow ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
    >
      <ImageEditDialog
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        src={src}
        imgError={imgError}
        imgSize={imgSize}
        onCrop={onCrop}
        onExport={canInteract ? handleCapture : undefined}
        onScreenCapture={onScreenCaptureAction}
        isDark={isDark}
        t={t}
      />
      <Box sx={buildImageWrapperSx(showBorder, isDark, insideImageRow)}>
        {showBlockToolbar && !(insideImageRow && !isSelected) && (
          <BlockInlineToolbar
            label={t("image")}
            onDelete={onDeleteAction}
            labelOnly={isCompareLeftEditable}
            collapsed={collapsed}
            extra={
              <ImageToolbarExtra
                alt={alt}
                imgError={imgError}
                isCompareLeft={isCompareLeft}
                isEditable={isEditable}
                collapsed={collapsed}
                annotations={annotations}
                onAnnotationOpen={() => setAnnotationOpen(true)}
                onEdit={onEditAction}
                onEditUrl={onEditUrlAction}
                isDark={isDark}
                t={t}
              />
            }
            t={t}
          />
        )}
        <ImageContentArea
          collapsed={collapsed}
          imgError={imgError}
          imgRef={imgRef}
          imgContainerRef={imgContainerRef}
          src={src}
          alt={alt}
          title={title}
          displayWidth={displayWidth}
          annotations={annotations}
          isSelected={isSelected}
          isEditable={isEditable}
          resizing={resizing}
          resizeWidth={resizeWidth}
          handleResizePointerDown={handleResizePointerDown}
          handleResizePointerMove={handleResizePointerMove}
          handleResizePointerUp={handleResizePointerUp}
          handleResizeKeyDown={handleResizeKeyDown}
          onDoubleClick={onImageDoubleClick}
          width={width}
          isDark={isDark}
          t={t}
        />
      </Box>
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
      {annotationOpen && (
        <ImageAnnotationDialog
          open={annotationOpen}
          onClose={() => setAnnotationOpen(false)}
          src={src}
          annotations={annotations}
          onSave={(items) => updateAttributes({ annotations: serializeAnnotations(items) })}
          t={t}
        />
      )}
      <ScreenCaptureDialog
        open={screenCaptureOpen}
        onClose={() => setScreenCaptureOpen(false)}
        onCapture={(dataUrl) => updateAttributes({ src: dataUrl })}
        t={t}
      />
    </NodeViewWrapper>
  );
}
