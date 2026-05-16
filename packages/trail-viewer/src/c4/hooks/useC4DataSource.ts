import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileAnalysisApiEntry } from './fetchFileAnalysisApi';
import { fetchFileAnalysis } from './fetchFileAnalysisApi';
import type { FunctionAnalysisApiEntry } from './fetchFunctionAnalysisApi';
import { fetchFunctionAnalysis } from './fetchFunctionAnalysisApi';

import type {
  BoundaryInfo,
  C4Model,
  C4ReleaseEntry,
  CentralityMatrix,
  ComplexityMatrix,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
  ImportanceMatrix,
  ManualGroup,
  RoleMatrix,
} from '@anytime-markdown/trail-core/c4';

import {
  buildWsUrl,
  isWsAnalysisProgressMessage,
  isWsClaudeActivityMessage,
  isWsComplexityMessage,
  isWsCoverageDiffMessage,
  isWsCoverageMessage,
  isWsDocLinksMessage,
  isWsDsmMatrixMessage,
  isWsModelMessage,
  isWsModelNotification,
  isWsMultiAgentMessage,
  MAX_RETRIES,
  RECONNECT_DELAY_MS,
  type AnalysisProgress,
  type ClaudeActivityState,
  type MultiAgentActivityState,
} from './c4WsMessages';
import { useC4Mutations } from './useC4Mutations';
import { useRemoteInitialFetch } from './useC4RemoteFetch';
import type { AddElementRequest, AddRelationshipRequest } from './useC4Mutations';

export type {
  AgentActivityEntry,
  AnalysisProgress,
  ClaudeActivityState,
  FileConflict,
  MultiAgentActivityState,
} from './c4WsMessages';
export type { AddElementRequest, AddRelationshipRequest } from './useC4Mutations';

