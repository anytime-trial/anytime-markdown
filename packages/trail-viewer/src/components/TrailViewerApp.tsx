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

// C4 編集コマンド名（TrailDataServer 側のメッセージ type と一致）
const C4_CMD = {
  ADD_ELEMENT: 'add-element',
  UPDATE_ELEMENT: 'update-element',
  ADD_RELATIONSHIP: 'add-relationship',
  REMOVE_ELEMENT: 'remove-element',
  PURGE_DELETED: 'purge-deleted-elements',
} as const;

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

  // 編集系: editable=true のときのみ sendCommand を呼ぶ。useCallback の依存は
  // 安定参照の sendCommand と editable のみ（c4 オブジェクト全体に依存させない）。
  const onAddElement = useCallback(
    (data: ElementFormData) => editable && sendCommand(C4_CMD.ADD_ELEMENT, { element: data }),
    [editable, sendCommand],
  );
  const onUpdateElement = useCallback(
    (id: string, data: ElementFormData) =>
      editable &&
      sendCommand(C4_CMD.UPDATE_ELEMENT, {
        id,
        changes: { name: data.name, description: data.description || undefined, external: data.external },
      }),
    [editable, sendCommand],
  );
  const onAddRelationship = useCallback(
    (data: RelationshipFormData) =>
      editable &&
      sendCommand(C4_CMD.ADD_RELATIONSHIP, {
        from: data.from,
        to: data.to,
        label: data.label || undefined,
        technology: data.technology || undefined,
      }),
    [editable, sendCommand],
  );
  const onRemoveElement = useCallback(
    (id: string) => editable && sendCommand(C4_CMD.REMOVE_ELEMENT, { id }),
    [editable, sendCommand],
  );
  const onPurgeDeleted = useCallback(
    () => editable && sendCommand(C4_CMD.PURGE_DELETED),
    [editable, sendCommand],
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
    onPurgeDeleted,
    onDocLinkClick: handleDocLinkClick,
    serverUrl,
    claudeActivity: c4.claudeActivity,
    multiAgentActivity: c4.multiAgentActivity,
    onResetClaudeActivity: () => sendCommand('reset-claude-activity'),
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
      c4={c4Props}
    />
  );
}
