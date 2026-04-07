import type { DocLink } from '@anytime-markdown/c4-kernel';
import { useCallback } from 'react';

import { C4ViewerCore, useC4DataSource } from '@anytime-markdown/c4-viewer';
import type { ElementFormData, RelationshipFormData } from '@anytime-markdown/c4-viewer';

export function StandaloneC4Viewer({ isDark = true }: Readonly<{ isDark?: boolean }>) {
  const serverUrl = globalThis.location.origin;
  const dataSource = useC4DataSource(serverUrl);

  // --- Mutation callbacks (delegate to dataSource.sendCommand) ---

  const handleAddElement = useCallback((data: ElementFormData) => {
    dataSource.sendCommand('add-element', { element: data });
  }, [dataSource]);

  const handleUpdateElement = useCallback((id: string, data: ElementFormData) => {
    dataSource.sendCommand('update-element', { id, changes: { name: data.name, description: data.description || undefined, external: data.external } });
  }, [dataSource]);

  const handleAddRelationship = useCallback((data: RelationshipFormData) => {
    dataSource.sendCommand('add-relationship', { from: data.from, to: data.to, label: data.label || undefined, technology: data.technology || undefined });
  }, [dataSource]);

  const handleRemoveElement = useCallback((id: string) => {
    dataSource.sendCommand('remove-element', { id });
  }, [dataSource]);

  const handlePurgeDeleted = useCallback(() => {
    dataSource.sendCommand('purge-deleted-elements');
  }, [dataSource]);

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    dataSource.sendCommand('open-doc-link', { path: doc.path });
  }, [dataSource]);

  return (
    <C4ViewerCore
      isDark={isDark}
      c4Model={dataSource.c4Model}
      boundaries={dataSource.boundaries}
      featureMatrix={dataSource.featureMatrix}
      coverageMatrix={dataSource.coverageMatrix}
      coverageDiff={dataSource.coverageDiff}
      docLinks={dataSource.docLinks}
      connected={dataSource.connected}
      analysisProgress={dataSource.analysisProgress}
      onAddElement={handleAddElement}
      onUpdateElement={handleUpdateElement}
      onAddRelationship={handleAddRelationship}
      onRemoveElement={handleRemoveElement}
      onPurgeDeleted={handlePurgeDeleted}
      onDocLinkClick={handleDocLinkClick}
    />
  );
}
