"use client";

import EditIcon from "@mui/icons-material/Edit";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import GifIcon from "@mui/icons-material/Gif";
import { Box, Divider, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { BlockInlineToolbar } from "./codeblock/BlockInlineToolbar";
import { DeleteBlockDialog } from "./codeblock/DeleteBlockDialog";
import { GifRecorderDialog } from "./GifRecorderDialog";
import { GifPlayerDialog } from "./GifPlayerDialog";
import { useBlockCapture, saveBlob } from "../hooks/useBlockCapture";
import { useBlockNodeState } from "../hooks/useBlockNodeState";
import type { GifSettings } from "../utils/gifEncoder";

export function GifNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const {
    deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen,
    collapsed, isEditable, isSelected, handleDeleteBlock, showToolbar, isCompareLeft, isCompareLeftEditable,
  } = useBlockNodeState(editor, node, getPos);
  const pngCapture = useBlockCapture(editor, getPos, "gif-block.png");
  const { src, alt, width } = node.attrs;

  // GIF の場合は元ファイルをそのまま GIF として保存、それ以外は PNG キャプチャ
  const handleCapture = useCallback(async () => {
    const imgSrc = src as string;
    if (imgSrc) {
      try {
        const res = await fetch(imgSrc);
        const blob = await res.blob();
        if (blob.type === "image/gif" || imgSrc.endsWith(".gif")) {
          const name = (alt as string) || "animation";
          await saveBlob(blob, name.endsWith(".gif") ? name : `${name}.gif`);
          return;
        }
      } catch {
        // fetch 失敗時は PNG キャプチャにフォールバック
      }
    }
    await pngCapture();
  }, [src, alt, pngCapture]);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // --- Playback toggle (pause/play by swapping src) ---
  const pausedSrcRef = useRef<string | null>(null);

  const togglePlayback = useCallback(() => {
    const img = imgRef.current;
    if (!img || !src) return;
    if (playing) {
      // Pause: replace with static canvas snapshot
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
      // Resume: restore original src
      // blob: URL にはクエリパラメータを付けられないため、
      // blob: の場合はそのまま、通常 URL の場合はキャッシュバスト付き
      const originalSrc = src as string;
      if (originalSrc.startsWith("blob:")) {
        img.src = originalSrc;
      } else {
        img.src = originalSrc + (originalSrc.includes("?") ? "&" : "?") + "_t=" + Date.now();
      }
      pausedSrcRef.current = null;
      setPlaying(true);
    }
  }, [playing, src]);

  // --- Record complete handler ---
  const handleRecordComplete = useCallback(
    (blob: Blob, fileName: string, settings: GifSettings) => {
      setRecorderOpen(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vscodeApi = (window as any).__vscode;
      if (vscodeApi) {
        // VS Code: send as data URL
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
        // Web: set as object URL
        const url = URL.createObjectURL(blob);
        updateAttributes({
          src: url,
          alt: fileName,
          gifSettings: JSON.stringify(settings),
        });
      }
    },
    [updateAttributes],
  );

  // --- Listen for imageSaved from VS Code ---
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

  const handlePlaceholderClick = useCallback(() => {
    if (isEditable) setRecorderOpen(true);
  }, [isEditable]);

  const handleEditClick = useCallback(() => {
    if (src) setPlayerOpen(true);
    else setRecorderOpen(true);
  }, [src]);

  return (
    <NodeViewWrapper data-drag-handle>
      {/* Inline view */}
      <Box
        sx={{
          border: 1, borderRadius: 1, overflow: "hidden", my: 1,
          borderColor: (showToolbar || (isCompareLeftEditable && isSelected)) ? "divider" : "transparent",
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
            onCapture={handleCapture}
            labelOnly={isCompareLeftEditable}
            collapsed={collapsed}
            extra={
              <>
                {!isCompareLeft && isEditable && !collapsed && (
                  <>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <Tooltip title="Record GIF" placement="top">
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setRecorderOpen(true)} aria-label="Record GIF">
                        <FiberManualRecordIcon sx={{ fontSize: 16, color: "error.main" }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                {src && (
                  <>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
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
              <>
                <img
                  ref={imgRef}
                  src={src}
                  alt={alt || "GIF"}
                  style={{ width: width || undefined, maxWidth: "100%", height: "auto", display: "block" }}
                />
                {/* Playback overlay */}
                {isSelected && (
                  <Box
                    sx={{
                      position: "absolute", bottom: 8, right: 8,
                      display: "flex", gap: 0.5, bgcolor: "rgba(0,0,0,0.6)", borderRadius: 1, px: 0.5,
                    }}
                  >
                    <IconButton size="small" onClick={togglePlayback} sx={{ color: "white", p: 0.25 }} aria-label={playing ? "Pause" : "Play"}>
                      {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </Box>
                )}
              </>
            ) : (
              <Box
                onClick={handlePlaceholderClick}
                sx={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  py: 4, cursor: isEditable ? "pointer" : "default",
                  bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                  borderTop: 1, borderColor: "divider",
                  "&:hover": isEditable ? { bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" } : {},
                }}
              >
                <GifIcon sx={{ fontSize: 36, color: "text.disabled", mb: 0.5 }} />
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  Click to record GIF
                </Typography>
              </Box>
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
