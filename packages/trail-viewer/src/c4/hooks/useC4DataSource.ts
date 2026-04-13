import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  BoundaryInfo,
  C4Model,
  C4ReleaseEntry,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
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

interface C4DataSourceResult {
  c4Model: C4Model | null;
  boundaries: readonly BoundaryInfo[];
  featureMatrix: FeatureMatrix | null;
  coverageMatrix: CoverageMatrix | null;
  coverageDiff: CoverageDiffMatrix | null;
  docLinks: readonly DocLink[];
  dsmMatrix: DsmMatrix | null;
  connected: boolean;
  analysisProgress: AnalysisProgress | null;
  sendCommand: (cmd: string, payload?: unknown) => void;
  releases: readonly C4ReleaseEntry[];
  selectedRelease: string;
  setSelectedRelease: (release: string) => void;
  selectedRepo: string;
  setSelectedRepo: (repo: string) => void;
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
  setReleases: (entries: readonly C4ReleaseEntry[]) => void,
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
      const [modelRes, dsmRes, covRes, releasesRes] = await Promise.all([
        fetch(modelUrl).catch(() => null),
        fetch(dsmUrl).catch(() => null),
        fetch(`${serverUrl}/api/c4/coverage`).catch(() => null),
        fetch(`${serverUrl}/api/c4/releases`).catch(() => null),
      ]);

      const [modelJson, dsmJson, covJson] = await Promise.all([
        readJson(modelRes),
        readJson(dsmRes),
        readJson(covRes),
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
  }, [serverUrl, selectedRelease, selectedRepo, setC4Model, setBoundaries, setDsmMatrix, setFeatureMatrix, setCoverageMatrix, setCoverageDiff, setReleases]);
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
  const [dsmMatrix, setDsmMatrix] = useState<DsmMatrix | null>(null);
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);
  const [connected, setConnected] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
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
    setReleases,
  );

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
    docLinks,
    dsmMatrix,
    connected,
    analysisProgress,
    sendCommand,
    releases,
    selectedRelease,
    setSelectedRelease,
    selectedRepo,
    setSelectedRepo,
  };
}
