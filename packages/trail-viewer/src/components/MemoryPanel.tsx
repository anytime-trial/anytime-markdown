import { useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { MEMORY_TAB_DEFS, type MemoryTabValue } from './memoryTabs';

export interface MemoryPanelProps {
  readonly serverUrl: string;
}

function MemorySubPanelPlaceholder({ label }: Readonly<{ label: string }>) {
  const { colors } = useTrailTheme();
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="body2" sx={{ color: colors.textSecondary }}>
        {label}
      </Typography>
    </Box>
  );
}

export function MemoryPanel({ serverUrl: _serverUrl }: Readonly<MemoryPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [activeTab, setActiveTab] = useState<MemoryTabValue>('drift');
  const [dbExists] = useState<boolean | null>(null);

  if (dbExists === null) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.loading')}</Typography>
      </Box>
    );
  }

  if (dbExists === false) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
        <Typography variant="body1" sx={{ color: colors.textPrimary }}>{t('memory.noDb')}</Typography>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.noDb.description')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ borderBottom: 1, borderColor: colors.border }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v: MemoryTabValue) => setActiveTab(v)}
          aria-label="memory sub-tabs"
          sx={{
            minHeight: 36,
            '& .MuiTab-root': { color: colors.textSecondary, minHeight: 36, fontSize: '0.8rem', py: 0 },
            '& .Mui-selected': { color: colors.iceBlue },
            '& .MuiTabs-indicator': { backgroundColor: colors.iceBlue },
          }}
        >
          {MEMORY_TAB_DEFS.map((def) => (
            <Tab
              key={def.value}
              value={def.value}
              label={t(def.i18nKey)}
              id={def.id}
              aria-controls={def.panelId}
            />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
        {MEMORY_TAB_DEFS.map((def) => (
          <Box
            key={def.value}
            role="tabpanel"
            id={def.panelId}
            aria-labelledby={def.id}
            sx={{ display: activeTab !== def.value ? 'none' : 'flex', flexDirection: 'column', flex: 1, height: '100%' }}
          >
            <MemorySubPanelPlaceholder label={t(def.i18nKey)} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
