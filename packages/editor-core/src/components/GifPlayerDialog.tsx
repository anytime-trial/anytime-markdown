"use client";

import GifIcon from "@mui/icons-material/Gif";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useCallback, useRef, useState } from "react";

import { getDivider, getTextSecondary } from "../constants/colors";
import { PANEL_BUTTON_FONT_SIZE } from "../constants/dimensions";
import type { GifSettings } from "../utils/gifEncoder";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";

interface GifPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  src: string;
  settings?: GifSettings;
}

/** GIF 再生・情報表示ダイアログ */
export function GifPlayerDialog({ open, onClose, src, settings }: GifPlayerDialogProps) {
  const isDark = useTheme().palette.mode === "dark";
  const t = (key: string) => key;

  const imgRef = useRef<HTMLImageElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<string>("1");
  const pausedSrcRef = useRef<string | null>(null);

  const togglePlayback = useCallback(() => {
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
      img.src = src + (src.includes("?") ? "&" : "?") + "_t=" + Date.now();
      pausedSrcRef.current = null;
      setPlaying(true);
    }
  }, [playing, src]);

  const handleSpeedChange = useCallback((_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (value !== null) {
      setSpeed(value);
    }
  }, []);

  const frames = settings ? Math.round(settings.fps * settings.duration) : null;

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="gif-player-title">
      <EditDialogHeader
        label="GIF Player"
        onClose={onClose}
        icon={<GifIcon sx={{ fontSize: 18 }} />}
        t={t}
      />

      {/* GIF preview area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "black",
          overflow: "hidden",
          minHeight: 200,
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="GIF"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </Box>

      {/* Playback controls */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: getDivider(isDark),
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {/* Control row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <ToggleButton
            value="playPause"
            selected={false}
            onChange={togglePlayback}
            size="small"
            aria-label={playing ? "Pause" : "Play"}
            sx={{ border: 1, borderColor: getDivider(isDark) }}
          >
            {playing ? <PauseIcon sx={{ fontSize: 20 }} /> : <PlayArrowIcon sx={{ fontSize: 20 }} />}
          </ToggleButton>

          <ToggleButtonGroup
            value={speed}
            exclusive
            onChange={handleSpeedChange}
            size="small"
            aria-label="Playback speed"
          >
            <ToggleButton value="0.5" sx={{ px: 1.5, fontSize: PANEL_BUTTON_FONT_SIZE }}>
              0.5x
            </ToggleButton>
            <ToggleButton value="1" sx={{ px: 1.5, fontSize: PANEL_BUTTON_FONT_SIZE }}>
              1x
            </ToggleButton>
            <ToggleButton value="2" sx={{ px: 1.5, fontSize: PANEL_BUTTON_FONT_SIZE }}>
              2x
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Info row */}
        {settings && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="caption" sx={{ color: getTextSecondary(isDark) }}>
              Duration: {settings.duration.toFixed(1)}s
            </Typography>
            {frames !== null && (
              <Typography variant="caption" sx={{ color: getTextSecondary(isDark) }}>
                Frames: {frames}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: getTextSecondary(isDark) }}>
              {settings.fps} fps
            </Typography>
            <Typography variant="caption" sx={{ color: getTextSecondary(isDark) }}>
              Width: {settings.width}px
            </Typography>
          </Box>
        )}
      </Box>
    </EditDialogWrapper>
  );
}
