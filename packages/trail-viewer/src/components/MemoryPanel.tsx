import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { MEMORY_TAB_DEFS, type MemoryTabValue } from './memoryTabs';
import { DriftPanel } from './memory/DriftPanel';
import { BugHistoryPanel } from './memory/BugHistoryPanel';
import { ReviewPanel } from './memory/ReviewPanel';
import { PipelineRunsPanel } from './memory/PipelineRunsPanel';
import { MemoryReader } from '../data/readers/MemoryReader';
import type { MemoryDriftEventRow } from '../data/types';

function parseHashSubTab(hash: string): MemoryTabValue | null {
  const match = /^#memory\/(drift|bug|review|runs)/.exec(hash);
  if (!match) return null;
  return match[1] as MemoryTabValue;
}

export interface MemoryPanelProps {
  readonly serverUrl: string;
}

export function MemoryPanel({ serverUrl }: Readonly<MemoryPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, isDark } = useTrailTheme();

  const initialTab = useMemo(() => parseHashSubTab(globalThis.location?.hash ?? '') ?? 'drift', []);
  const [activeTab, setActiveTab] = useState<MemoryTabValue>(initialTab);
  const [dbExists, setDbExists] = useState<boolean | null>(null);
  const [driftRows, setDriftRows] = useState<readonly MemoryDriftEventRow[]>([]);

  const reader = useMemo(() => new MemoryReader(serverUrl), [serverUrl]);
  const probedRef = useRef(false);

  // Probe once on mount
  useEffect(() => {
    if (probedRef.current) return;
    probedRef.current = true;
    void reader.probe().then((exists) => {
      setDbExists(exists);
    });
  }, [reader]);

  // Load drift rows when DB is confirmed to exist
  useEffect(() => {
    if (!dbExists) return;
    void reader.listDriftEvents({ unresolvedOnly: false, limit: 200 }).then(setDriftRows);
  }, [dbExists, reader]);

  const handleResolve = useCallback(async (id: string, note: string) => {
    await reader.resolveDriftEvent(id, note);
    const updated = await reader.listDriftEvents({ unresolvedOnly: false, limit: 200 });
    setDriftRows(updated);
  }, [reader]);

  const handleLoadDetail = useCallback((id: string) => reader.getDriftEventDetail(id), [reader]);

  const handleTabChange = useCallback((_e: React.SyntheticEvent, v: MemoryTabValue) => {
    setActiveTab(v);
    if (typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', `#memory/${v}`);
    }
  }, []);

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
          onChange={handleTabChange}
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

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {MEMORY_TAB_DEFS.map((def) => (
          <Box
            key={def.value}
            role="tabpanel"
            id={def.panelId}
            aria-labelledby={def.id}
            sx={{ display: activeTab !== def.value ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
          >
            {def.value === 'drift' && (
              <DriftPanel rows={driftRows} onResolve={handleResolve} onLoadDetail={handleLoadDetail} />
            )}
            {def.value === 'bug' && (
              <BugHistoryPanel reader={reader} isDark={isDark} />
            )}
            {def.value === 'review' && (
              <ReviewPanel reader={reader} />
            )}
            {def.value === 'runs' && (
              <PipelineRunsPanel reader={reader} />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
