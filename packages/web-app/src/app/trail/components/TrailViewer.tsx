'use client';

import { useCallback, useState } from 'react';

import { TrailViewerCore, useTrailDataSource } from '@anytime-markdown/trail-viewer';
import type { TrailFilter } from '@anytime-markdown/trail-viewer';

import { useThemeMode } from '../../providers';

const EMPTY_FILTER: TrailFilter = {};

export function TrailViewer() {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';

  const dataSource = useTrailDataSource();

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

  return (
    <TrailViewerCore
      isDark={isDark}
      sessions={dataSource.sessions}
      selectedSessionId={selectedSessionId}
      messages={dataSource.messages}
      filter={filter}
      onSelectSession={handleSelectSession}
      onFilterChange={handleFilterChange}
    />
  );
}
