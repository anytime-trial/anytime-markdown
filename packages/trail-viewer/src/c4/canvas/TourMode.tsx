import * as React from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import CloseIcon from '@mui/icons-material/Close';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import type { TourStep } from './tourTargets';

export interface TourModeProps {
  readonly steps: readonly TourStep[];
  /** Called whenever the focused step changes (BubbleCanvas focusPoint source). */
  readonly onStepChange: (
    target: { readonly file: string; readonly label: string; readonly startLine: number } | null,
  ) => void;
  readonly onClose: () => void;
  readonly isDark: boolean;
  /** Auto-advance interval in ms. */
  readonly autoAdvanceMs?: number;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const DEFAULT_AUTO_ADVANCE_MS = 6000;

export const TourMode: React.FC<TourModeProps> = ({
  steps,
  onStepChange,
  onClose,
  isDark,
  autoAdvanceMs = DEFAULT_AUTO_ADVANCE_MS,
}) => {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [autoPlay, setAutoPlay] = React.useState(true);

  // Notify parent of focus changes
  React.useEffect(() => {
    const step = steps[stepIdx];
    if (!step) {
      onStepChange(null);
      return;
    }
    onStepChange({
      file: step.entry.filePath,
      label: step.entry.functionName,
      startLine: step.entry.startLine,
    });
  }, [stepIdx, steps, onStepChange]);

  // Clear focus on unmount
  React.useEffect(() => {
    return () => onStepChange(null);
  }, [onStepChange]);

  // Auto-advance timer
  React.useEffect(() => {
    if (!autoPlay || steps.length <= 1) return;
    const t = setTimeout(() => {
      setStepIdx((prev) => (prev + 1) % steps.length);
    }, autoAdvanceMs);
    return () => clearTimeout(t);
  }, [autoPlay, stepIdx, steps.length, autoAdvanceMs]);

  if (steps.length === 0) {
    return null;
  }

  const current = steps[stepIdx]!;
  const role = current.entry.functionRole;

  const goPrev = (): void => {
    setStepIdx((prev) => (prev === 0 ? steps.length - 1 : prev - 1));
  };
  const goNext = (): void => {
    setStepIdx((prev) => (prev + 1) % steps.length);
  };

  const buttonSx = {
    color: isDark ? '#ddd' : '#333',
    p: 0.5,
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: 340,
        maxWidth: 'calc(100% - 32px)',
        bgcolor: isDark ? 'rgba(20,24,32,0.96)' : 'rgba(252,253,255,0.98)',
        color: isDark ? '#fff' : '#222',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
        borderRadius: 1.5,
        boxShadow: 4,
        p: 1.5,
        zIndex: 20,
      }}
    >
      {/* Header: step counter + close */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: isDark ? '#aaa' : '#666', fontWeight: 600 }}>
          Tour {current.index} / {current.total}
        </Typography>
        <IconButton size="small" sx={buttonSx} onClick={onClose} aria-label="close tour">
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>

      {/* Role chip */}
      <Typography
        variant="caption"
        sx={{
          display: 'inline-block',
          fontWeight: 700,
          fontSize: 11,
          color: ROLE_COLORS[role],
          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          px: 0.75,
          py: 0.125,
          borderRadius: 0.75,
          mb: 0.5,
        }}
      >
        {role}
      </Typography>

      {/* Function name */}
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, fontSize: 14, mt: 0.25, mb: 0.25, wordBreak: 'break-all' }}
      >
        {current.entry.functionName}
      </Typography>

      {/* File path */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: isDark ? '#888' : '#666',
          fontSize: 10,
          mb: 0.75,
          wordBreak: 'break-all',
        }}
      >
        {current.entry.filePath}:{current.entry.startLine}
      </Typography>

      {/* Description */}
      <Typography
        variant="body2"
        sx={{
          fontSize: 12,
          lineHeight: 1.45,
          color: isDark ? '#ddd' : '#333',
          mb: 1,
        }}
      >
        {current.description}
      </Typography>

      {/* Metrics row */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ fontSize: 10, color: isDark ? '#aaa' : '#555', mb: 1 }}
      >
        <span>
          fanIn <b>{current.entry.fanIn}</b>
        </span>
        <span>
          fanOut <b>{current.entry.fanOut}</b>
        </span>
        <span>
          CC <b>{current.entry.cognitiveComplexity}</b>
        </span>
        <span>
          lines <b>{current.entry.lineCount}</b>
        </span>
      </Stack>

      {/* Controls */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Previous">
            <IconButton size="small" sx={buttonSx} onClick={goPrev} aria-label="previous">
              <SkipPreviousIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={autoPlay ? 'Pause' : 'Play'}>
            <IconButton
              size="small"
              sx={buttonSx}
              onClick={() => setAutoPlay((p) => !p)}
              aria-label={autoPlay ? 'pause' : 'play'}
            >
              {autoPlay ? (
                <PauseIcon sx={{ fontSize: 18 }} />
              ) : (
                <PlayArrowIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Next">
            <IconButton size="small" sx={buttonSx} onClick={goNext} aria-label="next">
              <SkipNextIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" sx={{ fontSize: 10, color: isDark ? '#888' : '#666' }}>
          {autoPlay ? `auto · ${Math.round(autoAdvanceMs / 1000)}s` : 'manual'}
        </Typography>
      </Stack>
    </Box>
  );
};
