'use client';

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Box, Button, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function MarkdownError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('Common');

  useEffect(() => {
    console.error('Editor error:', error);
  }, [error]);

  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        p: 3,
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />
      <Typography variant="h6" component="h1" fontWeight={600}>
        {t('error')}
      </Typography>
      <Button onClick={() => reset()} variant="outlined">
        {t('retry')}
      </Button>
    </Box>
  );
}
