import { useState, useCallback } from 'react';
import { TrailViewerCore, useTrailDataSource } from '@anytime-markdown/trail-viewer';
import type { TrailFilter } from '@anytime-markdown/trail-viewer';

export function StandaloneTrailViewer({ isDark = true }: Readonly<{ isDark?: boolean }>) {
  const serverUrl = globalThis.location.origin;
  const dataSource = useTrailDataSource(serverUrl);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [filter, setFilter] = useState<TrailFilter>({});
  const [reclassifying, setReclassifying] = useState(false);

  const handleReclassify = useCallback(async () => {
    setReclassifying(true);
    try {
      await dataSource.reclassify();
    } finally {
      setReclassifying(false);
    }
  }, [dataSource]);

  const handleSelectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
    dataSource.loadSession(id);
  }, [dataSource]);

  const handleFilterChange = useCallback((newFilter: TrailFilter) => {
    setFilter(newFilter);
    dataSource.searchSessions(newFilter);
  }, [dataSource]);

  return (
    <TrailViewerCore
      isDark={isDark}
      sessions={dataSource.sessions}
      allSessions={dataSource.allSessions}
      selectedSessionId={selectedSessionId}
      messages={dataSource.messages}
      filter={filter}
      onSelectSession={handleSelectSession}
      onFilterChange={handleFilterChange}
      prompts={dataSource.prompts}
      analytics={dataSource.analytics}
      fetchSessionMessages={dataSource.fetchSessionMessages}
      fetchSessionCommits={dataSource.fetchSessionCommits}
      fetchSessionToolMetrics={dataSource.fetchSessionToolMetrics}
      costOptimization={dataSource.costOptimization}
      onReclassify={handleReclassify}
      reclassifying={reclassifying}
    />
  );
}
