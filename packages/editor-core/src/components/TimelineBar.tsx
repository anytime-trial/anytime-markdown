import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SpeedIcon from "@mui/icons-material/Speed";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Tooltip,
  Typography,
} from "@mui/material";
import { type FC, useCallback, useMemo, useState } from "react";

import type {
  PlaybackSpeed,
  TimelineCommit,
  TimelineState,
} from "../types/timeline";

interface TimelineBarProps {
  state: TimelineState;
  onSelectCommit: (index: number) => void;
  onStartPlayback: () => void;
  onStopPlayback: () => void;
  onSetPlaybackSpeed: (speed: PlaybackSpeed) => void;
  onClose: () => void;
  t: (key: string) => string;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

function truncateMessage(msg: string, max = 60): string {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > max
    ? firstLine.slice(0, max) + "..."
    : firstLine;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [1, 2, 5];

export const TimelineBar: FC<TimelineBarProps> = ({
  state,
  onSelectCommit,
  onStartPlayback,
  onStopPlayback,
  onSetPlaybackSpeed,
  onClose,
  t,
}) => {
  const { commits, selectedIndex, isPlaying, playbackSpeed, isLoading } = state;
  const [speedAnchor, setSpeedAnchor] = useState<HTMLElement | null>(null);

  const selectedCommit: TimelineCommit | null = commits[selectedIndex] ?? null;

  const sliderValue = useMemo(
    () => (commits.length > 0 ? commits.length - 1 - selectedIndex : 0),
    [commits.length, selectedIndex],
  );

  const handleSliderChange = useCallback(
    (_event: Event, value: number | number[]) => {
      const v = Array.isArray(value) ? value[0] : value;
      const commitIndex = commits.length - 1 - v;
      onSelectCommit(commitIndex);
    },
    [commits.length, onSelectCommit],
  );

  const marks = useMemo(
    () =>
      commits.map((_, i) => ({
        value: commits.length - 1 - i,
      })),
    [commits],
  );

  if (commits.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        minHeight: 48,
      }}
    >
      <Tooltip title={isPlaying ? t("timelineStop") : t("timelinePlay")}>
        <IconButton
          size="small"
          onClick={isPlaying ? onStopPlayback : onStartPlayback}
          disabled={isLoading}
        >
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Tooltip>

      <Slider
        value={sliderValue}
        min={0}
        max={commits.length - 1}
        step={1}
        marks={marks}
        onChange={handleSliderChange}
        disabled={isPlaying || isLoading}
        sx={{ flex: 1, mx: 1 }}
      />

      {selectedCommit && (
        <Typography
          variant="caption"
          noWrap
          sx={{ minWidth: 200, maxWidth: 400, textAlign: "center" }}
        >
          {formatDate(selectedCommit.date)} —{" "}
          {truncateMessage(selectedCommit.message)}
        </Typography>
      )}

      <Tooltip title={t("timelineSpeed")}>
        <IconButton
          size="small"
          onClick={(e) => setSpeedAnchor(e.currentTarget)}
        >
          <SpeedIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={speedAnchor}
        open={Boolean(speedAnchor)}
        onClose={() => setSpeedAnchor(null)}
      >
        {SPEED_OPTIONS.map((s) => (
          <MenuItem
            key={s}
            selected={s === playbackSpeed}
            onClick={() => {
              onSetPlaybackSpeed(s);
              setSpeedAnchor(null);
            }}
          >
            {s}s
          </MenuItem>
        ))}
      </Menu>

      <Tooltip title={t("timelineClose")}>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
