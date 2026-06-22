/**
 * c4DataStore — framework-agnostic vanilla store that reproduces
 * `useC4DataSource` without React.
 *
 * API surface:
 *   createC4DataStore(serverUrl, disableWebSocket?, enabled?) → C4DataStore
 *   store.getState()   → C4DataSourceResult (same shape as the hook)
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → cancel in-flight fetches, close WS
 */

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

import type { FileAnalysisApiEntry } from '../fetchFileAnalysisApi';
import { fetchFileAnalysis } from '../fetchFileAnalysisApi';
import type { FunctionAnalysisApiEntry } from '../fetchFunctionAnalysisApi';
import { fetchFunctionAnalysis } from '../fetchFunctionAnalysisApi';

import {
  buildWsUrl,
  isComplexityPayload,
  isDsmMatrixPayload,
  isModelPayload,
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
  readJson,
  type AnalysisProgress,
  type ClaudeActivityState,
  type MultiAgentActivityState,
} from '../c4WsMessages';

import type { AddElementRequest, AddRelationshipRequest } from '../useC4Mutations';

// ---------------------------------------------------------------------------
// Re-exports (match the hook's public re-exports)
// ---------------------------------------------------------------------------

export type {
  AgentActivityEntry,
  AnalysisProgress,
  ClaudeActivityState,
  FileConflict,
  MultiAgentActivityState,
} from '../c4WsMessages';
export type { AddElementRequest, AddRelationshipRequest } from '../useC4Mutations';

// ---------------------------------------------------------------------------
// State shape (mirrors C4DataSourceResult in useC4DataSource.ts)
// ---------------------------------------------------------------------------

