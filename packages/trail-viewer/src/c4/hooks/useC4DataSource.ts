import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  BoundaryInfo,
  C4Model,
  C4ReleaseEntry,
  ComplexityMatrix,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
  ImportanceMatrix,
  ManualGroup,
} from '@anytime-markdown/trail-core/c4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisProgress {
  /** 現在のフェーズ名（空文字で非表示） */
  phase: string;
  /** 0〜100 の進捗率（-1 で不定） */
  percent: number;
}

export interface AddElementRequest {
  type: string;
  name: string;
  description?: string;
  external?: boolean;
  parentId?: string | null;
  serviceType?: string;
}

export interface AddRelationshipRequest {
  fromId: string;
  toId: string;
  label?: string;
  technology?: string;
}

interface C4DataSourceResult {
  c4Model: C4Model | null;
  boundaries: readonly BoundaryInfo[];
  featureMatrix: FeatureMatrix | null;
  coverageMatrix: CoverageMatrix | null;
  coverageDiff: CoverageDiffMatrix | null;
  complexityMatrix: ComplexityMatrix | null;
  importanceMatrix: ImportanceMatrix | null;
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

interface WsModelMessage {
  type: 'model-updated';
  model: C4Model;
  boundaries: BoundaryInfo[];
  featureMatrix?: FeatureMatrix;
}

interface WsDsmMatrixMessage {
  type: 'dsm-updated';
  matrix: DsmMatrix;
}

interface WsAnalysisProgressMessage {
  type: 'analysis-progress';
  phase: string;
  percent: number;
}

interface WsDocLinksMessage {
  type: 'doc-links-updated';
  docLinks: DocLink[];
}

interface WsCoverageMessage {
  type: 'coverage-updated';
  coverageMatrix: CoverageMatrix;
}

interface WsCoverageDiffMessage {
  type: 'coverage-diff-updated';
  coverageDiff: CoverageDiffMatrix;
}

interface WsComplexityMessage {
  type: 'complexity-updated';
  complexityMatrix: ComplexityMatrix;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const RECONNECT_DELAY_MS = 3_000;

// Build the WebSocket URL from the data source URL.
//   - ''                     → same-origin (ws(s)://window.location.host)
//   - 'http://host:port'     → ws://host:port
//   - 'https://host:port'    → wss://host:port
// Returns null when neither an absolute URL nor a browser window is available.
function buildWsUrl(serverUrl: string): string | null {
  if (serverUrl === '') {
    if (typeof window === 'undefined') return null;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  try {
    const url = new URL(serverUrl);
    const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${url.host}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers (type guards)
// ---------------------------------------------------------------------------

function isWsModelMessage(v: unknown): v is WsModelMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'model-updated' && 'model' in obj && 'boundaries' in obj;
}

function isWsModelNotification(v: unknown): v is { type: 'model-updated' } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'model-updated' && !('model' in obj);
}

function isWsDsmMatrixMessage(v: unknown): v is WsDsmMatrixMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'dsm-updated' && 'matrix' in obj;
}

function isWsAnalysisProgressMessage(v: unknown): v is WsAnalysisProgressMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'analysis-progress' && typeof obj.phase === 'string';
}

function isWsDocLinksMessage(v: unknown): v is WsDocLinksMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'doc-links-updated' && Array.isArray(obj.docLinks);
}

function isWsCoverageMessage(v: unknown): v is WsCoverageMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'coverage-updated' && 'coverageMatrix' in obj;
}

function isWsCoverageDiffMessage(v: unknown): v is WsCoverageDiffMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'coverage-diff-updated' && 'coverageDiff' in obj;
}

function isWsComplexityMessage(v: unknown): v is WsComplexityMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'complexity-updated' && 'complexityMatrix' in obj;
}

interface WsImportanceMessage {
  type: 'importance-updated';
  importanceMatrix: ImportanceMatrix;
}

function isWsImportanceMessage(v: unknown): v is WsImportanceMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'importance-updated' && 'importanceMatrix' in obj;
}

export interface ClaudeActivityState {
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface AgentActivityEntry {
  readonly sessionId: string;
  readonly label: string;
  readonly branch: string;
  readonly currentFile: string;
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface FileConflict {
  readonly file: string;
  readonly elementIds: readonly string[];
  readonly agentSessionIds: readonly string[];
  readonly isActiveConflict: boolean;
}

export interface MultiAgentActivityState {
  readonly agents: readonly AgentActivityEntry[];
  readonly conflicts: readonly FileConflict[];
}

interface WsClaudeActivityMessage {
  type: 'claude-activity-updated';
  activeElementIds: string[];
  touchedElementIds: string[];
  plannedElementIds: string[];
}

function isWsClaudeActivityMessage(v: unknown): v is WsClaudeActivityMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.type === 'claude-activity-updated' &&
    Array.isArray(obj.activeElementIds) &&
    Array.isArray(obj.touchedElementIds) &&
    Array.isArray(obj.plannedElementIds)
  );
}

