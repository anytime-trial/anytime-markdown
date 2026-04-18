'use client';

import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar, Box,   Button, Drawer, IconButton, List, ListItemButton, ListItemText,
ToggleButton,
ToggleButtonGroup, Toolbar, Typography, } from '@mui/material';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';

export default function LandingHeader() {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations('Landing');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showGraph = process.env.NEXT_PUBLIC_SHOW_GRAPH === '1';


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
          component={NextLink}
          href="/"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'text.primary',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Image src="/camel_face.png" alt="Anytime Markdown icon" width={28} height={28} style={{ borderRadius: 4 }} />
          Anytime Markdown
        </Typography>

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