export interface C4DataSourceResult {
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
// Store interface
// ---------------------------------------------------------------------------

export interface C4DataStore {
  getState(): C4DataSourceResult;
  subscribe(listener: () => void): () => void;
  /**
   * c4 データ取得の有効化/無効化（遅延ロード）。React hook の reactive な `enabled` 相当。
   * false→true で初回 fetch + WS 接続を起動する（C4 タブ訪問時に呼ぶ）。
   */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createC4DataStore(
  serverUrl: string,
  disableWebSocket = false,
  enabled = true,
): C4DataStore {
  // ----- Mutable state -----
  let disposed = false;
  let mountedWs = true; // mirrors the `mounted` flag in the hook's WS effect

  let remoteModel: C4Model | null = null;
  let remoteBoundaries: readonly BoundaryInfo[] = [];
  let featureMatrix: FeatureMatrix | null = null;
  let coverageMatrix: CoverageMatrix | null = null;
  let coverageDiff: CoverageDiffMatrix | null = null;
  let complexityMatrix: ComplexityMatrix | null = null;
  let importanceMatrix: ImportanceMatrix | null = null;
  let deadCodeMatrix: Record<string, number> | null = null;
  let centralityMatrix: CentralityMatrix | null = null;
  let roleMatrix: RoleMatrix | null = null;
  let fileAnalysisEntries: readonly FileAnalysisApiEntry[] = [];
  let functionAnalysisEntries: readonly FunctionAnalysisApiEntry[] = [];
  let dsmMatrix: DsmMatrix | null = null;
  let docLinks: readonly DocLink[] = [];
  let connected = false;
  let analysisProgress: AnalysisProgress | null = null;
  let claudeActivity: ClaudeActivityState | null = null;
  let multiAgentActivity: MultiAgentActivityState | null = null;
  let releases: readonly C4ReleaseEntry[] = [];
  let selectedRelease = 'current';
  let selectedRepo = '';
  let manualGroups: readonly ManualGroup[] = [];
  let analysisCompleteCounter = 0;

  // ----- Listeners -----
  const listeners = new Set<() => void>();
  function notify(): void {
    for (const l of listeners) l();
  }

  // ----- WS refs -----
  let wsInstance: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  // ----- Abort controllers for REST fetches -----
  let initialFetchController = new AbortController();
  let fileAnalysisController = new AbortController();
  let functionAnalysisController = new AbortController();

  // ------------------------------------------------------------------
  // Model refetch (used after mutations + WS model-updated notification)
  // ------------------------------------------------------------------

  async function refetchModel(): Promise<void> {
    if (disposed) return;
    const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
    const url = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
    try {
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (disposed) return;
      if (isModelPayload(json)) {
        remoteModel = json.model;
        remoteBoundaries = json.boundaries;
        featureMatrix = json.featureMatrix ?? null;
        notify();
      }
    } catch {
      // ignore transient fetch errors
    }
  }

  // ------------------------------------------------------------------
  // Manual groups
  // ------------------------------------------------------------------

  async function refetchManualGroups(): Promise<void> {
    if (disposed || !selectedRepo) {
      manualGroups = [];
      return;
    }
    try {
      const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (disposed) return;
      if (Array.isArray(json)) {
        manualGroups = json as ManualGroup[];
        notify();
      }
    } catch {
      // ignore transient fetch errors
    }
  }

  // ------------------------------------------------------------------
  // WS message handler
  // ------------------------------------------------------------------

  function handleWsMessage(event: MessageEvent): void {
    if (disposed) return;
    try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isWsAnalysisProgressMessage(parsed)) {
        analysisProgress = parsed.phase ? { phase: parsed.phase, percent: parsed.percent } : null;
        if (parsed.phase === '' && parsed.percent === 100) {
          analysisCompleteCounter += 1;
          // Re-trigger file/function analysis fetches
          void runFileAnalysis();
          void runFunctionAnalysis();
        }
        notify();
      } else if (isWsModelMessage(parsed)) {
        remoteModel = parsed.model;
        remoteBoundaries = parsed.boundaries;
        featureMatrix = parsed.featureMatrix ?? null;
        analysisProgress = null;
        notify();
      } else if (isWsDsmMatrixMessage(parsed)) {
        dsmMatrix = parsed.matrix;
        notify();
      } else if (isWsDocLinksMessage(parsed)) {
        docLinks = parsed.docLinks;
        notify();
      } else if (isWsCoverageMessage(parsed)) {
        coverageMatrix = parsed.coverageMatrix;
        notify();
      } else if (isWsCoverageDiffMessage(parsed)) {
        coverageDiff = parsed.coverageDiff;
        notify();
      } else if (isWsComplexityMessage(parsed)) {
        complexityMatrix = parsed.complexityMatrix;
        notify();
      } else if (isWsClaudeActivityMessage(parsed)) {
        claudeActivity = {
          activeElementIds: parsed.activeElementIds,
          touchedElementIds: parsed.touchedElementIds,
          plannedElementIds: parsed.plannedElementIds,
        };
        notify();
      } else if (isWsMultiAgentMessage(parsed)) {
        multiAgentActivity = {
          agents: parsed.agents,
          conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        };
        notify();
      } else if (isWsModelNotification(parsed)) {
        void refetchModel();
      }
    } catch {
      // Malformed message — ignore
    }
  }

  // ------------------------------------------------------------------
  // WebSocket connect / reconnect
  // ------------------------------------------------------------------

  function connectWs(): void {
    if (!mountedWs || disposed) return;
    const wsUrl = buildWsUrl(serverUrl);
    if (wsUrl === null) return;
    const ws = new WebSocket(wsUrl);
    wsInstance = ws;

    ws.addEventListener('open', () => {
      if (disposed) { ws.close(); return; }
      connected = true;
      retryCount = 0;
      notify();
    });

    ws.addEventListener('message', handleWsMessage);

    ws.addEventListener('close', () => {
      if (disposed) return;
      connected = false;
      notify();
      scheduleWsReconnect();
    });

    ws.addEventListener('error', () => {
      if (disposed) return;
      connected = false;
      notify();
      ws.close();
    });
  }

  function scheduleWsReconnect(): void {
    if (!mountedWs || disposed || retryCount >= MAX_RETRIES) return;
    retryCount += 1;
    retryTimer = setTimeout(connectWs, RECONNECT_DELAY_MS);
  }

  // ------------------------------------------------------------------
  // Remote initial fetch (mirrors useRemoteInitialFetch)
  // ------------------------------------------------------------------