interface C4DataSourceResult {
  c4Model: C4Model | null;
  boundaries: readonly BoundaryInfo[];
  featureMatrix: FeatureMatrix | null;
  coverageMatrix: CoverageMatrix | null;
  coverageDiff: CoverageDiffMatrix | null;
  complexityMatrix: ComplexityMatrix | null;
  importanceMatrix: ImportanceMatrix | null;
  deadCodeMatrix: Record<string, number> | null;
  centralityMatrix: CentralityMatrix | null;
  roleMatrix: RoleMatrix | null;
  fileAnalysisEntries: readonly FileAnalysisApiEntry[];
  functionAnalysisEntries: readonly FunctionAnalysisApiEntry[];
  docLinks: readonly DocLink[];
  dsmMatrix: DsmMatrix | null;
  connected: boolean;
  analysisProgress: AnalysisProgress | null;
  claudeActivity: ClaudeActivityState | null;
  multiAgentActivity: MultiAgentActivityState | null;
  sendCommand: (cmd: string, payload?: unknown) => void;
  releases: readonly C4ReleaseEntry[];
  selectedRelease: string;
  setSelectedRelease: (release: string) => void;
  selectedRepo: string;
  setSelectedRepo: (repo: string) => void;
  addElement: (data: AddElementRequest) => Promise<void>;
  updateElement: (id: string, changes: { name?: string; description?: string; external?: boolean }) => Promise<void>;
  removeElement: (id: string) => Promise<void>;
  addRelationship: (data: AddRelationshipRequest) => Promise<void>;
  removeRelationship: (id: string) => Promise<void>;
  manualGroups: readonly ManualGroup[];
  addGroup: (memberIds: readonly string[], label?: string) => Promise<void>;
  updateGroup: (id: string, changes: { memberIds?: readonly string[]; label?: string | null }) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useC4DataSource(serverUrl: string, disableWebSocket = false): C4DataSourceResult {
  // State
  const [remoteModel, setRemoteModel] = useState<C4Model | null>(null);
  const [remoteBoundaries, setRemoteBoundaries] = useState<
    readonly BoundaryInfo[]
  >([]);
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrix | null>(null);
  const [coverageMatrix, setCoverageMatrix] = useState<CoverageMatrix | null>(null);
  const [coverageDiff, setCoverageDiff] = useState<CoverageDiffMatrix | null>(null);
  const [complexityMatrix, setComplexityMatrix] = useState<ComplexityMatrix | null>(null);
  const [importanceMatrix, setImportanceMatrix] = useState<ImportanceMatrix | null>(null);
  const [deadCodeMatrix, setDeadCodeMatrix] = useState<Record<string, number> | null>(null);
  const [centralityMatrix, setCentralityMatrix] = useState<CentralityMatrix | null>(null);
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrix | null>(null);
  const [fileAnalysisEntries, setFileAnalysisEntries] = useState<readonly FileAnalysisApiEntry[]>([]);
  const [functionAnalysisEntries, setFunctionAnalysisEntries] = useState<readonly FunctionAnalysisApiEntry[]>([]);
  const [analysisCompleteCounter, setAnalysisCompleteCounter] = useState(0);
  const [dsmMatrix, setDsmMatrix] = useState<DsmMatrix | null>(null);
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);
  const [connected, setConnected] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [claudeActivity, setClaudeActivity] = useState<ClaudeActivityState | null>(null);
  const [multiAgentActivity, setMultiAgentActivity] = useState<MultiAgentActivityState | null>(null);
  const [releases, setReleases] = useState<readonly C4ReleaseEntry[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>('current');
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remote initial fetch — loads DB-stored model before WS pushes provider state
  useRemoteInitialFetch(
    serverUrl,
    selectedRelease,
    selectedRepo,
    setRemoteModel,
    setRemoteBoundaries,
    setDsmMatrix,
    setFeatureMatrix,
    setCoverageMatrix,
    setCoverageDiff,
    setComplexityMatrix,
    setReleases,
    setDocLinks,
  );

  // Manual element / group CRUD + manualGroups state
  const {
    manualGroups,
    refetchModel,
    addElement,
    updateElement,
    removeElement,
    addRelationship,
    removeRelationship,
    addGroup,
    updateGroup,
    removeGroup,
  } = useC4Mutations({
    serverUrl,
    selectedRelease,
    selectedRepo,
    setC4Model: setRemoteModel,
    setBoundaries: setRemoteBoundaries,
    setFeatureMatrix,
  });

  // refetchModel is accessed via ref inside handleWsMessage to keep that callback stable
  // — otherwise the WebSocket would reconnect every time the mutations hook re-creates its callbacks.
  const refetchModelRef = useRef(refetchModel);
  useEffect(() => {
    refetchModelRef.current = refetchModel;
  }, [refetchModel]);

  // WebSocket message handler
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isWsAnalysisProgressMessage(parsed)) {
        setAnalysisProgress(parsed.phase ? { phase: parsed.phase, percent: parsed.percent } : null);
        if (parsed.phase === '' && parsed.percent === 100) {
          setAnalysisCompleteCounter((c) => c + 1);
        }
      } else if (isWsModelMessage(parsed)) {
        setRemoteModel(parsed.model);
        setRemoteBoundaries(parsed.boundaries);
        setFeatureMatrix(parsed.featureMatrix ?? null);
        setAnalysisProgress(null);
      } else if (isWsDsmMatrixMessage(parsed)) {
        setDsmMatrix(parsed.matrix);
      } else if (isWsDocLinksMessage(parsed)) {
        setDocLinks(parsed.docLinks);
      } else if (isWsCoverageMessage(parsed)) {
        setCoverageMatrix(parsed.coverageMatrix);
      } else if (isWsCoverageDiffMessage(parsed)) {
        setCoverageDiff(parsed.coverageDiff);
      } else if (isWsComplexityMessage(parsed)) {
        setComplexityMatrix(parsed.complexityMatrix);
      } else if (isWsClaudeActivityMessage(parsed)) {
        setClaudeActivity({
          activeElementIds: parsed.activeElementIds,
          touchedElementIds: parsed.touchedElementIds,
          plannedElementIds: parsed.plannedElementIds,
        });
      } else if (isWsMultiAgentMessage(parsed)) {
        setMultiAgentActivity({
          agents: parsed.agents,
          conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        });
      } else if (isWsModelNotification(parsed)) {
        void refetchModelRef.current();
      }
    } catch {
      // Malformed message — ignore
    }
  }, []);

  // WebSocket connect / reconnect
  useEffect(() => {
    if (disableWebSocket) return;

    let mounted = true;

    function connect(): void {
      if (!mounted) return;
      const wsUrl = buildWsUrl(serverUrl);
      if (wsUrl === null) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setConnected(true);
        retryCountRef.current = 0;
      });

      ws.addEventListener('message', handleWsMessage);

      ws.addEventListener('close', () => {
        setConnected(false);
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        setConnected(false);
        ws.close();
      });
    }

    function scheduleReconnect(): void {
      if (!mounted || retryCountRef.current >= MAX_RETRIES) return;
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      mounted = false;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [serverUrl, handleWsMessage, disableWebSocket]);

  // REST fetch: file-analysis (importance + dead code matrix)
  useEffect(() => {
    if (!selectedRepo) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const tag = selectedRelease || 'current';
        const r = await fetchFileAnalysis(serverUrl, selectedRepo, tag, ctrl.signal);
        if (!r) {
          setImportanceMatrix(null);
          setDeadCodeMatrix(null);
          setCentralityMatrix(null);
          setRoleMatrix(null);
          setFileAnalysisEntries([]);
          return;
        }
        setImportanceMatrix(r.elementMatrix.importance);
        setDeadCodeMatrix(r.elementMatrix.deadCodeScore);
        setCentralityMatrix(r.elementMatrix.centrality);
        setRoleMatrix(r.elementMatrix.functionRoles);
        setFileAnalysisEntries(r.entries);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('[useC4DataSource] fetchFileAnalysis failed', err);
      }
    })();
    return () => ctrl.abort();
  }, [serverUrl, selectedRepo, selectedRelease, analysisCompleteCounter]);

  // REST fetch: function-analysis (per-function fanIn / fanOut / role)
  useEffect(() => {
    if (!selectedRepo) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const tag = selectedRelease || 'current';
        const r = await fetchFunctionAnalysis(serverUrl, selectedRepo, tag, ctrl.signal);
        setFunctionAnalysisEntries(r?.entries ?? []);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('[useC4DataSource] fetchFunctionAnalysis failed', err);
        setFunctionAnalysisEntries([]);
      }
    })();
    return () => ctrl.abort();
  }, [serverUrl, selectedRepo, selectedRelease, analysisCompleteCounter]);

  // sendCommand
  const sendCommand = useCallback(
    (cmd: string, payload?: unknown) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const message =
        typeof payload === 'object' && payload !== null
          ? { type: cmd, ...(payload as Record<string, unknown>) }
          : { type: cmd };

      ws.send(JSON.stringify(message));
    },
    [],
  );

  return {
    c4Model: remoteModel,
    boundaries: remoteBoundaries,
    featureMatrix,
    coverageMatrix,
    coverageDiff,
    complexityMatrix,
    importanceMatrix,
    deadCodeMatrix,
    centralityMatrix,
    roleMatrix,
    fileAnalysisEntries,
    functionAnalysisEntries,
    docLinks,
    dsmMatrix,
    connected,
    analysisProgress,
    claudeActivity,
    multiAgentActivity,
    sendCommand,
    releases,
    selectedRelease,
    setSelectedRelease,
    selectedRepo,
    setSelectedRepo,
    addElement,
    updateElement,
    removeElement,
    addRelationship,
    removeRelationship,
    manualGroups,
    addGroup,
    updateGroup,
    removeGroup,
  };
}
