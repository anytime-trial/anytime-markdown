'use client';

import { useCallback, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import {
  TrailViewerCore,
  useC4DataSource,
  useTrailDataSource,
} from '@anytime-markdown/trail-viewer';
import type { TrailFilter } from '@anytime-markdown/trail-viewer';

import { useThemeMode } from '../../providers';
import { useLocaleSwitch } from '../../LocaleProvider';

import { TrailErrorBoundary } from './TrailErrorBoundary';

const EMPTY_FILTER: TrailFilter = {};

/**
 * web アプリの Trail ビュワー。
 *
 * 拡張機能と同様に useTrailDataSource('') / useC4DataSource('') を使用し、
 * 同居する Next.js API route (/api/trail/..., /api/c4/...) から HTTP 経由で
 * データを取得する。Supabase 直接接続は廃止し、サーバ側 SupabaseTrailReader を
 * 経由する単一経路に統一した。
 */
export function TrailViewer() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  const { locale } = useLocaleSwitch();

  const dataSource = useTrailDataSource('');
  const c4 = useC4DataSource('');

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
        c4={c4.releases.length > 0 ? {
          c4Model: c4.c4Model,
          boundaries: c4.boundaries,
          featureMatrix: c4.featureMatrix,
          coverageMatrix: c4.coverageMatrix,
          coverageDiff: c4.coverageDiff,
          docLinks: c4.docLinks,
          releases: c4.releases,
          selectedRelease: c4.selectedRelease,
          onReleaseSelect: c4.setSelectedRelease,
          selectedRepo: c4.selectedRepo,
          onRepoSelect: c4.setSelectedRepo,
        } : undefined}
      />
    </TrailErrorBoundary>
  );
}
