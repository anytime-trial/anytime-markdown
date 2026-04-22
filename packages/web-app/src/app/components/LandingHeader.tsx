'use client';

import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar, Box,   Button, Drawer, IconButton, List, ListItemButton, ListItemText,
ToggleButton,
ToggleButtonGroup, Toolbar, Typography, } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';

export default function LandingHeader() {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations('Landing');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const badgeCircle = isDark ? '#F5F3EC' : '#1F1E1C';
  const badgeHoof   = isDark ? '#15171C' : '#FBF9F3';
  const showGraph = process.env.NEXT_PUBLIC_SHOW_GRAPH === '1';
  const showSheet = process.env.NEXT_PUBLIC_SHOW_SHEET === '1';
  const showPlaylist = process.env.NEXT_PUBLIC_SHOW_PLAYLIST === '1';


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

        <Box component="nav" aria-label={t('ariaMainNavigation')} sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          <Button
            component={NextLink}
            href="/markdown"
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('openEditor')}
          </Button>
          <Button
            component={NextLink}
            href="/trail"
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('trailViewerPage')}
          </Button>
          <Button
            component={NextLink}
            href="/report"
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('reportPage')}
          </Button>
          <Button
            component={NextLink}
            href="/docs"
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('sitesPage')}
          </Button>
          {showGraph && (
            <Button
              component={NextLink}
              href="/graph"
              sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {t('graphPage')}
            </Button>
          )}
          {showSheet && (
            <Button
              component={NextLink}
              href="/sheet"
              sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {t('sheetPage')}
            </Button>
          )}
          {showPlaylist && (
            <Button
              component={NextLink}
              href="/playlist"
              sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {t('playlistPage')}
            </Button>
          )}

          <ToggleButtonGroup
            value={locale}
            exclusive
            onChange={(_, val) => { if (val) setLocale(val); }}
            size="small"
            aria-label={t('ariaLanguage')}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
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
          <List>
            <ListItemButton component={NextLink} href="/markdown" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('openEditor')} />
            </ListItemButton>
            <ListItemButton component={NextLink} href="/trail" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('trailViewerPage')} />
            </ListItemButton>
            <ListItemButton component={NextLink} href="/report" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('reportPage')} />
            </ListItemButton>
            <ListItemButton component={NextLink} href="/docs" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('sitesPage')} />
            </ListItemButton>
            {showGraph && (
              <ListItemButton component={NextLink} href="/graph" onClick={() => setDrawerOpen(false)}>
                <ListItemText primary={t('graphPage')} />
              </ListItemButton>
            )}
            {showSheet && (
              <ListItemButton component={NextLink} href="/sheet" onClick={() => setDrawerOpen(false)}>
                <ListItemText primary={t('sheetPage')} />
              </ListItemButton>
            )}
            {showPlaylist && (
              <ListItemButton component={NextLink} href="/playlist" onClick={() => setDrawerOpen(false)}>
                <ListItemText primary={t('playlistPage')} />
              </ListItemButton>
            )}
          </List>
          <Box sx={{ px: 2, pt: 1 }}>
            <ToggleButtonGroup
              value={locale}
              exclusive
              onChange={(_, val) => { if (val) setLocale(val); }}
              size="small"
              fullWidth
              aria-label={t('ariaLanguage')}
              sx={{
                '& .MuiToggleButton-root': {
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'none',
                },
              }}
            >
              <ToggleButton value="en" aria-label="English">EN</ToggleButton>
              <ToggleButton value="ja" aria-label="Japanese">JA</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
