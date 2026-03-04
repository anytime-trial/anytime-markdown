"use client";

import { Box, CircularProgress, Typography } from '@mui/material';

type FullPageLoaderProps = {
  minHeight?: string;
  ariaLabel?: string;
};

const FullPageLoader: React.FC<FullPageLoaderProps> = ({ minHeight = '60vh', ariaLabel = 'Loading' }) => (
  <Box role="status" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight, gap: 2 }}>
    <CircularProgress aria-label={ariaLabel} />
    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.02em' }}>
      Anytime Markdown
    </Typography>
  </Box>
);

export default FullPageLoader;
