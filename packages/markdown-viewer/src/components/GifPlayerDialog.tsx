"use client";

import GifIcon from "@mui/icons-material/Gif";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useTheme } from "@mui/material/styles";
import { useCallback, useRef, useState } from "react";

import { getDivider, getTextSecondary } from "../constants/colors";
import type { GifSettings } from "../utils/gifEncoder";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import { Text } from "../ui/Text";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import styles from "./GifPlayerDialog.module.css";

interface GifPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  src: string;
  settings?: GifSettings;
}

/** GIF 再生・情報表示ダイアログ */
export function GifPlayerDialog({ open, onClose, src, settings }: Readonly<GifPlayerDialogProps>) {
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
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "black",
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
      </div>

      {/* Playback controls */}
      <div
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderTop: `1px solid ${getDivider(isDark)}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Control row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ToggleButton
            value="playPause"
            selected={false}
            onClick={togglePlayback}
            size="small"
            aria-label={playing ? "Pause" : "Play"}
            style={{ border: `1px solid ${getDivider(isDark)}` }}
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
            <ToggleButton value="0.5" className={styles.speedBtn}>
              0.5x
            </ToggleButton>
            <ToggleButton value="1" className={styles.speedBtn}>
              1x
            </ToggleButton>
            <ToggleButton value="2" className={styles.speedBtn}>
              2x
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        {/* Info row */}
        {settings && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Text variant="caption" style={{ color: getTextSecondary(isDark) }}>
              Duration: {settings.duration.toFixed(1)}s
            </Text>
            {frames !== null && (
              <Text variant="caption" style={{ color: getTextSecondary(isDark) }}>
                Frames: {frames}
              </Text>
            )}
            <Text variant="caption" style={{ color: getTextSecondary(isDark) }}>
              {settings.fps} fps
            </Text>
            <Text variant="caption" style={{ color: getTextSecondary(isDark) }}>
              Width: {settings.width}px
            </Text>
          </div>
        )}
      </div>
    </EditDialogWrapper>
  );
}
