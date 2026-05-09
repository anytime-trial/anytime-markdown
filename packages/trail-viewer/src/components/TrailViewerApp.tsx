// components/TrailViewerApp.tsx — Shared TrailViewer wrapper for both
// the VS Code extension and the Next.js web app.
//
// Wraps useTrailDataSource + useC4DataSource and renders TrailViewerCore.
// The serverUrl prop controls the data source mode:
//   - ''                          : same-origin relative paths (web app, Next.js)
//   - 'http://localhost:NNNN'     : extension's bundled HTTP/WebSocket server

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DocLink } from '@anytime-markdown/trail-core/c4';
import { DEFAULT_COMMIT_CATEGORIES } from '@anytime-markdown/trail-core/commitCategories';
import { DEFAULT_TOOL_CATEGORIES } from '@anytime-markdown/trail-core/toolCategories';
import { DEFAULT_SKILL_CATEGORIES } from '@anytime-markdown/trail-core/skillCategories';

import { TrailViewerCore } from './TrailViewerCore';
import { useTrailDataSource } from '../hooks/useTrailDataSource';
import { useC4DataSource } from '../c4/hooks/useC4DataSource';
import { useTraceFiles } from '../hooks/useTraceFiles';
import type { ElementFormData, RelationshipFormData } from '../c4/components/dialogs/C4EditDialogs';
import type { TrailFilter } from '../domain/parser/types';
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
  /** 初期表示タブ番号（0=Analytics, 1=Messages, 2=Prompts, 4=C4, 5=Trace）*/
  readonly initialTab?: number;
  /** C4 ビューアの初期表示レベル（1=L1 Context, 2=L2 Container, 3=L3 Component, 4=L4 Code）*/
  readonly initialC4Level?: number;
  /**
   * WebSocket 接続を無効化する。
   * web アプリなど WebSocket サーバーが存在しない場合に true を渡す。
   * デフォルト false（拡張機能モード）。
   */
  readonly disableWebSocket?: boolean;
}

export function TrailViewerApp({
  serverUrl,
  isDark = true,
  locale,
  containerHeight,
  editable = false,
  onDocLinkClick,
  initialTab,
  initialC4Level,
  disableWebSocket = false,
}: Readonly<TrailViewerAppProps>) {
  const dataSource = useTrailDataSource(serverUrl);
  const c4 = useC4DataSource(serverUrl, disableWebSocket);
  const sendCommand = c4.sendCommand;

  const [commitCategories, setCommitCategories] = useState<ReadonlyMap<string, number>>(
    DEFAULT_COMMIT_CATEGORIES,
  );
  const [toolCategories, setToolCategories] = useState<ReadonlyMap<string, number>>(
    DEFAULT_TOOL_CATEGORIES,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${serverUrl}/api/config/commit-categories`);
        if (!res.ok) return;
        const json = await res.json() as Record<string, number>;
        if (!cancelled && typeof json === 'object' && json !== null) {
          setCommitCategories(new Map(Object.entries(json)));
        }
      } catch {
        // サーバーが未対応の場合はデフォルトのままにする
      }
    })();
    return () => { cancelled = true; };
  }, [serverUrl]);

  const [skillCategories, setSkillCategories] = useState<ReadonlyMap<string, number>>(
    DEFAULT_SKILL_CATEGORIES,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${serverUrl}/api/config/tool-categories`);
        if (!res.ok) return;
        const json = await res.json() as Record<string, number>;
        if (!cancelled && typeof json === 'object' && json !== null) {
          setToolCategories(new Map(Object.entries(json)));
        }
      } catch {
        // サーバーが未対応の場合はデフォルトのままにする
      }
    })();
    return () => { cancelled = true; };
  }, [serverUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${serverUrl}/api/config/skill-categories`);
        if (!res.ok) return;
        const json = await res.json() as Record<string, number>;
        if (!cancelled && typeof json === 'object' && json !== null) {
          setSkillCategories(new Map(Object.entries(json)));
        }
      } catch {
        // サーバーが未対応の場合はデフォルトのままにする
      }
    })();
    return () => { cancelled = true; };
  }, [serverUrl]);

  const fetchTraceList = useCallback(async () => {
    const res = await fetch(`${serverUrl}/api/trace/list`);
    if (!res.ok) throw new Error(`trace/list: ${res.status}`);
    return res.json() as Promise<{ name: string; url: string }[]>;
  }, [serverUrl]);
  const traceFiles = useTraceFiles(fetchTraceList);

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
  )

  const handleOpenFile = useCallback(
    (filePath: string) => {
      sendCommand('open-file', { filePath });
    },
    [sendCommand],
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

  // initialTab=1(Traces)で開いた場合、セッション一覧の先頭を自動選択する
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (initialTab !== 1 || didAutoSelect.current) return;
    const first = (dataSource.allSessions ?? dataSource.sessions)[0];
    if (!first) return;
    didAutoSelect.current = true;
    handleSelectSession(first.id);
  }, [initialTab, dataSource.allSessions, dataSource.sessions, handleSelectSession]);

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
    deadCodeMatrix: c4.deadCodeMatrix,
    fileAnalysisEntries: c4.fileAnalysisEntries,
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
    onOpenFile: handleOpenFile,
    serverUrl,
    claudeActivity: c4.claudeActivity,
    multiAgentActivity: c4.multiAgentActivity,
    onResetClaudeActivity: () => sendCommand('reset-claude-activity'),
    manualGroups: c4.manualGroups,
    initialLevel: initialC4Level,
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
      fetchDeploymentFrequency={dataSource.fetchDeploymentFrequency}
      fetchReleaseQuality={dataSource.fetchReleaseQuality}
      sessionsLoading={dataSource.sessionsLoading}
      c4={c4Props}
      traceFiles={traceFiles.length > 0 ? traceFiles : undefined}
      initialTab={initialTab}
      sendCommand={sendCommand}
      wsConnected={c4.connected}
      serverUrl={serverUrl}
      commitCategories={commitCategories}
      toolCategories={toolCategories}
      skillCategories={skillCategories}
    />
  );
}
