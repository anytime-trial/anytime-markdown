"use client";

import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import GifIcon from "@mui/icons-material/Gif";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { getDivider, getErrorMain, getTextDisabled } from "../constants/colors";
import { HANDLEBAR_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { saveBlob,useBlockCapture } from "../hooks/useBlockCapture";
import { useBlockNodeState } from "../hooks/useBlockNodeState";
import type { GifSettings } from "../utils/gifEncoder";
import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { GifPlayerDialog } from "./GifPlayerDialog";
import { GifRecorderDialog } from "./GifRecorderDialog";

// --- Extracted helper: capture GIF blob from ref or fetch ---
async function captureGifBlob(
  gifBlobRef: React.RefObject<Blob | null>,
  src: string,
  alt: string,
  pngCapture: () => Promise<void>,
): Promise<void> {
  const gifFileName = (alt || "animation").replace(/\.gif$/, "") + ".gif";

  if (gifBlobRef.current) {
    await saveBlob(gifBlobRef.current, gifFileName);
    return;
  }

  const imgSrc = src || "";
  if (imgSrc && (imgSrc.endsWith(".gif") || imgSrc.startsWith("blob:"))) {
    try {
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      const gifBlob = blob.type === "image/gif" ? blob : new Blob([blob], { type: "image/gif" });
      await saveBlob(gifBlob, gifFileName);
      return;
    } catch {
      // フォールバック
    }
  }
  await pngCapture();
}

// --- Extracted helper: toggle GIF playback ---
function toggleGifPlayback(
  imgRef: React.RefObject<HTMLImageElement | null>,
  src: string,
  playing: boolean,
  pausedSrcRef: React.RefObject<string | null>,
  setPlaying: (v: boolean) => void,
): void {
  const img = imgRef.current;
  if (!img || !src) return;
  if (playing) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      pausedSrcRef.current = canvas.toDataURL("image/png");
      img.src = pausedSrcRef.current;
    }
    setPlaying(false);
  } else {
    const originalSrc = src;
    if (originalSrc.startsWith("blob:")) {
      img.src = originalSrc;
    } else {
      img.src = originalSrc + (originalSrc.includes("?") ? "&" : "?") + "_t=" + Date.now();
    }
    pausedSrcRef.current = null;
    setPlaying(true);
  }
}

// --- Extracted helper: handle record complete ---
function onRecordComplete(
  blob: Blob,
  fileName: string,
  settings: GifSettings,
  gifBlobRef: React.RefObject<Blob | null>,
  setRecorderOpen: (v: boolean) => void,
  updateAttributes: (attrs: Record<string, unknown>) => void,
): void {
  setRecorderOpen(false);
  gifBlobRef.current = blob;
  const vscodeApi = (window as any).__vscode;
  if (vscodeApi) {
    const reader = new FileReader();
    reader.onload = () => {
      vscodeApi.postMessage({
        type: "saveClipboardImage",
        dataUrl: reader.result,
        fileName,
      });
    };
    reader.readAsDataURL(blob);
    updateAttributes({ gifSettings: JSON.stringify(settings) });
  } else {
    // data URL を直接使用（blob URL はブラウザコンテキスト固有のため、
    // 他環境へのコピー時に解決できない）
    const reader = new FileReader();
    reader.onload = () => {
      updateAttributes({
        src: reader.result as string,
        alt: fileName,
        gifSettings: JSON.stringify(settings),
      });
    };
    reader.readAsDataURL(blob);
  }
}

// --- Extracted sub-component: GIF placeholder ---
function GifPlaceholder({ isEditable, isDark, onClick }: Readonly<{ isEditable: boolean; isDark: boolean; onClick: () => void }>) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        py: 4, cursor: isEditable ? "pointer" : "default",
        bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
        borderTop: 1, borderColor: getDivider(isDark),
        "&:hover": isEditable ? { bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" } : {},
      }}
    >
      <GifIcon sx={{ fontSize: 36, color: getTextDisabled(isDark), mb: 0.5 }} />
      <Typography variant="caption" sx={{ color: getTextDisabled(isDark) }}>
        Click to record GIF
      </Typography>
    </Box>
  );
}

// --- Extracted sub-component: GIF playback image with overlay ---
function GifPlaybackImage({
  imgRef, src, alt, width, isSelected, playing, onToggle,
}: Readonly<{
  imgRef: React.RefObject<HTMLImageElement | null>;
  src: string;
  alt: string;
  width: string | undefined;
  isSelected: boolean;
  playing: boolean;
  onToggle: () => void;
}>) {
  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt={alt || "GIF"}
        style={{ width: width || undefined, maxWidth: "100%", height: "auto", display: "block" }}
      />
      {isSelected && (
        <Box
          sx={{
            position: "absolute", bottom: 8, right: 8,
            display: "flex", gap: 0.5, bgcolor: "rgba(0,0,0,0.6)", borderRadius: 1, px: 0.5,
          }}
        >
          <IconButton size="small" onClick={onToggle} sx={{ color: "white", p: 0.25 }} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Box>
      )}
    </>
  );
}

