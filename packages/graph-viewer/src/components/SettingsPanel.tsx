'use client';

import { getCanvasColors } from '@anytime-markdown/graph-core';
import {
  Box,
  CloseIcon,
  DarkModeIcon,
  IconButton,
  LightModeIcon,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '../ui';
import { useGraphT } from '../i18n/context';
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
  const t = useGraphT('Graph');
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  if (!open) return null;

  return (
    <Box
      style={{
        width,
        flexShrink: 0,
        backgroundColor: colors.panelBg,
        borderLeft: `1px solid ${colors.panelBorder}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${colors.panelBorder}` }}>
        <Text variant="subtitle2" style={{ color: colors.textPrimary, fontWeight: 700 }}>
          {t('settings')}
        </Text>
        <IconButton size="small" onClick={onClose} style={{ color: colors.textSecondary }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Box>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {isDark
              ? <DarkModeIcon fontSize="small" color={colors.textSecondary} />
              : <LightModeIcon fontSize="small" color={colors.textSecondary} />
            }
            <Text style={{ color: colors.textPrimary, fontWeight: 600 }}>
              {t('themeMode')}
            </Text>
          </Box>
          <ToggleButtonGroup
            value={themeMode}
            exclusive
            onChange={(_, v) => v && onThemeModeChange?.(v as 'light' | 'dark')}
            size="small"
            fullWidth
          >
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Text style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8, display: 'block' }}>
            {t('language')}
          </Text>
          <ToggleButtonGroup
            value={locale}
            exclusive
            onChange={(_, v) => v && onLocaleChange?.(v)}
            size="small"
            fullWidth
          >
            <ToggleButton value="en">English</ToggleButton>
            <ToggleButton value="ja">Japanese</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Box>
  );
}
