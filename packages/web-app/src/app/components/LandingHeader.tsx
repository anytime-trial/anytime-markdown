'use client';

import { AppBar, Toolbar, Typography, ToggleButtonGroup, ToggleButton, Button, Box } from '@mui/material';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleSwitch } from '../LocaleProvider';

export default function LandingHeader() {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations('Landing');

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="transparent"
      sx={{
        bgcolor: 'transparent',
        backdropFilter: 'blur(12px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 } }}>
        <Typography
          variant="h6"
          component="span"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'text.primary',
          }}
        >
          Anytime Markdown
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          <ToggleButtonGroup
            value={locale}
            exclusive
            onChange={(_, val) => { if (val) setLocale(val); }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.25,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
                borderColor: 'divider',
                color: 'text.secondary',
                '&.Mui-selected': {
                  color: 'text.primary',
                  bgcolor: 'action.selected',
                },
              },
            }}
          >
            <ToggleButton value="en" aria-label="English">EN</ToggleButton>
            <ToggleButton value="ja" aria-label="Japanese">JA</ToggleButton>
          </ToggleButtonGroup>

          <Button
            component={NextLink}
            href="/markdown"
            variant="contained"
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 2.5,
              bgcolor: 'secondary.main',
              color: '#1a1a1a',
              '&:hover': { bgcolor: 'secondary.dark' },
            }}
          >
            {t('openEditor')}
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