export function GifNodeView({ editor, node, updateAttributes, getPos }: Readonly<NodeViewProps>) {
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const {
    deleteDialogOpen, setDeleteDialogOpen,
    editOpen: _editOpen, setEditOpen: _setEditOpen,
    collapsed, isEditable, isSelected, handleDeleteBlock, showToolbar, isCompareLeft, isCompareLeftEditable,
  } = useBlockNodeState(editor, node, getPos);
  const pngCapture = useBlockCapture(editor, getPos, "gif-block.png");
  const { src, alt, width } = node.attrs;
  const gifBlobRef = useRef<Blob | null>(null);

  const handleCapture = useCallback(async () => {
    await captureGifBlob(gifBlobRef, src as string, alt as string, pngCapture);
  }, [src, alt, pngCapture]);

  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const pausedSrcRef = useRef<string | null>(null);

  const togglePlayback = useCallback(() => {
    toggleGifPlayback(imgRef, src as string, playing, pausedSrcRef, setPlaying);
  }, [playing, src]);

  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      onRecordComplete(blob, fileName, settings, gifBlobRef, setRecorderOpen, updateAttributes);
    },
    [updateAttributes],
  );

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "imageSaved" && data.fileName) {
        updateAttributes({ src: data.path || data.fileName });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [updateAttributes]);

  // autoEditOpen: スラッシュコマンドから作成された場合、即座にレコーダーを開く
  useEffect(() => {
    if (node.attrs.autoEditOpen && isEditable) {
      requestAnimationFrame(() => {
        updateAttributes({ autoEditOpen: false });
        setRecorderOpen(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlaceholderClick = useCallback(() => {
    if (isEditable) setRecorderOpen(true);
  }, [isEditable]);

  const handleEditClick = useCallback(() => {
    if (src) setPlayerOpen(true);
    else setRecorderOpen(true);
  }, [src]);

  return (
    <NodeViewWrapper data-drag-handle className="image-node-wrapper">
      {/* Inline view */}
      <Box
        sx={{
          border: 1, borderRadius: 1, overflow: "hidden", my: 1,
          borderColor: (showToolbar || (isCompareLeftEditable && isSelected)) ? getDivider(isDark) : "transparent",
          ...(!(showToolbar || (isCompareLeftEditable && isSelected)) && {
            "& > [data-block-toolbar]": {
              maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
            },
          }),
        }}
      >
        {(isEditable || isCompareLeftEditable) && (
          <BlockInlineToolbar
            label="GIF"
            onEdit={!collapsed && !isCompareLeft ? handleEditClick : undefined}
            onDelete={!collapsed && !isCompareLeft ? () => setDeleteDialogOpen(true) : undefined}
            onExport={handleCapture}
            labelOnly={isCompareLeftEditable}
            collapsed={collapsed}
            extra={
              <>
                {!isCompareLeft && isEditable && !collapsed && (
                  <>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <Tooltip title="Record GIF" placement="top">
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setRecorderOpen(true)} aria-label="Record GIF">
                        <FiberManualRecordIcon sx={{ fontSize: 16, color: getErrorMain(isDark) }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                {src && (
                  <>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <Typography variant="caption" sx={{ color: getTextDisabled(isDark), fontSize: HANDLEBAR_CAPTION_FONT_SIZE, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {src.startsWith("data:") || src.startsWith("blob:") ? "(embedded)" : `(${src})`}
                    </Typography>
                  </>
                )}
              </>
            }
            t={t}
          />
        )}
        {/* Content area */}
        {!collapsed && (
          <Box contentEditable={false} sx={{ position: "relative", lineHeight: 0 }}>
            {src ? (
              <GifPlaybackImage
                imgRef={imgRef}
                src={src}
                alt={alt}
                width={width}
                isSelected={isSelected}
                playing={playing}
                onToggle={togglePlayback}
              />
            ) : (
              <GifPlaceholder isEditable={isEditable} isDark={isDark} onClick={handlePlaceholderClick} />
            )}
          </Box>
        )}
      </Box>

      {/* Dialogs */}
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
      {recorderOpen && (
        <GifRecorderDialog
          open={recorderOpen}
          onClose={() => setRecorderOpen(false)}
          onComplete={handleRecordComplete}
        />
      )}
      {playerOpen && src && (
        <GifPlayerDialog
          open={playerOpen}
          onClose={() => setPlayerOpen(false)}
          src={src}
          settings={node.attrs.gifSettings ? JSON.parse(node.attrs.gifSettings as string) : undefined}
        />
      )}
    </NodeViewWrapper>
  );
}
