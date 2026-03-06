'use client';

import { useState } from 'react';
import {
  AppBar, Toolbar, Typography, ToggleButtonGroup, ToggleButton,
  Button, Box, IconButton, Drawer, List, ListItemButton, ListItemText,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleSwitch } from '../LocaleProvider';

export default function LandingHeader() {
  const { locale, setLocale } = useLocaleSwitch();
  const t = useTranslations('Landing');
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          component="div"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'text.primary',
          }}
        >
          Anytime Markdown
        </Typography>

        <Box component="nav" aria-label="Main navigation" sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          <Button
            component={NextLink}
            href="/features"
            sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('featuresPage')}
          </Button>

          <ToggleButtonGroup
            value={locale}
            exclusive
            onChange={(_, val) => { if (val) setLocale(val); }}
            size="small"
            aria-label="Language"
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

          <IconButton
            aria-label="Menu"
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
      >
        <Box sx={{ width: 220, pt: 2 }} role="navigation" aria-label="Mobile navigation">
          <List>
            <ListItemButton component={NextLink} href="/features" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('featuresPage')} />
            </ListItemButton>
            <ListItemButton component={NextLink} href="/markdown" onClick={() => setDrawerOpen(false)}>
              <ListItemText primary={t('openEditor')} />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}