interface WsMultiAgentMessage {
  type: 'multi-agent-activity-updated';
  agents: AgentActivityEntry[];
  conflicts?: FileConflict[];
}

function isWsMultiAgentMessage(v: unknown): v is WsMultiAgentMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'multi-agent-activity-updated' && Array.isArray(obj.agents);
}

// ---------------------------------------------------------------------------
// HTTP payload type guards
// ---------------------------------------------------------------------------

interface ModelPayload {
  model: C4Model;
  boundaries: BoundaryInfo[];
  featureMatrix?: FeatureMatrix;
}

interface DsmMatrixPayload {
  matrix: DsmMatrix;
}

function isModelPayload(v: unknown): v is ModelPayload {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return 'model' in obj && 'boundaries' in obj;
}

function isDsmMatrixPayload(v: unknown): v is DsmMatrixPayload {
  if (typeof v !== 'object' || v === null) return false;
  return 'matrix' in v;
}

interface ComplexityPayload {
  complexityMatrix: ComplexityMatrix;
}

function isComplexityPayload(v: unknown): v is ComplexityPayload {
  if (typeof v !== 'object' || v === null) return false;
  return 'complexityMatrix' in v;
}

async function readJson(res: Response | null): Promise<unknown> {
  if (res?.status !== 200) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Remote-mode initial fetch (DB-stored model)
// ---------------------------------------------------------------------------

function useRemoteInitialFetch(
  serverUrl: string | undefined,
  selectedRelease: string,
  selectedRepo: string,
  setC4Model: (m: C4Model | null) => void,
  setBoundaries: (b: readonly BoundaryInfo[]) => void,
  setDsmMatrix: (m: DsmMatrix | null) => void,
  setFeatureMatrix: (m: FeatureMatrix | null) => void,
  setCoverageMatrix: (m: CoverageMatrix | null) => void,
  setCoverageDiff: (m: CoverageDiffMatrix | null) => void,
  setComplexityMatrix: (m: ComplexityMatrix | null) => void,
  setReleases: (entries: readonly C4ReleaseEntry[]) => void,
  setDocLinks: (docs: readonly DocLink[]) => void,
): void {
  useEffect(() => {
    // serverUrl === undefined → local mode (fetch しない)
    // serverUrl === '' → same-origin 相対パス（Next.js 同居モード）
    // それ以外 → 絶対 URL（拡張機能モード）
    if (serverUrl === undefined) return;

    let cancelled = false;

    async function fetchInitial(): Promise<void> {
      const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
      const modelUrl = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
      const dsmUrl = `${serverUrl}/api/c4/dsm?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
      const complexityUrl = `${serverUrl}/api/c4/complexity?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
      const [modelRes, dsmRes, covRes, complexityRes, releasesRes, docsRes] = await Promise.all([
        fetch(modelUrl).catch(() => null),
        fetch(dsmUrl).catch(() => null),
        fetch(`${serverUrl}/api/c4/coverage`).catch(() => null),
        fetch(complexityUrl).catch(() => null),
        fetch(`${serverUrl}/api/c4/releases`).catch(() => null),
        fetch(`${serverUrl}/api/docs-index`).catch(() => null),
      ]);

      const [modelJson, dsmJson, covJson, complexityJson, docsJson] = await Promise.all([
        readJson(modelRes),
        readJson(dsmRes),
        readJson(covRes),
        readJson(complexityRes),
        readJson(docsRes),
      ]);
      if (cancelled) return;

      if (isModelPayload(modelJson)) {
        setC4Model(modelJson.model);
        setBoundaries(modelJson.boundaries);
        setFeatureMatrix(modelJson.featureMatrix ?? null);
      } else {
        setC4Model(null);
        setBoundaries([]);
        setFeatureMatrix(null);
      }

      if (isDsmMatrixPayload(dsmJson)) {
        setDsmMatrix(dsmJson.matrix);
      } else {
        setDsmMatrix(null);
      }

      if (covJson && typeof covJson === 'object') {
        const cov = covJson as { coverageMatrix?: CoverageMatrix | null; coverageDiff?: CoverageDiffMatrix | null };
        setCoverageMatrix(cov.coverageMatrix ?? null);
        setCoverageDiff(cov.coverageDiff ?? null);
      } else {
        setCoverageMatrix(null);
        setCoverageDiff(null);
      }

      setComplexityMatrix(isComplexityPayload(complexityJson) ? complexityJson.complexityMatrix : null);

      if (docsJson && typeof docsJson === 'object' && 'docs' in docsJson && Array.isArray((docsJson as { docs: unknown }).docs)) {
        setDocLinks((docsJson as { docs: DocLink[] }).docs);
      }

      if (releasesRes?.status === 200) {
        const json: unknown = await releasesRes.json();
        if (!cancelled && Array.isArray(json)) {
          const normalized: C4ReleaseEntry[] = (json as unknown[]).map((item) => {
            if (typeof item === 'string') {
              return { tag: item, repoName: null };
            }
            if (item && typeof item === 'object' && 'tag' in item) {
              const obj = item as { tag: unknown; repoName?: unknown };
              return {
                tag: String(obj.tag),
                repoName: typeof obj.repoName === 'string' ? obj.repoName : null,
              };
            }
            return null;
          }).filter((e): e is C4ReleaseEntry => e !== null);
          setReleases(normalized);
        }
      }
    }

    void fetchInitial();
    return () => { cancelled = true; };
  }, [serverUrl, selectedRelease, selectedRepo, setC4Model, setBoundaries, setDsmMatrix, setFeatureMatrix, setCoverageMatrix, setCoverageDiff, setComplexityMatrix, setReleases, setDocLinks]);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useC4DataSource(serverUrl: string): C4DataSourceResult {
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
  const [dsmMatrix, setDsmMatrix] = useState<DsmMatrix | null>(null);
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);
  const [connected, setConnected] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [claudeActivity, setClaudeActivity] = useState<ClaudeActivityState | null>(null);
  const [multiAgentActivity, setMultiAgentActivity] = useState<MultiAgentActivityState | null>(null);
  const [releases, setReleases] = useState<readonly C4ReleaseEntry[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>('current');
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [manualGroups, setManualGroups] = useState<readonly ManualGroup[]>([]);

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

  // Refetch just the C4 model (used after manual element edits).
  // Accessed via ref inside handleWsMessage to keep that callback stable
  // — otherwise the WebSocket would reconnect every time selectedRepo changes.
  const refetchModel = useCallback(async (): Promise<void> => {
    if (serverUrl === undefined) return;
    const repoQuery = selectedRepo ? `&repo=${encodeURIComponent(selectedRepo)}` : '';
    const url = `${serverUrl}/api/c4/model?release=${encodeURIComponent(selectedRelease)}${repoQuery}`;
    try {
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (isModelPayload(json)) {
        setRemoteModel(json.model);
        setRemoteBoundaries(json.boundaries);
        setFeatureMatrix(json.featureMatrix ?? null);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, [serverUrl, selectedRelease, selectedRepo]);

  const refetchModelRef = useRef(refetchModel);
  useEffect(() => {
    refetchModelRef.current = refetchModel;
  }, [refetchModel]);

  // Refetch manual groups from the server
  const refetchManualGroups = useCallback(async (): Promise<void> => {
    if (serverUrl === undefined || !selectedRepo) {
      setManualGroups([]);
      return;
    }
    try {
      const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
      const res = await fetch(url).catch(() => null);
      const json = await readJson(res);
      if (Array.isArray(json)) {
        setManualGroups(json as ManualGroup[]);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, [serverUrl, selectedRepo]);

  useEffect(() => {
    void refetchManualGroups();
  }, [refetchManualGroups]);

  // Manual element CRUD
  const addElement = useCallback(async (data: AddElementRequest): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const updateElement = useCallback(async (id: string, changes: { name?: string; description?: string; external?: boolean }): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const removeElement = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const addRelationship = useCallback(async (data: AddRelationshipRequest): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-relationships?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const removeRelationship = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-relationships/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchModel();
  }, [serverUrl, selectedRepo, refetchModel]);

  const addGroup = useCallback(async (memberIds: readonly string[], label?: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: [...memberIds], label }) });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  const updateGroup = useCallback(async (id: string, changes: { memberIds?: readonly string[]; label?: string | null }): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    const body: Record<string, unknown> = {};
    if (changes.memberIds !== undefined) body.memberIds = [...changes.memberIds];
    if (changes.label !== undefined) body.label = changes.label;
    await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  const removeGroup = useCallback(async (id: string): Promise<void> => {
    if (!selectedRepo) return;
    const url = `${serverUrl}/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(selectedRepo)}`;
    await fetch(url, { method: 'DELETE' });
    await refetchManualGroups();
  }, [serverUrl, selectedRepo, refetchManualGroups]);

  // WebSocket message handler
  const handleWsMessage = useCallback((event: MessageEvent) => {
    try {
      const parsed: unknown = JSON.parse(String(event.data));
      if (isWsAnalysisProgressMessage(parsed)) {
        setAnalysisProgress(parsed.phase ? { phase: parsed.phase, percent: parsed.percent } : null);
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
      } else if (isWsImportanceMessage(parsed)) {
        setImportanceMatrix(parsed.importanceMatrix);
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
  }, [serverUrl, handleWsMessage]);

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
