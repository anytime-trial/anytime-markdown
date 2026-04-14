import { Box, Typography } from '@mui/material';
import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';

interface OverlayLegendProps {
  readonly overlay: MetricOverlay;
  readonly isDark: boolean;
  /** DSM依存数の最大値（dsm-out/in の場合に表示） */
  readonly dsmMax?: number;
}

const SWATCH_SIZE = 12;

function Swatch({ color, label }: Readonly<{ color: string; label: string }>) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: 0.5, bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1 }}>{label}</Typography>
    </Box>
  );
}

export function OverlayLegend({ overlay, isDark, dsmMax }: Readonly<OverlayLegendProps>) {
  if (overlay === 'none') return null;

  const bg = isDark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)';
  const textColor = isDark ? '#e0e0e0' : '#212121';

  let items: React.ReactNode = null;

  if (overlay === 'coverage-lines' || overlay === 'coverage-branches' || overlay === 'coverage-functions') {
    items = (
      <>
        <Swatch color="#2e7d32" label="≥ 80%" />
        <Swatch color="#f9a825" label="50–79%" />
        <Swatch color="#c62828" label="< 50%" />
        <Swatch color="#616161" label="—" />
      </>
    );
  } else if (overlay === 'dsm-out' || overlay === 'dsm-in') {
    items = (
      <>
        <Swatch color="#c62828" label={`max${dsmMax !== undefined ? ` (${dsmMax})` : ''}`} />
        <Swatch color="#1565c0" label="0" />
      </>
    );
  } else if (overlay === 'dsm-cyclic') {
    items = (
      <>
        <Swatch color="#c62828" label="cyclic" />
        <Swatch color="#2e7d32" label="ok" />
      </>
    );
  } else if (overlay === 'complexity-most' || overlay === 'complexity-highest') {
    items = (
      <>
        <Swatch color="#c62828" label="high" />
        <Swatch color="#f9a825" label="multi-file" />
        <Swatch color="#1565c0" label="search" />
        <Swatch color="#2e7d32" label="low" />
      </>
    );
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        bgcolor: bg,
        color: textColor,
        borderRadius: 1,
        px: 1,
        py: 0.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.4,
        pointerEvents: 'none',
        zIndex: 10,
        backdropFilter: 'blur(4px)',
        minWidth: 80,
      }}
    >
      {items}
    </Box>
  );
}
