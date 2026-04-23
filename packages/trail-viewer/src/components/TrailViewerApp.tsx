// components/TrailViewerApp.tsx — Shared TrailViewer wrapper for both
// the VS Code extension and the Next.js web app.
//
// Wraps useTrailDataSource + useC4DataSource and renders TrailViewerCore.
// The serverUrl prop controls the data source mode:
//   - ''                          : same-origin relative paths (web app, Next.js)
//   - 'http://localhost:NNNN'     : extension's bundled HTTP/WebSocket server

import { useCallback, useState } from 'react';

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
  const sendCommand = c4.sendCommand;

  // effectiveEditable: editing is only possible when a repo is selected
  const effectiveEditable = editable && !!c4.selectedRepo;

  const onAddElement = useCallback(
    (data: ElementFormData) => {
      if (!effectiveEditable) return;
      void c4.addElement({ type: data.type, name: data.name, description: data.description || undefined, external: data.external, parentId: data.parentId ?? null, serviceType: data.serviceType });
    },
    [effectiveEditable, c4],
  );
  const onUpdateElement = useCallback(
    (id: string, data: ElementFormData) => {
      if (!effectiveEditable) return;
      void c4.updateElement(id, { name: data.name, description: data.description || undefined, external: data.external });
    },
    [effectiveEditable, c4],
  );
  const onAddRelationship = useCallback(
    (data: RelationshipFormData) => {
      if (!effectiveEditable) return;
      void c4.addRelationship({ fromId: data.from, toId: data.to, label: data.label || undefined, technology: data.technology || undefined });
    },
    [effectiveEditable, c4],
  );
  const onRemoveElement = useCallback(
    (id: string) => {
      if (!effectiveEditable) return;
      void c4.removeElement(id);
    },
    [effectiveEditable, c4],
  );

  // onDocLinkClick が未指定の場合、WebSocket 経由でサーバーにファイルを開かせる
  // （VS Code 拡張モード: server が 'open-doc-link' を受け取り vscode.openTextDocument を呼ぶ）
  const handleDocLinkClick = useCallback(
    (doc: DocLink) => {
      if (onDocLinkClick) {
        onDocLinkClick(doc);
      } else {
        sendCommand('open-doc-link', { path: doc.path });
      }
    },
    [onDocLinkClick, sendCommand],
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

  // c4 prop は常に渡し、C4ViewerCore が selectedRepo の自動初期化と空状態を内部で処理する。
  // 内部的に hook が返す各値は React state なので、shallow object literal でそのまま渡す。
  const c4Props = {
    c4Model: c4.c4Model,
    boundaries: c4.boundaries,
    featureMatrix: c4.featureMatrix,
    dsmMatrix: c4.dsmMatrix,
    coverageMatrix: c4.coverageMatrix,
    coverageDiff: c4.coverageDiff,
    complexityMatrix: c4.complexityMatrix,
    importanceMatrix: c4.importanceMatrix,
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
    onDocLinkClick: handleDocLinkClick,
    serverUrl,
    claudeActivity: c4.claudeActivity,
    multiAgentActivity: c4.multiAgentActivity,
    onResetClaudeActivity: () => sendCommand('reset-claude-activity'),
    manualGroups: c4.manualGroups,
  };

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
      fetchDayToolMetrics={dataSource.fetchDayToolMetrics}
      costOptimization={dataSource.costOptimization}
      releases={dataSource.releases}
      fetchCombinedData={dataSource.fetchCombinedData}
      fetchQualityMetrics={dataSource.fetchQualityMetrics}
      tokenBudgets={dataSource.tokenBudgets}
      c4={c4Props}
    />
  );
}
