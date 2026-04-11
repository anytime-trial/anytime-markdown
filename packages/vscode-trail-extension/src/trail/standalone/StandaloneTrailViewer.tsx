import { useState, useCallback, useMemo } from 'react';
import { TrailViewerCore, useTrailDataSource, useC4DataSource } from '@anytime-markdown/trail-viewer';
import type { TrailFilter, ElementFormData, RelationshipFormData } from '@anytime-markdown/trail-viewer';
import type { DocLink } from '@anytime-markdown/c4-kernel';

export function StandaloneTrailViewer({ isDark = true }: Readonly<{ isDark?: boolean }>) {
  const serverUrl = globalThis.location.origin;
  const dataSource = useTrailDataSource(serverUrl);
  const c4DataSource = useC4DataSource(serverUrl);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [filter, setFilter] = useState<TrailFilter>({});

  const handleSelectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
    dataSource.loadSession(id);
  }, [dataSource]);

  const handleFilterChange = useCallback((newFilter: TrailFilter) => {
    setFilter(newFilter);
    dataSource.searchSessions(newFilter);
  }, [dataSource]);

  // --- C4 mutation callbacks ---

  const handleAddElement = useCallback((data: ElementFormData) => {
    c4DataSource.sendCommand('add-element', { element: data });
  }, [c4DataSource]);

  const handleUpdateElement = useCallback((id: string, data: ElementFormData) => {
    c4DataSource.sendCommand('update-element', { id, changes: { name: data.name, description: data.description || undefined, external: data.external } });
  }, [c4DataSource]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    c4DataSource.sendCommand('add-relationship', { from: data.from, to: data.to, label: data.label || undefined, technology: data.technology || undefined });
  }, [c4DataSource]);

  const handleRemoveElement = useCallback((id: string) => {
    c4DataSource.sendCommand('remove-element', { id });
  }, [c4DataSource]);

  const handlePurgeDeleted = useCallback(() => {
    c4DataSource.sendCommand('purge-deleted-elements');
  }, [c4DataSource]);

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    c4DataSource.sendCommand('open-doc-link', { path: doc.path });
  }, [c4DataSource]);

  const c4Props = useMemo(() => ({
    c4Model: c4DataSource.c4Model,
    boundaries: c4DataSource.boundaries,
    featureMatrix: c4DataSource.featureMatrix,
    coverageMatrix: c4DataSource.coverageMatrix,
    coverageDiff: c4DataSource.coverageDiff,
    docLinks: c4DataSource.docLinks,
    connected: c4DataSource.connected,
    analysisProgress: c4DataSource.analysisProgress,
    onAddElement: handleAddElement,
    onUpdateElement: handleUpdateElement,
    onAddRelationship: handleAddRelationship,
    onRemoveElement: handleRemoveElement,
    onPurgeDeleted: handlePurgeDeleted,
    onDocLinkClick: handleDocLinkClick,
  }), [c4DataSource.c4Model, c4DataSource.boundaries, c4DataSource.featureMatrix,
       c4DataSource.coverageMatrix, c4DataSource.coverageDiff, c4DataSource.docLinks,
       c4DataSource.connected, c4DataSource.analysisProgress,
       handleAddElement, handleUpdateElement, handleAddRelationship,
       handleRemoveElement, handlePurgeDeleted, handleDocLinkClick]);

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
      releases={dataSource.releases}
      c4={c4Props}
    />
  );
}
