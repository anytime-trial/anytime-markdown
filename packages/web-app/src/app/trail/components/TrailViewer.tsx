'use client';

import { useCallback, useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { TrailViewerCore, useTrailDataSource } from '@anytime-markdown/trail-viewer';
import type { TrailFilter, SupabaseConfig } from '@anytime-markdown/trail-viewer';

import { useThemeMode } from '../../providers';
import { useLocaleSwitch } from '../../LocaleProvider';
import type { C4Model, BoundaryInfo, FeatureMatrix } from '@anytime-markdown/trail-core/c4';

import { TrailErrorBoundary } from './TrailErrorBoundary';

interface C4Payload {
  model: C4Model;
  boundaries: BoundaryInfo[];
  featureMatrix?: FeatureMatrix;
}

const EMPTY_FILTER: TrailFilter = {};

export function TrailViewer() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const { locale } = useLocaleSwitch();

  const supabaseConfig: SupabaseConfig | undefined =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? {
          url: process.env.NEXT_PUBLIC_SUPABASE_URL,
          anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        }
      : undefined;

  const dataSource = useTrailDataSource(undefined, supabaseConfig);

  const [filter, setFilter] = useState<TrailFilter>(EMPTY_FILTER);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();

  const handleSelectSession = useCallback(
    (id: string) => {
      setSelectedSessionId(id);
      dataSource.loadSession(id);
    },
    [dataSource],
  );

  const handleFilterChange = useCallback(
    (newFilter: TrailFilter) => {
      setFilter(newFilter);
      dataSource.searchSessions(newFilter);
    },
    [dataSource],
  );

  const [c4Payload, setC4Payload] = useState<C4Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchC4(): Promise<void> {
      try {
        const res = await fetch('/api/c4model');
        if (!res.ok) return;
        const data = (await res.json()) as C4Payload;
        if (!cancelled && data?.model?.elements) {
          setC4Payload(data);
        }
      } catch { /* C4 unavailable — tab hidden */ }
    }
    void fetchC4();
    return () => { cancelled = true; };
  }, []);

  if (dataSource.loading && dataSource.sessions.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 64px)',
          bgcolor: isDark ? '#0D1117' : '#FAFAFA',
        }}
      >
        <CircularProgress sx={{ color: isDark ? '#90CAF9' : '#1976D2' }} />
      </Box>
    );
  }

  return (
    <TrailErrorBoundary>
      <TrailViewerCore
        locale={locale}
        isDark={isDark}
        sessions={dataSource.sessions}
        allSessions={dataSource.allSessions}
        selectedSessionId={selectedSessionId}
        messages={dataSource.messages}
        filter={filter}
        onSelectSession={handleSelectSession}
        onFilterChange={handleFilterChange}
        analytics={dataSource.analytics}
        costOptimization={dataSource.costOptimization}
        releases={dataSource.releases}
        fetchSessionMessages={dataSource.fetchSessionMessages}
        fetchSessionCommits={dataSource.fetchSessionCommits}
        fetchSessionToolMetrics={dataSource.fetchSessionToolMetrics}
        c4={c4Payload ? {
          c4Model: c4Payload.model,
          boundaries: c4Payload.boundaries,
          featureMatrix: c4Payload.featureMatrix ?? null,
          coverageMatrix: null,
          coverageDiff: null,
        } : undefined}
      />
    </TrailErrorBoundary>
  );
}
