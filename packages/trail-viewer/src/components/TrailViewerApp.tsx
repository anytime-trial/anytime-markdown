// components/TrailViewerApp.tsx — Shared TrailViewer wrapper for both
// the VS Code extension and the Next.js web app.
//
// Wraps useTrailDataSource + useC4DataSource and renders TrailViewerCore.
// The serverUrl prop controls the data source mode:
//   - ''                          : same-origin relative paths (web app, Next.js)
//   - 'http://localhost:NNNN'     : extension's bundled HTTP/WebSocket server
// Edit callbacks are optional. Omitting them yields a read-only viewer.

import { useCallback, useMemo, useState } from 'react';

import type { DocLink } from '@anytime-markdown/trail-core/c4';

import { TrailViewerCore } from './TrailViewerCore';
import { useTrailDataSource } from '../hooks/useTrailDataSource';
import { useC4DataSource } from '../c4/hooks/useC4DataSource';
import type { ElementFormData, RelationshipFormData } from '../c4/components/C4EditDialogs';
import type { TrailFilter } from '../parser/types';
import type { TrailLocale } from '../i18n/types';

const EMPTY_FILTER: TrailFilter = {};

export interface TrailViewerAppProps {
  /** Data source URL. Use '' for same-origin (Next.js relative). */
  readonly serverUrl: string;
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly containerHeight?: string;
  /**
   * C4 編集コマンドを WebSocket 経由でサーバに送信する。
   * 拡張機能では true（C4Panel で受け取って永続化）、web アプリでは false（read-only）。
   * デフォルト false。
   */
  readonly editable?: boolean;
  /**
   * Doc link クリック時のコールバック。
   * 拡張機能では VS Code に通知、web アプリでは新規タブで開く等の挙動を上書きできる。
   */
  readonly onDocLinkClick?: (doc: DocLink) => void;
}

export function TrailViewerApp({
  serverUrl,
  isDark = true,
  locale,
  containerHeight,
  editable = false,
  onDocLinkClick,
}: Readonly<TrailViewerAppProps>) {
  const dataSource = useTrailDataSource(serverUrl);
  const c4 = useC4DataSource(serverUrl);

  // 編集系: editable=true のときのみ c4.sendCommand に変換する
  const onAddElement = useCallback(
    (data: ElementFormData) => editable && c4.sendCommand('add-element', { element: data }),
    [editable, c4],
  );
  const onUpdateElement = useCallback(
    (id: string, data: ElementFormData) =>
      editable &&
      c4.sendCommand('update-element', {
        id,
        changes: { name: data.name, description: data.description || undefined, external: data.external },
      }),
    [editable, c4],
  );
  const onAddRelationship = useCallback(
    (data: RelationshipFormData) =>
      editable &&
      c4.sendCommand('add-relationship', {
        from: data.from,
        to: data.to,
        label: data.label || undefined,
        technology: data.technology || undefined,
      }),
    [editable, c4],
  );
  const onRemoveElement = useCallback(
    (id: string) => editable && c4.sendCommand('remove-element', { id }),
    [editable, c4],
  );
  const onPurgeDeleted = useCallback(
    () => editable && c4.sendCommand('purge-deleted-elements'),
    [editable, c4],
  );

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

  // c4 prop は常に渡し、C4ViewerCore が selectedRepo の自動初期化と空状態を内部で処理する
  const c4Props = useMemo(
    () => ({
      c4Model: c4.c4Model,
      boundaries: c4.boundaries,
      featureMatrix: c4.featureMatrix,
      coverageMatrix: c4.coverageMatrix,
      coverageDiff: c4.coverageDiff,
      docLinks: c4.docLinks,
      connected: c4.connected,
      analysisProgress: c4.analysisProgress,
      releases: c4.releases,
      selectedRelease: c4.selectedRelease,
      onReleaseSelect: c4.setSelectedRelease,
      selectedRepo: c4.selectedRepo,
      onRepoSelect: c4.setSelectedRepo,
      onAddElement,
      onUpdateElement,
      onAddRelationship,
      onRemoveElement,
      onPurgeDeleted,
      onDocLinkClick,
    }),
    [
      c4.c4Model,
      c4.boundaries,
      c4.featureMatrix,
      c4.coverageMatrix,
      c4.coverageDiff,
      c4.docLinks,
      c4.connected,
      c4.analysisProgress,
      c4.releases,
      c4.selectedRelease,
      c4.setSelectedRelease,
      c4.selectedRepo,
      c4.setSelectedRepo,
      onAddElement,
      onUpdateElement,
      onAddRelationship,
      onRemoveElement,
      onPurgeDeleted,
      onDocLinkClick,
    ],
  );

  return (
    <TrailViewerCore
      isDark={isDark}
      locale={locale}
      containerHeight={containerHeight}
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
