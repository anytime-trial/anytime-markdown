'use client';

import { Box, Skeleton } from '@mui/material';

export function TrailViewerSkeleton() {
  return (
    <Box
      sx={{
        height: 'calc(100vh - 64px)',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 2,
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading trail viewer"
    >
      <Skeleton variant="rectangular" width="100%" height={48} />
      <Skeleton variant="rectangular" sx={{ flex: 1 }} />
    </Box>
  );
}
