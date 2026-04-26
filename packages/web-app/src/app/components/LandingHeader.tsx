'use client';

import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar, Box, Button, Drawer, IconButton,
  Toolbar, Typography,
} from '@mui/material';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

export default function LandingHeader() {
  const { locale, setLocale } = useLocaleSwitch();
  const { themeMode, setThemeMode } = useThemeMode();
  const t = useTranslations('Landing');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDark = themeMode === 'dark';
  const badgeCircle = isDark ? '#F5F3EC' : '#1F1E1C';
  const badgeHoof   = isDark ? '#15171C' : '#FBF9F3';

  const toggleLocale = () => setLocale(locale === 'ja' ? 'en' : 'ja');
  const toggleTheme = () => setThemeMode(isDark ? 'light' : 'dark');
  const currentLocaleLabel = locale === 'ja' ? 'JA' : 'EN';

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
        <Box
          component={NextLink}
          href="/"
          aria-label="Anytime Trail home"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}
        >
          <svg viewBox="0 0 48 48" width={32} height={32} aria-hidden="true" focusable="false">
            <circle cx="24" cy="24" r="22" fill={badgeCircle} />
            <g fill={badgeHoof} transform="translate(24 26)">
              <path d="M -6 -2 Q -10 -8 -6 -13 Q -1 -17 3 -13 Q 7 -8 3 -2 Z" />
              <path d="M 1 4 Q -3 -2 1 -7 Q 6 -11 10 -7 Q 14 -2 10 4 Z" />
            </g>
          </svg>
          <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <Typography
              component="span"
              sx={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'text.primary',
                lineHeight: 1.15,
              }}
            >
              Anytime
            </Typography>
            <Typography
              component="span"
              sx={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: '0.58rem',
                letterSpacing: '0.22em',
                color: 'secondary.main',
                lineHeight: 1.2,
              }}
            >
              TRAIL
            </Typography>
          </Box>
        </Box>

        <Box component="nav" aria-label={t('ariaMainNavigation')} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            onClick={toggleLocale}
            aria-label={t('ariaLanguage')}
            size="small"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              minWidth: 0,
              px: 1.5,
              py: 0.25,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            {currentLocaleLabel}
          </Button>

          <Button
            onClick={toggleTheme}
            aria-label={t('ariaTheme')}
            size="small"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              minWidth: 0,
              px: 1.5,
              py: 0.25,
              fontSize: '1rem',
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            ◐
          </Button>

          <IconButton
            aria-label={t('ariaMenu')}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>
        </Box>
      </Toolbar>

      <Drawer
        id="mobile-nav-drawer"
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        aria-label={t('ariaMobileNavigation')}
      >
        <Box sx={{ width: 220, pt: 2 }} component="nav" aria-label={t('ariaMobileNavigation')}>
          <Box sx={{ px: 2, pt: 1, display: 'flex', gap: 1 }}>
            <Button
              onClick={() => { toggleLocale(); setDrawerOpen(false); }}
              aria-label={t('ariaLanguage')}
              size="small"
              fullWidth
              sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary' }}
            >
              {currentLocaleLabel}
            </Button>
            <Button
              onClick={() => { toggleTheme(); setDrawerOpen(false); }}
              aria-label={t('ariaTheme')}
              size="small"
              fullWidth
              sx={{ fontSize: '1rem', color: 'text.secondary' }}
            >
              ◐
            </Button>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
