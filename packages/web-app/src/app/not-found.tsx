'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('Landing');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <Typography variant="h4" component="h1" fontWeight={600}>
        404
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {t('notFoundTitle')}
      </Typography>
      <Button component={Link} href="/" variant="outlined" sx={{ mt: 1 }}>
        {t('notFoundLink')}
      </Button>
    </Box>
  );
}
