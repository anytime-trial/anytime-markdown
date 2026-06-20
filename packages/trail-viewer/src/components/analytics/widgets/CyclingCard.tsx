import { Box, Chip, Paper, Tooltip, Typography, HelpOutline as HelpOutlineIcon } from '../../../ui';
import type { MetricItem } from '../types';

export function CyclingCard({
  groupName,
  items,
  index,
  onCycle,
  cardStyle,
}: Readonly<{
  groupName: string;
  items: readonly MetricItem[];
  index: number;
  onCycle: () => void;
  cardStyle: Record<string, unknown>;
}>) {
  const current = items[index];
  return (
    <Paper
      elevation={0}
      sx={{
        ...cardStyle,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // TODO(mui-removal): dropped pseudo/responsive sx — '&:hover': { backgroundColor: 'action.hover' }
        userSelect: 'none',
      }}
      onClick={onCycle}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5, gap: 0.5 }}>
        <Box sx={{ textAlign: 'left' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
            {groupName}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.3, fontWeight: 600 }}>
            {current.label}
          </Typography>
        </Box>
        {current.tooltip && (
          <Tooltip title={current.tooltip} arrow placement="top">
            <HelpOutlineIcon fontSize={12} color="text.disabled" style={{ cursor: 'help', flexShrink: 0, marginTop: '1.6px' }} />
          </Tooltip>
        )}
      </Box>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h3">{current.value}</Typography>
          {current.badge && (
            <Chip
              label={current.badge.label}
              size="small"
              sx={{ backgroundColor: current.badge.color, color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }}
            />
          )}
        </Box>
      </Box>
      <Box sx={{ minHeight: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        {current.delta && (
          <Typography variant="caption" sx={{ color: current.delta.color }}>
            {current.delta.text}
          </Typography>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
          {items.map((item, i) => (
            <Box
              key={item.label}
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: i === index ? 'primary.main' : 'action.disabled',
              }}
            />
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