  async function runInitialFetch(): Promise<void> {
    if (!enabled || disposed) return;

    initialFetchController.abort();
    initialFetchController = new AbortController();
    const { signal } = initialFetchController;
    let cancelled = false;

    const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
    const modelUrl = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
    const dsmUrl = `${serverUrl}/api/c4/dsm?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
    const complexityUrl = selectedRepo
      ? `${serverUrl}/api/c4/complexity?repo=${encodeURIComponent(selectedRepo)}`
      : `${serverUrl}/api/c4/complexity`;

    const [modelRes, dsmRes, covRes, complexityRes, releasesRes, docsRes] = await Promise.all([
      fetch(modelUrl, { signal }).catch(() => null),
      fetch(dsmUrl, { signal }).catch(() => null),
      fetch(`${serverUrl}/api/c4/coverage?release=${encodeURIComponent(selectedRelease)}${repoQuery}`, { signal }).catch(() => null),
      fetch(complexityUrl, { signal }).catch(() => null),
      fetch(`${serverUrl}/api/c4/releases`, { signal }).catch(() => null),
      fetch(`${serverUrl}/api/docs-index${selectedRepo ? `?repo=${encodeURIComponent(selectedRepo)}` : ''}`, { signal }).catch(() => null),
    ]);

    if (signal.aborted) cancelled = true;

    const [modelJson, dsmJson, covJson, complexityJson, docsJson] = await Promise.all([
      readJson(modelRes),
      readJson(dsmRes),
      readJson(covRes),
      readJson(complexityRes),
      readJson(docsRes),
    ]);

    if (cancelled || disposed) return;

    if (isModelPayload(modelJson)) {
      remoteModel = modelJson.model;
      remoteBoundaries = modelJson.boundaries;
      featureMatrix = modelJson.featureMatrix ?? null;
    } else {
      remoteModel = null;
      remoteBoundaries = [];
      featureMatrix = null;
    }

    if (isDsmMatrixPayload(dsmJson)) {
      dsmMatrix = dsmJson.matrix;
    } else {
      dsmMatrix = null;
    }

    if (covJson && typeof covJson === 'object') {
      const cov = covJson as { coverageMatrix?: CoverageMatrix | null; coverageDiff?: CoverageDiffMatrix | null };
      coverageMatrix = cov.coverageMatrix ?? null;
      coverageDiff = cov.coverageDiff ?? null;
    } else {
      coverageMatrix = null;
      coverageDiff = null;
    }

    complexityMatrix = isComplexityPayload(complexityJson) ? complexityJson.complexityMatrix : null;

    if (
      docsJson &&
      typeof docsJson === 'object' &&
      'docs' in docsJson &&
      Array.isArray((docsJson as { docs: unknown }).docs)
    ) {
      docLinks = (docsJson as { docs: DocLink[] }).docs;
    }

    if (releasesRes?.status === 200) {
      try {
        const json: unknown = await releasesRes.json();
        if (!cancelled && !disposed && Array.isArray(json)) {
          const normalized: C4ReleaseEntry[] = (json as unknown[]).map((item) => {
            if (typeof item === 'string') return { tag: item, repoName: null };
            if (item && typeof item === 'object' && 'tag' in item) {
              const obj = item as { tag: unknown; repoName?: unknown };
              return {
                tag: String(obj.tag),
                repoName: typeof obj.repoName === 'string' ? obj.repoName : null,
              };
            }
            return null;
          }).filter((e): e is C4ReleaseEntry => e !== null);
          releases = normalized;
        }
      } catch {
        // ignore
      }
    }

    if (!disposed) notify();

    // After initial fetch, load manual groups
    await refetchManualGroups();
  }

  // ------------------------------------------------------------------
  // File analysis fetch
  // ------------------------------------------------------------------

  async function runFileAnalysis(): Promise<void> {
    if (!enabled || !selectedRepo || disposed) return;

    fileAnalysisController.abort();
    fileAnalysisController = new AbortController();

    try {
      const tag = selectedRelease || 'current';
      const r = await fetchFileAnalysis(serverUrl, selectedRepo, tag, fileAnalysisController.signal);
      if (disposed) return;
      if (!r) {
        importanceMatrix = null;
        deadCodeMatrix = null;
        centralityMatrix = null;
        roleMatrix = null;
        fileAnalysisEntries = [];
      } else {
        importanceMatrix = r.elementMatrix.importance;
        deadCodeMatrix = r.elementMatrix.deadCodeScore;
        centralityMatrix = r.elementMatrix.centrality;
        roleMatrix = r.elementMatrix.functionRoles;
        fileAnalysisEntries = r.entries;
      }
      notify();
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('[c4DataStore] fetchFileAnalysis failed', err);
    }
  }

  // ------------------------------------------------------------------
  // Function analysis fetch
  // ------------------------------------------------------------------

  async function runFunctionAnalysis(): Promise<void> {
    if (!enabled || !selectedRepo || disposed) return;

    functionAnalysisController.abort();
    functionAnalysisController = new AbortController();

    try {
      const tag = selectedRelease || 'current';
      const r = await fetchFunctionAnalysis(serverUrl, selectedRepo, tag, functionAnalysisController.signal);
      if (disposed) return;
      functionAnalysisEntries = r?.entries ?? [];
      notify();
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('[c4DataStore] fetchFunctionAnalysis failed', err);
      if (!disposed) {
        functionAnalysisEntries = [];
        notify();
      }
    }
  }

  // ------------------------------------------------------------------
  // setSelectedRelease / setSelectedRepo (trigger re-fetch)
  // ------------------------------------------------------------------

  function setSelectedRelease(release: string): void {
    if (disposed) return;
    selectedRelease = release;
    notify();
    void runInitialFetch();
  }

  function setSelectedRepo(repo: string): void {
    if (disposed) return;
    selectedRepo = repo;
    notify();
    void runInitialFetch();
    void runFileAnalysis();
    void runFunctionAnalysis();
  }

  // ------------------------------------------------------------------
  // sendCommand
  // ------------------------------------------------------------------

  function sendCommand(cmd: string, payload?: unknown): void {
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) return;
    const message =
      typeof payload === 'object' && payload !== null
        ? { type: cmd, ...(payload as Record<string, unknown>) }
        : { type: cmd };
    wsInstance.send(JSON.stringify(message));
  }

  // ------------------------------------------------------------------
  // CRUD mutations
  // ------------------------------------------------------------------

  async function addElement(data: AddElementRequest): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-elements?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }

  async function updateElement(id: string, changes: { name?: string; description?: string; external?: boolean }): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    await refetchModel();
  }

  async function removeElement(id: string): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }

  async function addRelationship(data: AddRelationshipRequest): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-relationships?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }

  async function removeRelationship(id: string): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-relationships/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }

  async function addGroup(memberIds: readonly string[], label?: string): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: [...memberIds], label }) });
    await refetchManualGroups();
  }

  async function updateGroup(id: string, changes: { memberIds?: readonly string[]; label?: string | null }): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    const body: Record<string, unknown> = {};
    if (changes.memberIds !== undefined) body.memberIds = [...changes.memberIds];
    if (changes.label !== undefined) body.label = changes.label;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await refetchManualGroups();
  }

  async function removeGroup(id: string): Promise<void> {
    if (!selectedRepo || disposed) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchManualGroups();
  }

  // ------------------------------------------------------------------
  // Initial data load
  // ------------------------------------------------------------------

  void runInitialFetch();
  if (!disableWebSocket && enabled) {
    connectWs();
  }

  /**
   * 遅延有効化。store は enabled=false で生成され得る（c4 タブ未訪問）。true 化時に
   * 初回 fetch + WS 接続を起動する。React の useEffect([enabled]) 相当。
   */
  function setEnabled(next: boolean): void {
    if (next === enabled || disposed) return;
    enabled = next;
    if (next) {
      void runInitialFetch();
      if (!disableWebSocket) connectWs();
    }
  }

  // ------------------------------------------------------------------
  // Store API
  // ------------------------------------------------------------------

  function getState(): C4DataSourceResult {
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

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose(): void {
    disposed = true;
    mountedWs = false;

    initialFetchController.abort();
    fileAnalysisController.abort();
    functionAnalysisController.abort();

    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (wsInstance) {
      wsInstance.close();
      wsInstance = null;
    }
    listeners.clear();
  }

  return { getState, subscribe, setEnabled, dispose };
}
