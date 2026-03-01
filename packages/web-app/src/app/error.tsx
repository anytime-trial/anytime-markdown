'use client';

import { Box, Button, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('Common');

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
      <Typography variant="h5" component="h1" fontWeight={600}>
        {t('error')}
      </Typography>
      <Button onClick={() => reset()} variant="outlined">
        {t('retry')}
      </Button>
    </Box>
  );
}
