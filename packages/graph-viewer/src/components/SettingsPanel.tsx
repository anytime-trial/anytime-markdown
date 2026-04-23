'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { Close as CloseIcon, DarkMode as DarkModeIcon, LightMode as LightModeIcon } from '@mui/icons-material';
import { Box, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import React from 'react';

interface SettingsPanelProps {
  open: boolean;
  width: number;
  onClose: () => void;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  locale?: string;
  onLocaleChange?: (locale: string) => void;
}

export function SettingsPanel({ open, width, onClose, themeMode = 'dark', onThemeModeChange, locale = 'ja', onLocaleChange }: Readonly<SettingsPanelProps>) {
  const t = useTranslations('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  if (!open) return null;

  const toggleSx = {
    '& .MuiToggleButton-root': {
      px: 1.5, py: 0.5, fontSize: '0.75rem',
      color: colors.textSecondary,
      borderColor: colors.panelBorder,
      '&.Mui-selected': {
        color: colors.accentColor,
        backgroundColor: `${colors.accentColor}1F`,
      },
    },
  };

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        bgcolor: colors.panelBg,
        borderLeft: `1px solid ${colors.panelBorder}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${colors.panelBorder}` }}>
        <Typography variant="subtitle2" sx={{ color: colors.textPrimary, fontWeight: 700 }}>
          {t('settings')}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: colors.textSecondary }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {isDark
              ? <DarkModeIcon fontSize="small" sx={{ color: colors.textSecondary }} />
              : <LightModeIcon fontSize="small" sx={{ color: colors.textSecondary }} />
            }
            <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 600 }}>
              {t('themeMode')}
            </Typography>
          </Box>
          <ToggleButtonGroup
            value={themeMode}
            exclusive
            onChange={(_, v) => v && onThemeModeChange?.(v)}
            size="small"
            fullWidth
            sx={toggleSx}
          >
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 600, mb: 1 }}>
            {t('language')}
          </Typography>
          <ToggleButtonGroup
            value={locale}
            exclusive
            onChange={(_, v) => v && onLocaleChange?.(v)}
            size="small"
            fullWidth
            sx={toggleSx}
          >
            <ToggleButton value="en">English</ToggleButton>
            <ToggleButton value="ja">Japanese</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Box>
  );
}
