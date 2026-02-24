"use client";

import { Box, CircularProgress } from '@mui/material';

type FullPageLoaderProps = {
  minHeight?: string;
};

const FullPageLoader: React.FC<FullPageLoaderProps> = ({ minHeight = '60vh' }) => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight }}>
    <CircularProgress />
  </Box>
);

export default FullPageLoader;
