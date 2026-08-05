import type {
  BoundaryInfo,
  C4Model,
  ComplexityMatrix,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/trail-core/c4';

export interface AnalysisProgress {
  /** 現在のフェーズ名（空文字で非表示） */
  phase: string;
  /** 0〜100 の進捗率（-1 で不定） */
  percent: number;
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

export interface WsModelMessage {
  type: 'model-updated';
  model: C4Model;
  boundaries: BoundaryInfo[];
  featureMatrix?: FeatureMatrix;
}

export interface WsDsmMatrixMessage {
  type: 'dsm-updated';
  matrix: DsmMatrix;
}

export interface WsAnalysisProgressMessage {
  type: 'analysis-progress';
  phase: string;
  percent: number;
}

export interface WsDocLinksMessage {
  type: 'doc-links-updated';
  docLinks: DocLink[];
}

export interface WsCoverageMessage {
  type: 'coverage-updated';
  coverageMatrix: CoverageMatrix;
}

export interface WsCoverageDiffMessage {
  type: 'coverage-diff-updated';
  coverageDiff: CoverageDiffMatrix;
}

export interface WsComplexityMessage {
  type: 'complexity-updated';
  complexityMatrix: ComplexityMatrix;
}

export interface WsClaudeActivityMessage {
  type: 'claude-activity-updated';
  activeElementIds: string[];
  touchedElementIds: string[];
  plannedElementIds: string[];
}

export interface WsMultiAgentMessage {
  type: 'multi-agent-activity-updated';
  agents: AgentActivityEntry[];
  conflicts?: FileConflict[];
}

export interface ModelPayload {
  model: C4Model;
  boundaries: BoundaryInfo[];
  featureMatrix?: FeatureMatrix;
}

export interface DsmMatrixPayload {
  matrix: DsmMatrix;
}

export interface ComplexityPayload {
  complexityMatrix: ComplexityMatrix;
}

export const MAX_RETRIES = 5;
export const RECONNECT_DELAY_MS = 3_000;

// Build the WebSocket URL from the data source URL.
//   - ''                     → same-origin (ws(s)://window.location.host)
//   - 'http://host:port'     → ws://host:port
//   - 'https://host:port'    → wss://host:port
// Returns null when neither an absolute URL nor a browser window is available.
export function buildWsUrl(serverUrl: string): string | null {
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

export function isWsModelMessage(v: unknown): v is WsModelMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'model-updated' && 'model' in obj && 'boundaries' in obj;
}

export function isWsModelNotification(v: unknown): v is { type: 'model-updated' } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'model-updated' && !('model' in obj);
}

export function isWsDsmMatrixMessage(v: unknown): v is WsDsmMatrixMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'dsm-updated' && 'matrix' in obj;
}

export function isWsAnalysisProgressMessage(v: unknown): v is WsAnalysisProgressMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'analysis-progress' && typeof obj.phase === 'string';
}

export function isWsDocLinksMessage(v: unknown): v is WsDocLinksMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'doc-links-updated' && Array.isArray(obj.docLinks);
}

export function isWsCoverageMessage(v: unknown): v is WsCoverageMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'coverage-updated' && 'coverageMatrix' in obj;
}

export function isWsCoverageDiffMessage(v: unknown): v is WsCoverageDiffMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'coverage-diff-updated' && 'coverageDiff' in obj;
}

export function isWsComplexityMessage(v: unknown): v is WsComplexityMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'complexity-updated' && 'complexityMatrix' in obj;
}

export function isWsClaudeActivityMessage(v: unknown): v is WsClaudeActivityMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.type === 'claude-activity-updated' &&
    Array.isArray(obj.activeElementIds) &&
    Array.isArray(obj.touchedElementIds) &&
    Array.isArray(obj.plannedElementIds)
  );
}

export function isWsMultiAgentMessage(v: unknown): v is WsMultiAgentMessage {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.type === 'multi-agent-activity-updated' && Array.isArray(obj.agents);
}

export function isModelPayload(v: unknown): v is ModelPayload {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return 'model' in obj && 'boundaries' in obj;
}

export function isDsmMatrixPayload(v: unknown): v is DsmMatrixPayload {
  if (typeof v !== 'object' || v === null) return false;
  return 'matrix' in v;
}

export function isComplexityPayload(v: unknown): v is ComplexityPayload {
  if (typeof v !== 'object' || v === null) return false;
  return 'complexityMatrix' in v;
}

export async function readJson(res: Response | null): Promise<unknown> {
  if (res?.status !== 200) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
