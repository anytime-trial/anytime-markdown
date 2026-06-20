import { Box, Tooltip, Typography, HelpOutline as HelpOutlineIcon } from '../../../../ui';

export function ChartTitle({ title, description }: Readonly<{ title: string; description?: string }>) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, gap: 0.5 }}>
      <Typography variant="subtitle2">{title}</Typography>
      {description && (
        <Tooltip title={description} arrow placement="top">
          <HelpOutlineIcon fontSize={12} color="text.disabled" style={{ cursor: 'help', flexShrink: 0 }} />
        </Tooltip>
      )}
    </Box>
  );
}
