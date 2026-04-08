import { useState, useCallback } from 'react';
import { TrailViewerCore, useTrailDataSource } from '@anytime-markdown/trail-viewer';
import type { TrailFilter } from '@anytime-markdown/trail-viewer';

export function StandaloneTrailViewer({ isDark = true }: Readonly<{ isDark?: boolean }>) {
  const serverUrl = globalThis.location.origin;
  const dataSource = useTrailDataSource(serverUrl);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [filter, setFilter] = useState<TrailFilter>({});

  const handleSelectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
    dataSource.loadSession(id);
  }, [dataSource]);

  return (
    <TrailViewerCore
      isDark={isDark}
      sessions={dataSource.sessions}
      selectedSessionId={selectedSessionId}
      messages={dataSource.messages}
      filter={filter}
      onSelectSession={handleSelectSession}
      onFilterChange={setFilter}
    />
  );
}
