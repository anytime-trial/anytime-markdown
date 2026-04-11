import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  BoundaryInfo,
  C4Model,
  CoverageDiffMatrix,
  CoverageMatrix,
  CyclicPair,
  DocLink,
  DsmDiff,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/c4-kernel';
import {
  extractBoundaries,
  parseMermaidC4,
} from '@anytime-markdown/c4-kernel';

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
  dsmDiff: DsmDiff | null;
  dsmCycles: readonly CyclicPair[];
  connected: boolean;
  analysisProgress: AnalysisProgress | null;
  sendCommand: (cmd: string, payload?: unknown) => void;
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

interface WsDsmDiffMessage {
  type: 'dsm-updated';
  diff: DsmDiff;
  cycles: CyclicPair[];
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

function isWsDsmDiffMessage(v: unknown): v is WsDsmDiffMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'dsm-updated' && 'diff' in obj;
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
// Local-mode loader
// ---------------------------------------------------------------------------

function useLocalMode(enabled: boolean): Pick<
  C4DataSourceResult,
  'c4Model' | 'boundaries'
> {
  const [c4Model, setC4Model] = useState<C4Model | null>(null);
  const [boundaries, setBoundaries] = useState<readonly BoundaryInfo[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch('/anytime-markdown-c4.mmd');
        if (!res.ok) return;
        const text = await res.text();
        if (cancelled) return;
        setC4Model(parseMermaidC4(text));
        setBoundaries(extractBoundaries(text));
      } catch {
        // Static file unavailable — keep null state
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  return { c4Model, boundaries };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useC4DataSource(serverUrl?: string): C4DataSourceResult {
  const isRemote = serverUrl !== undefined;

  // State
  const [remoteModel, setRemoteModel] = useState<C4Model | null>(null);
  const [remoteBoundaries, setRemoteBoundaries] = useState<
    readonly BoundaryInfo[]
  >([]);
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrix | null>(null);
  const [coverageMatrix, setCoverageMatrix] = useState<CoverageMatrix | null>(null);
  const [coverageDiff, setCoverageDiff] = useState<CoverageDiffMatrix | null>(null);
  const [dsmMatrix, setDsmMatrix] = useState<DsmMatrix | null>(null);
  const [dsmDiff, setDsmDiff] = useState<DsmDiff | null>(null);
  const [dsmCycles, setDsmCycles] = useState<readonly CyclicPair[]>([]);
  const [docLinks, setDocLinks] = useState<readonly DocLink[]>([]);
  const [connected, setConnected] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local mode
  const local = useLocalMode(!isRemote);

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
      } else if (isWsDsmDiffMessage(parsed)) {
        setDsmDiff(parsed.diff);
        setDsmCycles(parsed.cycles);
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
    if (!serverUrl) return;

    let mounted = true;

    function connect(): void {
      if (!mounted) return;
      const host = new URL(serverUrl as string).host;
      const ws = new WebSocket(`ws://${host}`);
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
    c4Model: isRemote ? remoteModel : local.c4Model,
    boundaries: isRemote ? remoteBoundaries : local.boundaries,
    featureMatrix,
    coverageMatrix,
    coverageDiff,
    docLinks,
    dsmMatrix,
    dsmDiff,
    dsmCycles,
    connected,
    analysisProgress,
    sendCommand,
  };
}
