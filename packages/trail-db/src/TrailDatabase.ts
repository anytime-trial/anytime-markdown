import type { Database, Statement as SqlJsStatement } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ignore from 'ignore';
import { toUTC, getSqliteTzOffset } from './dateUtils';
import {
  CREATE_SESSIONS,
  CREATE_SESSION_COSTS,
  CREATE_DAILY_COUNTS,
  CREATE_MESSAGES,
  CREATE_SESSION_COMMITS,
  CREATE_CURRENT_GRAPHS,
  CREATE_RELEASE_GRAPHS,
  CREATE_SKILL_MODELS as CREATE_SKILL_MODELS_TABLE,
  CREATE_SKILL_MODELS_RESOLVED_VIEW,
  CREATE_INDEXES,
  CREATE_RELEASES,
  CREATE_RELEASE_FILES,
  CREATE_RELEASE_COVERAGE,
  CREATE_RELEASE_INDEXES,
  CREATE_CURRENT_COVERAGE,
  CREATE_CURRENT_COVERAGE_INDEXES,
  CREATE_CURRENT_CODE_GRAPHS,
  CREATE_RELEASE_CODE_GRAPHS,
  CREATE_CURRENT_CODE_GRAPH_COMMUNITIES,
  CREATE_RELEASE_CODE_GRAPH_COMMUNITIES,
  CREATE_CURRENT_FILE_ANALYSIS,
  CREATE_RELEASE_FILE_ANALYSIS,
  CREATE_CURRENT_FUNCTION_ANALYSIS,
  CREATE_RELEASE_FUNCTION_ANALYSIS,
  CREATE_FILE_ANALYSIS_INDEXES,
  CREATE_MESSAGE_TOOL_CALLS,
  CREATE_MESSAGE_TOOL_CALLS_INDEXES,
  CREATE_MESSAGE_COMMITS,
  CREATE_COMMIT_FILES,
  CREATE_SESSION_COMMIT_RESOLUTIONS,
  CREATE_C4_MANUAL_ELEMENTS,
  CREATE_C4_MANUAL_RELATIONSHIPS,
  CREATE_C4_MANUAL_GROUPS,
  DEFAULT_SKILL_MODELS,
  extractSkillName,
  buildReleaseFromGitData,
  trailToC4,
  extractCommitPrefix,
  isCodeFile,
  isAiFirstTryFailureCommit,
  AI_FIRST_TRY_FIX_WINDOW_MS,
  calculateCost,
  computeTemporalCoupling,
  computeSessionCoupling,
  computeSubagentTypeCoupling,
  computeConfidenceCoupling,
  computeSessionConfidenceCoupling,
  computeSubagentTypeConfidenceCoupling,
  resolvePricingModelName,
} from '@anytime-markdown/trail-core';
import type { TrailGraph, IC4ModelStore, C4ModelEntry, C4ModelResult, TrailMessageCommit, MessageCommitInput, ManualElement, ManualRelationship, ManualGroup, CommitFileRow, SessionFileRow, SubagentTypeFileRow, TemporalCouplingEdge, ConfidenceCouplingEdge, PricingSource } from '@anytime-markdown/trail-core';
import { matchCommitsToMessages, computeDefectRisk, type CommitRiskRow, type DefectRiskEntry } from '@anytime-markdown/trail-core';
import type { AnalyzeOptions } from '@anytime-markdown/trail-core/analyze';

export type AnalyzeFunction = (options: AnalyzeOptions) => TrailGraph;
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import { splitCodeGraph, composeCodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { StoredCommunity } from '@anytime-markdown/trail-core/codeGraph';
import type { FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import { buildFeatureMatrixFromCommunities } from '@anytime-markdown/trail-core/c4';
import type { FileAnalysisRow, FunctionAnalysisRow } from '@anytime-markdown/trail-core/deadCode';
import { JsonlSessionReader } from './JsonlSessionReader';
import { ExecFileGitService } from './ExecFileGitService';
import { type DbLogger, noopDbLogger } from './DbLogger';
import { ClaudeCodeBehaviorAnalyzer } from './ClaudeCodeBehaviorAnalyzer';
import type { ReleaseFileRow, ReleaseCoverageRow, ReleaseRow, CurrentCoverageRow } from '@anytime-markdown/trail-core';
export type { ReleaseFileRow, ReleaseCoverageRow, ReleaseRow } from '@anytime-markdown/trail-core';

declare const __non_webpack_require__: (id: string) => unknown;

const DEFAULT_DB_DIR = path.join(os.homedir(), '.claude', 'trail');

export { assertNotProductionWriteDuringTests } from './TrailDatabase.guard';
import { ITrailStorage, FileTrailStorage } from './ITrailStorage';
import { DatabaseIntegrityMonitor, type IntegrityAlert } from './DatabaseIntegrityMonitor';
export type { ITrailStorage } from './ITrailStorage';
export { FileTrailStorage, InMemoryTrailStorage } from './ITrailStorage';
export type { BackupEntry } from './ITrailStorage';
export { DatabaseIntegrityMonitor } from './DatabaseIntegrityMonitor';
export type { IntegrityAlert } from './DatabaseIntegrityMonitor';

const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

const TEMPORAL_COUPLING_EXCLUDE_PATTERNS: readonly RegExp[] = [
  /\.lock$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /\.min\.js$/,
  /\.map$/,
  /(^|\/)\.worktrees\//,
  /(^|\/)\.claude\//, // .claude/settings.json 等は CodeGraph 対象外
  /(^|\/)\.vscode\//, // .vscode/graphify-out/*.json 等の生成物は CodeGraph 対象外
  /(^|\/)\.next\//,
  /(^|\/)out\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
];

export function defaultTemporalCouplingPathFilter(filePath: string): boolean {
  return !TEMPORAL_COUPLING_EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * サブエージェントが `.claude/worktrees/agent-XXXX/` 内で編集したファイルパスから
 * worktree プレフィックスを剥がし、リポルート起点の相対パスに正規化する。
 * 例: `.claude/worktrees/agent-a30eb6d2/packages/foo/bar.ts` → `packages/foo/bar.ts`
 * これをやらないと `Workspace:packages/foo/bar` のような CodeGraph node ID と一致せず描画されない。
 */
export function stripWorktreePrefix(relPath: string): string {
  return relPath.replace(/^\.claude\/worktrees\/[^/]+\//, '');
}

export type TemporalCouplingGranularity = 'commit' | 'session' | 'subagentType';
export type ActivityTrendGranularity = 'commit' | 'session' | 'subagent' | 'defect';

/** session 粒度で「ファイル編集」とみなすツール名。 */
export const SESSION_COUPLING_EDIT_TOOLS: readonly string[] = [
  'Edit',
  'Write',
  'NotebookEdit',
];
const ACTIVITY_TREND_READ_TOOLS: readonly string[] = [
  'Read',
  'NotebookRead',
];

/** subagent 粒度集計で codex 委任セッションを表すラベル。 */
export const CODEX_SUBAGENT_TYPE = 'codex';

export type FetchTemporalCouplingOptions = {
  repoName: string;
  windowDays: number;
  minChangeCount?: number;
  jaccardThreshold?: number;
  topK?: number;
  directional?: boolean;
  confidenceThreshold?: number;
  directionalDiffThreshold?: number;
  /** 'commit'（デフォルト）= commit_files 起点、'session' = message_tool_calls 起点。 */
  granularity?: TemporalCouplingGranularity;
};

export type FetchDefectRiskOptions = {
  windowDays: number;
  halfLifeDays: number;
};

// ---------------------------------------------------------------------------
//  Type definitions
// ---------------------------------------------------------------------------

interface CoverageSummaryEntry {
  lines: { total: number; covered: number; skipped: number; pct: number };
  statements: { total: number; covered: number; skipped: number; pct: number };
  functions: { total: number; covered: number; skipped: number; pct: number };
  branches: { total: number; covered: number; skipped: number; pct: number };
}

export interface SessionRow {
  readonly id: string;
  readonly slug: string;
  readonly repo_name: string;
  readonly git_branch?: string | null;
  readonly cwd?: string | null;
  readonly permission_mode?: string | null;
  readonly version: string;
  readonly entrypoint: string;
  readonly model: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly file_path: string;
  readonly file_size: number;
  readonly imported_at: string;
  readonly commits_resolved_at?: string;
  // Aggregated from session_costs via JOIN
  readonly estimated_cost_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
  readonly peak_context_tokens?: number;
  readonly initial_context_tokens?: number;
  readonly interruption_reason?: string | null;
  readonly interruption_context_tokens?: number;
  readonly compact_count?: number;
  readonly sub_agent_count?: number | null;
  readonly error_count?: number | null;
  readonly assistant_message_count?: number | null;
  readonly source?: string;
}

export interface MessageRow {
  readonly uuid: string;
  readonly session_id: string;
  readonly parent_uuid: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly text_content: string | null;
  readonly user_content: string | null;
  readonly tool_calls: string | null;
  readonly tool_use_result: string | null;
  readonly model: string | null;
  readonly request_id: string | null;
  readonly stop_reason: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly service_tier: string | null;
  readonly speed: string | null;
  readonly timestamp: string;
  readonly is_sidechain: number;
  readonly is_meta: number;
  readonly cwd: string | null;
  readonly git_branch: string | null;
  readonly permission_mode?: string | null;
  readonly skill?: string | null;
  readonly agent_id?: string | null;
  readonly agent_description?: string | null;
  readonly agent_model?: string | null;
  readonly subagent_type?: string | null;
  readonly source_tool_assistant_uuid?: string | null;
  readonly source_tool_use_id?: string | null;
  readonly system_command?: string | null;
  readonly duration_ms?: number | null;
  readonly tool_result_size?: number | null;
}

export interface SessionCommitRow {
  readonly session_id: string;
  readonly commit_hash: string;
  readonly commit_message: string;
  readonly author: string;
  readonly committed_at: string;
  readonly is_ai_assisted: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly repo_name: string;
}

interface SessionFilters {
  readonly branch?: string;
  readonly model?: string;
  readonly repository?: string;
  readonly from?: string;
  readonly to?: string;
}

interface SearchResult {
  readonly session_id: string;
  readonly uuid: string;
  readonly snippet: string;
  readonly type: string;
  readonly timestamp: string;
}

interface DbStats {
  readonly totalSessions: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly topToolNames: readonly { name: string; count: number }[];
  readonly sessionsByBranch: readonly { branch: string; count: number }[];
  readonly sessionsByModel: readonly { model: string; count: number }[];
}

export interface AnalyticsData {
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
    readonly totalCommits: number;
    readonly totalLinesAdded: number;
    readonly totalLinesDeleted: number;
    readonly totalFilesChanged: number;
    readonly totalAiAssistedCommits: number;
    readonly totalSessionDurationMs: number;
    readonly totalRetries: number;
    readonly totalEdits: number;
    readonly totalBuildRuns: number;
    readonly totalBuildFails: number;
    readonly totalTestRuns: number;
    readonly totalTestFails: number;
    readonly totalLoc: number;
  };
  readonly toolUsage: readonly { name: string; count: number }[];
  readonly dailyActivity: readonly {
    readonly date: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
  }[];
}

export interface CostOptimizationData {
  readonly actual: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly skillEstimate: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly daily: readonly {
    readonly date: string;
    readonly actualCost: number;
    readonly skillCost: number;
  }[];
  readonly modelDistribution: {
    readonly actual: Readonly<Record<string, number>>;
    readonly skillRecommended: Readonly<Record<string, number>>;
  };
}

interface CombinedData {
  readonly toolCounts: readonly { period: string; tool: string; count: number; tokens: number; durationMs: number; tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number }[];
  readonly errorRate: readonly { period: string; rate: number; byTool: Readonly<Record<string, number>> }[];
  readonly skillStats: readonly { period: string; skill: string; count: number; costUsd: number }[];
  readonly modelStats: readonly { period: string; model: string; count: number; tokens: number; tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number }[];
  readonly agentStats: readonly {
    period: string; agent: string; tokens: number; costUsd: number; loc: number;
    tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number;
  }[];
  readonly commitPrefixStats: readonly { period: string; prefix: string; count: number; linesAdded: number; linesDeleted: number }[];
  readonly aiFirstTryRate: readonly { period: string; rate: number; sampleSize: number }[];
  readonly repoStats: readonly { period: string; repoName: string; count: number; tokens: number }[];
  readonly qualityRates: readonly { period: string; retryRate: number | null; buildFailRate: number | null; testFailRate: number | null }[];
}

interface RawLine {
  uuid?: string;
  parentUuid?: string | null;
  type?: string;
  subtype?: string;
  timestamp?: string;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  slug?: string;
  entrypoint?: string;
  userType?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  permissionMode?: string;
  promptId?: string;
  requestId?: string;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  sourceToolUseID?: string;
  agentId?: string;
  durationMs?: number;
  message?: {
    role?: string;
    model?: string;
    content?: string | readonly RawContentBlock[];
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      service_tier?: string;
      speed?: string;
    };
  };
  payload?: Record<string, unknown>;
  call_id?: string;
}

interface RawContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
//  SQL statements
// ---------------------------------------------------------------------------

// Schema constants imported from trail-core (see import at top of file)









// DEFAULT_SKILL_MODELS imported from trail-core (see import at top of file)

// CREATE_INDEXES imported from trail-core (see import at top of file)

const INSERT_SESSION = `INSERT OR REPLACE INTO sessions
  (id, slug, repo_name, version, entrypoint, model,
   start_time, end_time, message_count,
   file_path, file_size, imported_at, source)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const INSERT_SESSION_COST = `INSERT OR REPLACE INTO session_costs
  (session_id, model, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
  VALUES (?,?,?,?,?,?,?)`;


export const INSERT_MESSAGE = `INSERT OR REPLACE INTO messages
  (uuid, session_id, parent_uuid, type, subtype, text_content,
   user_content, tool_calls, tool_use_result, model, request_id,
   stop_reason, input_tokens, output_tokens, cache_read_tokens,
   cache_creation_tokens, service_tier, speed, timestamp,
   is_sidechain, is_meta, cwd, git_branch,
   duration_ms, tool_result_size, agent_description, agent_model,
   permission_mode, skill, agent_id, source_tool_assistant_uuid, source_tool_use_id, system_command, subagent_type)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;


// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractTextContent(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = (content as RawContentBlock[])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string);
  return texts.length > 0 ? texts.join('\n') : null;
}

function extractToolCalls(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string' || !Array.isArray(content)) return null;
  const calls = (content as RawContentBlock[])
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));
  return calls.length > 0 ? JSON.stringify(calls) : null;
}

function extractCodexText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const text = (block as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim()) texts.push(text);
  }
  return texts.length > 0 ? texts.join('\n') : null;
}

function normalizeCodexTokenUsage(last: Record<string, unknown>): {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  const totalInputTokens = Number(last.input_tokens ?? 0);
  const cachedInputTokens = Number(last.cached_input_tokens ?? 0);
  return {
    input_tokens: Math.max(0, totalInputTokens - cachedInputTokens),
    output_tokens: Number(last.output_tokens ?? 0),
    cache_read_input_tokens: cachedInputTokens,
    cache_creation_input_tokens: 0,
  };
}

function collectJsonlFilesRecursive(rootDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let entries: string[] = [];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }
  walk(rootDir);
  return results;
}

function normalizeCodexRecords(records: readonly RawLine[], fallbackSessionId: string): {
  normalized: RawLine[];
  sessionId: string;
  version: string;
  source: 'codex';
} {
  const normalized: RawLine[] = [];
  let seq = 0;
  let sessionId = fallbackSessionId;
  let version = '';

  for (const record of records) {
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
    if (record.type === 'session_meta' && record.payload && typeof record.payload === 'object') {
      const payload = record.payload as Record<string, unknown>;
      const id = payload.id;
      if (typeof id === 'string' && id) sessionId = id;
      const cliVersion = payload.cli_version;
      if (typeof cliVersion === 'string' && cliVersion) version = cliVersion;
      continue;
    }
    if (record.type === 'event_msg' && record.payload && typeof record.payload === 'object') {
      const payload = record.payload as Record<string, unknown>;
      if (payload.type === 'task_started') {
        continue;
      }
      if (payload.type === 'token_count' && payload.info && typeof payload.info === 'object') {
        const info = payload.info as Record<string, unknown>;
        const last = info.last_token_usage as Record<string, unknown> | undefined;
        if (last && normalized.length > 0) {
          for (let i = normalized.length - 1; i >= 0; i--) {
            const candidate = normalized[i];
            if (candidate.type !== 'assistant') continue;
            candidate.message = {
              ...(candidate.message ?? {}),
              usage: normalizeCodexTokenUsage(last),
            };
            break;
          }
        }
        continue;
      }
      if (payload.type === 'agent_message' && typeof payload.message === 'string') {
        normalized.push({
          uuid: `codex-${seq++}`,
          sessionId,
          type: 'assistant',
          timestamp,
          message: { content: payload.message },
        });
      }
      continue;
    }
    if (record.type !== 'response_item' || !record.payload || typeof record.payload !== 'object') continue;
    const payload = record.payload as Record<string, unknown>;
    const payloadType = typeof payload.type === 'string' ? payload.type : '';
    if (payloadType === 'message') {
      const role = typeof payload.role === 'string' ? payload.role : '';
      if (role !== 'user' && role !== 'assistant' && role !== 'developer' && role !== 'system') continue;
      const text = extractCodexText(payload.content);
      const normalizedType: 'user' | 'assistant' | 'system' = role === 'user'
        ? 'user'
        : role === 'assistant'
          ? 'assistant'
          : 'system';
      normalized.push({
        uuid: `codex-${seq++}`,
        sessionId,
        type: normalizedType,
        subtype: role,
        timestamp,
        message: { content: text ?? '' },
      });
      continue;
    }
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const id = typeof payload.call_id === 'string' ? payload.call_id : `codex-call-${seq}`;
      const name = typeof payload.name === 'string' ? payload.name : 'tool';
      const rawInput = payloadType === 'function_call' ? payload.arguments : payload.input;
      let parsedInput: Record<string, unknown> = {};
      if (typeof rawInput === 'string' && rawInput.trim()) {
        try { parsedInput = JSON.parse(rawInput) as Record<string, unknown>; } catch { parsedInput = { raw: rawInput }; }
      } else if (rawInput && typeof rawInput === 'object') {
        parsedInput = rawInput as Record<string, unknown>;
      }
      normalized.push({
        uuid: `codex-${seq++}`,
        sessionId,
        type: 'assistant',
        timestamp,
        message: {
          content: [{ type: 'tool_use', id, name, input: parsedInput }],
        },
      });
      continue;
    }
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      const id = typeof payload.call_id === 'string' ? payload.call_id : '';
      const output = typeof payload.output === 'string'
        ? payload.output
        : JSON.stringify(payload.output ?? '');
      normalized.push({
        uuid: `codex-${seq++}`,
        sessionId,
        type: 'user',
        timestamp,
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: id,
            content: output,
            is_error: false,
          }] as unknown as readonly RawContentBlock[],
        },
      });
      continue;
    }
    if (payloadType === 'token_count' && payload.info && typeof payload.info === 'object') {
      const info = payload.info as Record<string, unknown>;
      const last = info.last_token_usage as Record<string, unknown> | undefined;
      if (last && normalized.length > 0) {
        for (let i = normalized.length - 1; i >= 0; i--) {
          const candidate = normalized[i];
          if (candidate.type !== 'assistant') continue;
          candidate.message = {
            ...(candidate.message ?? {}),
            usage: normalizeCodexTokenUsage(last),
          };
          break;
        }
      }
      continue;
    }
  }
  return { normalized, sessionId, version, source: 'codex' };
}

/**
 * Extract Agent tool call description and model from tool_calls JSON.
 * Returns the first Agent call found (most messages have at most one).
 */
function extractAgentInfo(
  toolCallsJson: string | null,
): { description: string | null; model: string | null; subagentType: string | null } {
  if (!toolCallsJson) return { description: null, model: null, subagentType: null };
  try {
    const calls = JSON.parse(toolCallsJson) as { name?: string; input?: Record<string, unknown> }[];
    const agentCall = calls.find((c) => c.name === 'Agent');
    if (!agentCall?.input) return { description: null, model: null, subagentType: null };
    return {
      description: (agentCall.input.description as string) ?? null,
      model: (agentCall.input.model as string) ?? null,
      subagentType: (agentCall.input.subagent_type as string) ?? null,
    };
  } catch {
    return { description: null, model: null, subagentType: null };
  }
}

/**
 * サブエージェント JSONL に隣接する `agent-{agentId}.meta.json` から `agentType` を読む。
 * April 2026 以降に Claude Code が記録する。古いセッションでは存在せず NULL を返す。
 */
function readSubagentTypeFromMeta(jsonlPath: string): string | null {
  const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as { agentType?: unknown };
    return typeof meta.agentType === 'string' && meta.agentType.length > 0 ? meta.agentType : null;
  } catch {
    return null;
  }
}

// extractSkillName imported from trail-core (see import at top of file)

/**
 * Estimate token count from a string.
 * Uses a rough heuristic of 1 token per 4 characters.
 */
function estimateTokenCount(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
//  Cost classification helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  TrailDatabase
// ---------------------------------------------------------------------------

export class TrailDatabase {
  private db: Database | null = null;
  private readonly dbPath: string;
  private readonly storage: ITrailStorage;
  private readonly integrityMonitor = new DatabaseIntegrityMonitor();
  private onIntegrityAlert: ((alerts: readonly IntegrityAlert[]) => void) | null = null;

  /**
   * @param distPath sql-wasm.js / sql-wasm.wasm の配置ディレクトリ
   * @param storageDirOrStorage ディレクトリ文字列（互換 API）または ITrailStorage を直接注入
   */
  private readonly logger: DbLogger;

  constructor(
    private readonly distPath: string,
    storageDirOrStorage?: string | ITrailStorage,
    backupGenerations?: number,
    logger?: DbLogger,
    backupIntervalDays?: number,
  ) {
    if (storageDirOrStorage !== undefined && typeof storageDirOrStorage !== 'string') {
      this.storage = storageDirOrStorage;
      this.dbPath = this.storage.identifier;
    } else {
      const dbDir = storageDirOrStorage ?? DEFAULT_DB_DIR;
      this.dbPath = path.join(dbDir, 'trail.db');
      this.storage = new FileTrailStorage(this.dbPath, backupGenerations, backupIntervalDays);
    }
    this.logger = logger ?? noopDbLogger;
  }

  /** IntegrityMonitor が異常を検知したときに呼ばれるハンドラを登録。 */
  setIntegrityAlertHandler(handler: (alerts: readonly IntegrityAlert[]) => void): void {
    this.onIntegrityAlert = handler;
  }

  /**
   * SQL 計測ヘルパー。fn を実行して所要時間と任意の rowCount を logger.debugSql に流す。
   * TRAIL_DEBUG_SQL=1 の時のみ TrailLogger 側で OutputChannel に出力される。
   * 失敗時はログを出さず例外をそのまま伝播する。
   */
  private runQuery<T>(name: string, fn: () => T, getRowCount?: (result: T) => number): T {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const result = fn();
    const t1 = (typeof performance !== 'undefined' ? performance : Date).now();
    const meta: { name: string; durationMs: number; rowCount?: number } = {
      name,
      durationMs: t1 - t0,
    };
    if (getRowCount) meta.rowCount = getRowCount(result);
    this.logger.debugSql(meta);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────
  //  集計ヘルパー
  //  系統 1: byDateRange  — rebuildDailyCounts の kind='tool' (L1839 起源)
  //  系統 2: bySession    — computeToolMetrics の tool/skill (L4948/L4989 起源)
  //  系統 3: byMessageDateCutoff — getCombinedData (L5430 起源)
  //  各ヘルパーは A-4 で call site を集約済み。Phase A-3 で内部 SQL を順次
  //  範囲スキャン+TS 集計へ置換する（系統 1 完了 / 系統 2,3 未着手）。
  // ─────────────────────────────────────────────────────────────────

  /**
   * SQL の `tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\' THEN SUBSTR(...)` を JS で再現。
   * "mcp__SERVER__TOOL" 形式のとき "mcp__SERVER" まで切り出す。それ以外は元値を返す。
   */
  private applyToolMcpAlias(toolName: string): string {
    if (!toolName.startsWith('mcp__')) return toolName;
    const rest = toolName.slice(5);
    const pos = rest.indexOf('__');
    if (pos < 0) return toolName;
    return toolName.slice(0, pos + 5);
  }

  /**
   * SQL の `DATE(timestamp, '+540 minutes')` を JS で再現。tzOffset は
   * `getSqliteTzOffset()` の出力形式（"+540 minutes" / "-300 minutes"）を期待する。
   * ISO 8601 timestamp を UTC ms に変換 → オフセット分加算 → YYYY-MM-DD を抽出。
   */
  private computeDateInSqliteTz(isoTimestamp: string, tzOffset: string): string {
    const m = /^([+-])(\d+) minutes$/.exec(tzOffset);
    const ms = Date.parse(isoTimestamp);
    if (!m || Number.isNaN(ms)) return isoTimestamp.slice(0, 10);
    const sign = m[1] === '+' ? 1 : -1;
    const offsetMin = sign * Number(m[2]);
    const shifted = new Date(ms + offsetMin * 60000);
    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * SQL の `strftime('%Y-W%W', timestamp, '+540 minutes')` を JS で再現。
   * SQLite の %W: 月曜始まりの週番号 (00-53)。年初の最初の月曜より前は週 00。
   * 出力フォーマット: `YYYY-W##`
   */
  private computeWeekInSqliteTz(isoTimestamp: string, tzOffset: string): string {
    const m = /^([+-])(\d+) minutes$/.exec(tzOffset);
    const ms = Date.parse(isoTimestamp);
    if (!m || Number.isNaN(ms)) return '';
    const sign = m[1] === '+' ? 1 : -1;
    const offsetMin = sign * Number(m[2]);
    const shifted = new Date(ms + offsetMin * 60000);
    const year = shifted.getUTCFullYear();
    const jan1Ms = Date.UTC(year, 0, 1);
    const jan1Day = new Date(jan1Ms).getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysToFirstMonday = (8 - jan1Day) % 7; // Mon=0, Tue=6, Sun=1
    const firstMondayMs = jan1Ms + daysToFirstMonday * 86400000;
    const dateMs = shifted.getTime();
    let week: number;
    if (dateMs < firstMondayMs) {
      week = 0;
    } else {
      week = Math.floor((dateMs - firstMondayMs) / (7 * 86400000)) + 1;
    }
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * SQLite の IN 句変数上限 (デフォルト 999) を考慮し、items を batchSize 件ずつに
   * 分割して fn を呼び出す。fn の戻り値の配列を結合して返す。
   */
  private fetchInBatches<TItem, TRow>(
    items: readonly TItem[],
    batchSize: number,
    fn: (batch: readonly TItem[]) => readonly TRow[],
  ): TRow[] {
    const out: TRow[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const rows = fn(batch);
      for (const r of rows) out.push(r);
    }
    return out;
  }

  /**
   * 系統 1: tzOffset 適用日付別の tool 利用集計。
   * rebuildDailyCounts の kind='tool' 集計用。
   *
   * Phase A-3: 旧 SQL (CTE + LEFT JOIN + window + GROUP BY) を範囲スキャン 2 本 +
   * TS 集計に置き換える。message_tool_calls 全件 + 出現 message_uuid に対する
   * messages バッチ取得で msg_tokens を解決し、tools_in_msg / tools_in_turn は
   * Map で算出。LEFT JOIN の semantics（messages 行が無い場合 msg_tokens=0）と
   * SQL の SUM(ROUND(1.0 * x / y)) の按分順序を完全保持する。
   */
  private aggregateToolUsageByDateRange(tzOffset: string): readonly {
    date: string; tool: string; count: number; tokens: number; durationMs: number;
  }[] {
    const db = this.ensureDb();
    return this.runQuery(
      'aggregateToolUsageByDateRange',
      () => {
        // Phase 1: message_tool_calls 全件範囲スキャン（rebuildDailyCounts は WHERE 無し）
        const tcResult = db.exec(
          `SELECT session_id, message_uuid, turn_index, tool_name, timestamp,
                  COALESCE(turn_exec_ms, 0) AS turn_exec_ms
           FROM message_tool_calls`,
        );
        const tcRows = tcResult[0]?.values ?? [];
        if (tcRows.length === 0) return [];

        // Phase 1.5: session start_time を取得し、日付キーを session 基準で算出するための Map 構築
        const sessionIds1 = [...new Set(tcRows.map((r) => r[0] as string))];
        const SQLITE_VAR_LIMIT = 999;
        const sessionDateMap = new Map<string, string>();
        this.fetchInBatches(sessionIds1, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const sResult = db.exec(
            `SELECT id, start_time FROM sessions WHERE id IN (${placeholders})`,
            batch as string[],
          );
          for (const r of sResult[0]?.values ?? []) {
            const sid = r[0] as string;
            const st = r[1] as string;
            if (st) sessionDateMap.set(sid, this.computeDateInSqliteTz(st, tzOffset));
          }
          return [];
        });

        // Phase 2: 出現する message_uuid 集合
        const messageUuids = new Set<string>();
        for (const row of tcRows) messageUuids.add(row[1] as string);

        // Phase 3: messages を uuid IN (?) でバッチ取得し msg_tokens Map 構築
        // LEFT JOIN semantics 保持: 該当行が無い uuid は Map に入らず後段で 0 扱い
        const msgTokensByUuid = new Map<string, number>();
        const uuidList = [...messageUuids];
        this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const msgResult = db.exec(
            `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
             FROM messages WHERE uuid IN (${placeholders})`,
            batch as string[],
          );
          for (const r of msgResult[0]?.values ?? []) {
            msgTokensByUuid.set(r[0] as string, r[1] as number);
          }
          return [];
        });

        // Phase 4: tools_in_msg / tools_in_turn を算出
        const TURN_KEY_SEP = '\x1f';
        const toolsInMsg = new Map<string, number>();
        const toolsInTurn = new Map<string, number>();
        for (const row of tcRows) {
          const messageUuid = row[1] as string;
          const turnKey = `${row[0]}${TURN_KEY_SEP}${row[2]}`;
          toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
          toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
        }

        // Phase 5: (date, tool) 単位で count / tokens / durationMs を集計
        // SUM(ROUND(1.0 * x / y)) と同等のため、各行で round → 集計 を踏襲する
        type Agg = { count: number; tokens: number; duration: number };
        const aggMap = new Map<string, Agg>();
        for (const row of tcRows) {
          const sessionId = row[0] as string;
          const messageUuid = row[1] as string;
          const turnIndex = row[2];
          const toolName = row[3] as string;
          const timestamp = row[4] as string;
          const turnExecMs = Number(row[5] ?? 0);

          const tool = this.applyToolMcpAlias(toolName);
          // session start_time 基準の日付（未取得の場合は tool call timestamp にフォールバック）
          const date = sessionDateMap.get(sessionId) ?? this.computeDateInSqliteTz(timestamp, tzOffset);

          const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
          const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
          const tokensContrib = Math.round(msgTokens / tInMsg);

          const turnKey = `${sessionId}${TURN_KEY_SEP}${turnIndex}`;
          const tInTurn = toolsInTurn.get(turnKey) ?? 1;
          const durationContrib = Math.round(turnExecMs / tInTurn);

          const aggKey = `${date}${TURN_KEY_SEP}${tool}`;
          const cur = aggMap.get(aggKey) ?? { count: 0, tokens: 0, duration: 0 };
          cur.count += 1;
          cur.tokens += tokensContrib;
          cur.duration += durationContrib;
          aggMap.set(aggKey, cur);
        }

        // Phase 6: 結果配列へ変換
        return [...aggMap.entries()].map(([key, agg]) => {
          const sep = key.indexOf(TURN_KEY_SEP);
          return {
            date: key.slice(0, sep),
            tool: key.slice(sep + 1),
            count: agg.count,
            tokens: agg.tokens,
            durationMs: agg.duration,
          };
        });
      },
      (rows) => rows.length,
    );
  }

  /**
   * 系統 2 共通実装: セッション内の tool/skill 別利用集計。
   * 内部は range scan + uuid IN バッチ + TS 集計。LEFT JOIN semantics と
   * SUM(ROUND(1.0 * x / y)) の按分順序を完全保持する。
   * tools_in_msg / tools_in_turn は CTE フィルタ後の対象集合に対して計算する
   * （旧 SQL の `WHERE ... [AND skill_name IS NOT NULL]` を CTE 内に持たせていた挙動と一致）。
   */
  private aggregateBySessionInternal(
    sessionId: string,
    groupKeyColumn: 'tool_name' | 'skill_name',
    skipNullKey: boolean,
  ): readonly { key: string; count: number; tokens: number; durationMs: number }[] {
    const db = this.ensureDb();
    // Phase 1: message_tool_calls を session 範囲スキャン
    //   skipNullKey=true のとき skill_name IS NOT NULL を WHERE に含める
    const sql = skipNullKey
      ? `SELECT message_uuid, turn_index, ${groupKeyColumn} AS key_col,
              COALESCE(turn_exec_ms, 0) AS turn_exec_ms
         FROM message_tool_calls
         WHERE session_id = ? AND ${groupKeyColumn} IS NOT NULL`
      : `SELECT message_uuid, turn_index, ${groupKeyColumn} AS key_col,
              COALESCE(turn_exec_ms, 0) AS turn_exec_ms
         FROM message_tool_calls
         WHERE session_id = ?`;
    const tcResult = db.exec(sql, [sessionId]);
    const tcRows = tcResult[0]?.values ?? [];
    if (tcRows.length === 0) return [];

    // Phase 2: 出現する message_uuid 集合
    const messageUuids = new Set<string>();
    for (const row of tcRows) messageUuids.add(row[0] as string);

    // Phase 3: messages を uuid IN (?) でバッチ取得して msg_tokens Map 構築
    const SQLITE_VAR_LIMIT = 999;
    const msgTokensByUuid = new Map<string, number>();
    const uuidList = [...messageUuids];
    this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
      const placeholders = batch.map(() => '?').join(',');
      const msgResult = db.exec(
        `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
         FROM messages WHERE uuid IN (${placeholders})`,
        batch as string[],
      );
      for (const r of msgResult[0]?.values ?? []) {
        msgTokensByUuid.set(r[0] as string, r[1] as number);
      }
      return [];
    });

    // Phase 4: tools_in_msg / tools_in_turn を CTE 後集合に対して算出
    // session_id 部分は単一 session なので turnKey は turn_index のみで十分
    const toolsInMsg = new Map<string, number>();
    const toolsInTurn = new Map<number | string, number>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1] as number | string;
      toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
      toolsInTurn.set(turnIndex, (toolsInTurn.get(turnIndex) ?? 0) + 1);
    }

    // Phase 5: groupKey 単位で集計
    type Agg = { count: number; tokens: number; duration: number };
    const aggMap = new Map<string, Agg>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1] as number | string;
      const rawKey = row[2] as string;
      const turnExecMs = Number(row[3] ?? 0);

      // tool 列のみ MCP alias を適用、skill 列はそのまま
      const key = groupKeyColumn === 'tool_name' ? this.applyToolMcpAlias(rawKey) : rawKey;

      const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
      const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
      const tokensContrib = Math.round(msgTokens / tInMsg);

      const tInTurn = toolsInTurn.get(turnIndex) ?? 1;
      const durationContrib = Math.round(turnExecMs / tInTurn);

      const cur = aggMap.get(key) ?? { count: 0, tokens: 0, duration: 0 };
      cur.count += 1;
      cur.tokens += tokensContrib;
      cur.duration += durationContrib;
      aggMap.set(key, cur);
    }

    // Phase 6: 結果配列へ変換 + count DESC でソート（旧 SQL の ORDER BY count DESC を保持）
    return [...aggMap.entries()]
      .map(([key, agg]) => ({
        key,
        count: agg.count,
        tokens: agg.tokens,
        durationMs: agg.duration,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 指定日 (JST) のセッション start_time 基準で tool/skill 別利用集計。
   * getDayToolMetrics 用: daily_counts (timestamp 基準) の代替。
   * aggregateBySessionInternal と同実装だが WHERE が session start_time date。
   */
  private aggregateByDayInternal(
    date: string,
    groupKeyColumn: 'tool_name' | 'skill_name',
    skipNullKey: boolean,
  ): readonly { key: string; count: number; tokens: number; durationMs: number }[] {
    const db = this.ensureDb();
    const nullFilter = skipNullKey ? ` AND mtc.${groupKeyColumn} IS NOT NULL` : '';
    const tcResult = db.exec(
      `SELECT mtc.message_uuid, mtc.turn_index, mtc.session_id,
              mtc.${groupKeyColumn} AS key_col,
              COALESCE(mtc.turn_exec_ms, 0) AS turn_exec_ms
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE DATE(s.start_time, '+540 minutes') = ?${nullFilter}`,
      [date],
    );
    const tcRows = tcResult[0]?.values ?? [];
    if (tcRows.length === 0) return [];

    const messageUuids = new Set<string>();
    for (const row of tcRows) messageUuids.add(row[0] as string);

    const SQLITE_VAR_LIMIT = 999;
    const msgTokensByUuid = new Map<string, number>();
    this.fetchInBatches([...messageUuids], SQLITE_VAR_LIMIT, (batch) => {
      const placeholders = batch.map(() => '?').join(',');
      const msgResult = db.exec(
        `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
         FROM messages WHERE uuid IN (${placeholders})`,
        batch as string[],
      );
      for (const r of msgResult[0]?.values ?? []) {
        msgTokensByUuid.set(r[0] as string, r[1] as number);
      }
      return [];
    });

    const TURN_KEY_SEP = '\x1f';
    const toolsInMsg = new Map<string, number>();
    const toolsInTurn = new Map<string, number>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnKey = `${row[2]}${TURN_KEY_SEP}${row[1]}`;
      toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
      toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
    }

    type Agg = { count: number; tokens: number; duration: number };
    const aggMap = new Map<string, Agg>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1];
      const sessionId = row[2] as string;
      const rawKey = row[3] as string | null;
      const turnExecMs = Number(row[4] ?? 0);
      if (rawKey === null) continue;
      const key = groupKeyColumn === 'tool_name' ? this.applyToolMcpAlias(rawKey) : rawKey;

      const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
      const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
      const tokensContrib = Math.round(msgTokens / tInMsg);

      const turnKey = `${sessionId}${TURN_KEY_SEP}${turnIndex}`;
      const tInTurn = toolsInTurn.get(turnKey) ?? 1;
      const durationContrib = Math.round(turnExecMs / tInTurn);

      const cur = aggMap.get(key) ?? { count: 0, tokens: 0, duration: 0 };
      cur.count += 1;
      cur.tokens += tokensContrib;
      cur.duration += durationContrib;
      aggMap.set(key, cur);
    }

    return [...aggMap.entries()]
      .map(([key, agg]) => ({ key, count: agg.count, tokens: agg.tokens, durationMs: agg.duration }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 系統 2 (tool): セッション内の tool 別利用集計。
   * computeToolMetrics の toolUsage 用 (L4948 起源)。
   */
  private aggregateToolUsageBySession(sessionId: string): readonly {
    tool: string; count: number; tokens: number; durationMs: number;
  }[] {
    return this.runQuery(
      'aggregateToolUsageBySession',
      () => this.aggregateBySessionInternal(sessionId, 'tool_name', false)
        .map((r) => ({ tool: r.key, count: r.count, tokens: r.tokens, durationMs: r.durationMs })),
      (rows) => rows.length,
    );
  }

  /**
   * 系統 2 (skill): セッション内の skill 別利用集計。
   * computeToolMetrics の skillUsage 用 (L4989 起源)。skill_name IS NOT NULL を強制。
   */
  private aggregateSkillUsageBySession(sessionId: string): readonly {
    skill: string; count: number; tokens: number; durationMs: number;
  }[] {
    return this.runQuery(
      'aggregateSkillUsageBySession',
      () => this.aggregateBySessionInternal(sessionId, 'skill_name', true)
        .map((r) => ({ skill: r.key, count: r.count, tokens: r.tokens, durationMs: r.durationMs })),
      (rows) => rows.length,
    );
  }

  /**
   * 系統 3: messages.timestamp の cutoff + sessions JOIN + period 別の tool 集計。
   * getCombinedData の toolRawResult 用 (L5430 起源)。
   *
   * Phase A-3: 旧 SQL (subquery + window + INNER JOIN x2 + GROUP BY) を範囲スキャン
   * 3 本 (message_tool_calls / messages / sessions) + TS 集計に置き換える。
   * 引数を SQL fragment から semantic discriminator (rangeDays, period, tzOffset) に
   * 変更し、cutoffDate のみ SQLite の `DATE('now', '-Nd')` で算出して既存セマンティクス
   * (UTC 基準の cutoff vs JST 基準の messageDate を文字列比較する) を完全保持する。
   *
   * factor 補正に必要な token_total_turns / token_missing_turns を含む raw 行を返し、
   * factor 計算は呼び出し側 (getCombinedData) が行う。
   *
   * 保持する semantics:
   * - tools_in_msg / tools_in_turn は filter 前の全 message_tool_calls 集合に対して計算
   * - INNER JOIN messages: 該当 m が無い tc は除外
   * - INNER JOIN sessions: m.session_id に該当 s が無い行は除外
   * - token_total_turns / token_missing_turns は per-tc 行カウント（per-message ではない）
   * - tool_name の MCP alias 適用
   * - SUM(ROUND(1.0 * x / y)) の按分順序
   */
  private aggregateToolUsageByMessageDateCutoff(
    rangeDays: number,
    period: 'day' | 'week',
    tzOffset: string,
  ): readonly Record<string, unknown>[] {
    const db = this.ensureDb();
    return this.runQuery(
      'aggregateToolUsageByMessageDateCutoff',
      () => {
        // Step 1: cutoffDate は SQLite の DATE('now', '-Nd') を 1 回だけ実行して取得
        // 既存 SQL の `WHERE DATE(m.timestamp, tzOffset) >= DATE('now', '-Nd')` は
        // 「JST 日付 >= UTC 日付」の文字列比較で評価されるため、cutoffDate は UTC 日付
        const cutoffResult = db.exec(`SELECT DATE('now', '-${rangeDays} days') AS d`);
        const cutoffDate = String(cutoffResult[0]?.values[0]?.[0] ?? '');

        // Step 2: message_tool_calls 全件範囲スキャン
        const tcResult = db.exec(
          `SELECT session_id, message_uuid, turn_index, tool_name, COALESCE(turn_exec_ms, 0) AS turn_exec_ms
           FROM message_tool_calls`,
        );
        const tcRows = tcResult[0]?.values ?? [];
        if (tcRows.length === 0) return [];

        // Step 3: filter 前の全集合に対して tools_in_msg / tools_in_turn を算出
        const TURN_KEY_SEP = '\x1f';
        const toolsInMsg = new Map<string, number>();
        const toolsInTurn = new Map<string, number>();
        for (const row of tcRows) {
          const messageUuid = row[1] as string;
          const turnKey = `${row[0]}${TURN_KEY_SEP}${row[2]}`;
          toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
          toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
        }

        // Step 4: 出現する message_uuid に対する messages を uuid IN バッチ取得
        const SQLITE_VAR_LIMIT = 999;
        const uuidList = [...new Set(tcRows.map((r) => r[1] as string))];
        type MsgInfo = {
          type: string;
          timestamp: string;
          sessionId: string;
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheCreationTokens: number;
        };
        const msgInfoMap = new Map<string, MsgInfo>();
        this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const msgResult = db.exec(
            `SELECT uuid, type, timestamp, session_id,
                    COALESCE(input_tokens, 0), COALESCE(output_tokens, 0),
                    COALESCE(cache_read_tokens, 0), COALESCE(cache_creation_tokens, 0)
             FROM messages WHERE uuid IN (${placeholders})`,
            batch as string[],
          );
          for (const r of msgResult[0]?.values ?? []) {
            msgInfoMap.set(r[0] as string, {
              type: r[1] as string,
              timestamp: r[2] as string,
              sessionId: r[3] as string,
              inputTokens: Number(r[4] ?? 0),
              outputTokens: Number(r[5] ?? 0),
              cacheReadTokens: Number(r[6] ?? 0),
              cacheCreationTokens: Number(r[7] ?? 0),
            });
          }
          return [];
        });

        // Step 5: messages から派生した session_id 集合に対する sessions を id IN バッチ取得
        const sessionIds = [...new Set([...msgInfoMap.values()].map((m) => m.sessionId))];
        const sessionSourceMap = new Map<string, string>();
        const sessionStartTsMap = new Map<string, string>(); // session_id → start_time (UTC ISO)
        this.fetchInBatches(sessionIds, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const sessResult = db.exec(
            `SELECT id, source, start_time FROM sessions WHERE id IN (${placeholders})`,
            batch as string[],
          );
          for (const r of sessResult[0]?.values ?? []) {
            sessionSourceMap.set(r[0] as string, r[1] as string);
            const st = r[2] as string | null;
            if (st) sessionStartTsMap.set(r[0] as string, st);
          }
          return [];
        });

        // Step 6: tc 行を走査し INNER JOIN + WHERE 適用 + (period, tool, source) 集計
        type Agg = {
          count: number;
          tokens: number;
          duration: number;
          tokenTotalTurns: number;
          tokenMissingTurns: number;
        };
        const aggMap = new Map<string, Agg>();
        for (const row of tcRows) {
          const sessionIdTc = row[0] as string;
          const messageUuid = row[1] as string;
          const turnIndex = row[2];
          const toolName = row[3] as string;
          const turnExecMs = Number(row[4] ?? 0);

          const m = msgInfoMap.get(messageUuid);
          if (!m) continue; // INNER JOIN messages
          const source = sessionSourceMap.get(m.sessionId);
          if (source === undefined) continue; // INNER JOIN sessions

          // session start_time 基準でフィルタ・期間キー算出（フォールバック: message timestamp）
          const sessionTs = sessionStartTsMap.get(m.sessionId) ?? m.timestamp;
          const sessionDate = this.computeDateInSqliteTz(sessionTs, tzOffset);
          if (sessionDate < cutoffDate) continue;

          const periodKey = period === 'day'
            ? sessionDate
            : this.computeWeekInSqliteTz(sessionTs, tzOffset);
          const tool = this.applyToolMcpAlias(toolName);

          const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
          const turnKey = `${sessionIdTc}${TURN_KEY_SEP}${turnIndex}`;
          const tInTurn = toolsInTurn.get(turnKey) ?? 1;

          const msgTokensTotal = m.inputTokens + m.outputTokens;
          const tokensContrib = Math.round(msgTokensTotal / tInMsg);
          const durationContrib = Math.round(turnExecMs / tInTurn);

          const isAssistant = m.type === 'assistant';
          const allZero = m.inputTokens + m.outputTokens
            + m.cacheReadTokens + m.cacheCreationTokens === 0;
          const totalTurnContrib = isAssistant ? 1 : 0;
          const missingTurnContrib = isAssistant && allZero ? 1 : 0;

          const aggKey = `${periodKey}${TURN_KEY_SEP}${tool}${TURN_KEY_SEP}${source}`;
          const cur = aggMap.get(aggKey) ?? {
            count: 0, tokens: 0, duration: 0, tokenTotalTurns: 0, tokenMissingTurns: 0,
          };
          cur.count += 1;
          cur.tokens += tokensContrib;
          cur.duration += durationContrib;
          cur.tokenTotalTurns += totalTurnContrib;
          cur.tokenMissingTurns += missingTurnContrib;
          aggMap.set(aggKey, cur);
        }

        // Step 7: caller 互換のため Record<string, unknown>[] として返却
        return [...aggMap.entries()].map(([key, agg]) => {
          const parts = key.split(TURN_KEY_SEP);
          return {
            period: parts[0],
            tool: parts[1],
            source: parts[2],
            count: agg.count,
            tokens: agg.tokens,
            duration_ms: agg.duration,
            token_total_turns: agg.tokenTotalTurns,
            token_missing_turns: agg.tokenMissingTurns,
          };
        });
      },
      (rows) => rows.length,
    );
  }

  /** 利用可能な世代バックアップを新しい順で返す。FileTrailStorage 以外では空配列。 */
  listBackups(): readonly import('./ITrailStorage').BackupEntry[] {
    if (this.storage instanceof FileTrailStorage) {
      return this.storage.listBackups();
    }
    return [];
  }

  /**
   * 指定世代のバックアップから DB を復元する。復元後にメモリ内の DB は
   * 古いままなので、呼び出し元は拡張機能を再起動する必要がある。
   * FileTrailStorage 以外が注入されている場合は例外を投げる。
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    if (!(this.storage instanceof FileTrailStorage)) {
      throw new Error('restoreFromBackup is only supported with FileTrailStorage');
    }
    this.close();
    return this.storage.restoreFromBackup(generation);
  }

  async init(): Promise<void> {
    // Load sql-wasm.js from dist/ directory using __non_webpack_require__
    // to bypass webpack bundling (bundling breaks sql.js module system).
    // sql-wasm は asm.js (16MB ヒープ) より大きい WebAssembly ヒープ (最大 2GB)
    // を使えるため、大規模リポジトリの code graph 保存時の OOM を回避できる。
    // sql-wasm.wasm は sql-wasm.js と同じディレクトリに配置される必要があり、
    // initSqlJs に locateFile callback で distPath を伝える。
    const sqlWasmPath = path.join(this.distPath, 'sql-wasm.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const initSqlJs = __non_webpack_require__(sqlWasmPath) as typeof import('sql.js').default;
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(this.distPath, file),
    });
    console.log('[TrailDatabase] sql.js initialized, storage =', this.storage.identifier);

    const initial = this.storage.readInitialBytes();
    this.db = initial ? new SQL.Database(initial) : new SQL.Database();

    this.createTables();
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('TrailDatabase not initialized. Call init() first.');
    }
    return this.db;
  }

  private createTables(): void {
    const db = this.ensureDb();
    db.run('PRAGMA foreign_keys = ON');
    db.run(CREATE_SESSIONS);
    db.run(CREATE_SESSION_COSTS);
    db.run(CREATE_DAILY_COUNTS);
    db.run(CREATE_MESSAGES);
    db.run(CREATE_SESSION_COMMITS);
    db.run(CREATE_RELEASES);
    db.run(CREATE_RELEASE_FILES);
    db.run(CREATE_RELEASE_COVERAGE);
    db.run(CREATE_CURRENT_COVERAGE);
    for (const idx of CREATE_CURRENT_COVERAGE_INDEXES) {
      db.run(idx);
    }
    // 既存 DB に残った未使用テーブルを除去（行 0 件のため安全）
    for (const orphan of ['c4_models', 'release_features']) {
      try {
        db.run(`DROP TABLE IF EXISTS ${orphan}`);
      } catch (e) {
        this.logger.warn(`failed to drop ${orphan}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.migrateCurrentGraphsSchema(db);
    db.run(CREATE_CURRENT_GRAPHS);
    db.run(CREATE_RELEASE_GRAPHS);
    this.migrateTrailGraphsTable(db);
    db.run(CREATE_CURRENT_CODE_GRAPHS);
    db.run(CREATE_RELEASE_CODE_GRAPHS);
    db.run(CREATE_CURRENT_CODE_GRAPH_COMMUNITIES);
    db.run(CREATE_RELEASE_CODE_GRAPH_COMMUNITIES);
    this.migrateFileAnalysisSchema(db);
    db.run(CREATE_CURRENT_FILE_ANALYSIS);
    db.run(CREATE_RELEASE_FILE_ANALYSIS);
    db.run(CREATE_CURRENT_FUNCTION_ANALYSIS);
    db.run(CREATE_RELEASE_FUNCTION_ANALYSIS);
    for (const idx of CREATE_FILE_ANALYSIS_INDEXES) {
      db.run(idx);
    }
    db.run(CREATE_SKILL_MODELS_TABLE);
    db.run(CREATE_SKILL_MODELS_RESOLVED_VIEW);
    db.run(CREATE_MESSAGE_COMMITS);
    db.run(CREATE_COMMIT_FILES);
    db.run(CREATE_SESSION_COMMIT_RESOLUTIONS);
    // session_commits / commit_files への repo_name 追加はインデックス作成より前に行う
    // （idx_session_commits_repo / idx_commit_files_repo が repo_name を参照するため）
    for (const sql of [
      "ALTER TABLE session_commits ADD COLUMN repo_name TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE commit_files ADD COLUMN repo_name TEXT NOT NULL DEFAULT ''",
    ]) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }
    db.run('CREATE INDEX IF NOT EXISTS idx_commit_files_hash ON commit_files(commit_hash)');
    for (const sql of [...CREATE_INDEXES, ...CREATE_RELEASE_INDEXES]) {
      db.run(sql);
    }
    db.run(CREATE_MESSAGE_TOOL_CALLS);
    for (const sql of CREATE_MESSAGE_TOOL_CALLS_INDEXES) {
      db.run(sql);
    }
    // Hotspot / activity map 集計用 (trail-time-axis-requirements 3.2)
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_subagent_type ON messages(subagent_type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_message_tool_calls_tool_name_file_path ON message_tool_calls(tool_name, file_path)');
    db.run(CREATE_C4_MANUAL_ELEMENTS);
    db.run(CREATE_C4_MANUAL_RELATIONSHIPS);
    db.run(CREATE_C4_MANUAL_GROUPS);
    // 既存 DB 向け: UNIQUE 制約をインデックスとして追加（新規 DB は CREATE TABLE の UNIQUE 制約で対応済み）
    try {
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_message_tool_calls_message_uuid_call_index ON message_tool_calls(message_uuid, call_index)');
    } catch {
      // Already exists — ignore
    }

    this.migrateMessageCommitsSchema(db);

    // Add columns for existing DBs (may already exist)
    const sessionAlters = [
      'ALTER TABLE sessions ADD COLUMN commits_resolved_at TEXT',
      'ALTER TABLE sessions ADD COLUMN peak_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN initial_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN git_branch TEXT',
      'ALTER TABLE sessions ADD COLUMN interruption_reason TEXT',
      'ALTER TABLE sessions ADD COLUMN interruption_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN compact_count INTEGER',
      'ALTER TABLE sessions ADD COLUMN message_commits_resolved_at TEXT',
      "ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'claude_code'",
      'ALTER TABLE sessions ADD COLUMN sub_agent_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE sessions ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE sessions ADD COLUMN assistant_message_count INTEGER NOT NULL DEFAULT 0',
    ];
    for (const sql of sessionAlters) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }
    try { db.run('ALTER TABLE releases ADD COLUMN total_lines INTEGER NOT NULL DEFAULT 0'); } catch { /* Column already exists */ }
    this.migrateDropSessionsProjectColumn(db);
    const messageAlters = [
      'ALTER TABLE messages ADD COLUMN rule_recommended_model TEXT',
      'ALTER TABLE messages ADD COLUMN feature_recommended_model TEXT',
      'ALTER TABLE messages ADD COLUMN cost_category TEXT',
      'ALTER TABLE messages ADD COLUMN duration_ms INTEGER',
      'ALTER TABLE messages ADD COLUMN tool_result_size INTEGER',
      'ALTER TABLE messages ADD COLUMN agent_description TEXT',
      'ALTER TABLE messages ADD COLUMN agent_model TEXT',
      'ALTER TABLE messages ADD COLUMN permission_mode TEXT',
      'ALTER TABLE messages ADD COLUMN skill TEXT',
      'ALTER TABLE messages ADD COLUMN agent_id TEXT',
      'ALTER TABLE messages ADD COLUMN source_tool_assistant_uuid TEXT',
      'ALTER TABLE messages ADD COLUMN source_tool_use_id TEXT',
      'ALTER TABLE messages ADD COLUMN system_command TEXT',
      'ALTER TABLE messages ADD COLUMN subagent_type TEXT',
    ];
    for (const sql of messageAlters) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }

    // AST メトリクス列追加（既存 DB 向け）
    const astMetricsAlters = [
      'ALTER TABLE current_file_analysis ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN cyclomatic_complexity_max INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN cyclomatic_complexity_max INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_function_analysis ADD COLUMN cyclomatic_complexity INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_function_analysis ADD COLUMN cyclomatic_complexity INTEGER NOT NULL DEFAULT 0',
    ];
    for (const sql of astMetricsAlters) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }

    // service_type カラム追加（既存 DB 向け）
    try {
      db.run('ALTER TABLE c4_manual_elements ADD COLUMN service_type TEXT');
    } catch { /* Column already exists */ }

    // Seed skill_models with defaults if empty
    const smCount = db.exec('SELECT COUNT(*) FROM skill_models');
    if (Number(smCount[0]?.values[0]?.[0]) === 0) {
      const smStmt = db.prepare('INSERT OR IGNORE INTO skill_models (skill, canonical_skill, recommended_model) VALUES (?, ?, ?)');
      for (const [skill, canonical, model] of DEFAULT_SKILL_MODELS) {
        smStmt.run([skill, canonical, model]);
      }
      smStmt.free();
    }

    this.migrateTimestampsToUTC(db);
    this.migrateToolUseResult(db);
    this.migrateMessageCommitsToUserUuid(db);
    // Phase D-2: subagent_type を既存データに後付けで埋める（_migrations で冪等性確保）。
    // importAll() を待たず init 段階で実行するため、ユーザーが同期未実行でも有効。
    try {
      this.backfillSubagentType();
    } catch (e) {
      this.logger.warn(`backfillSubagentType (init) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      this.backfillSourceToolLinkFields();
    } catch (e) {
      this.logger.warn(`backfillSourceToolLinkFields (init) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      this.backfillRepoName_v1();
    } catch (e) {
      this.logger.warn(`backfillRepoName_v1 (init) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      this.backfillDerivedCounts_v1();
    } catch (e) {
      this.logger.warn(`backfillDerivedCounts_v1 (init) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
    // ALTER TABLE / backfill 等のスキーマ変更をディスクに永続化する。
    // save() を呼ばないと _migrations フラグが保存されず、次回起動で再実行される。
    this.save();
  }

  /**
   * 既存 row の session_commits.repo_name / commit_files.repo_name を sessions.repo_name から
   * バックフィルする。`_migrations` テーブルで一度だけ走らせる冪等運用。
   */
  private backfillRepoName_v1(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'repo_name_backfill_v1'");
    if (done[0]?.values?.length) return;

    // session_commits: 既存 row の repo_name='' を sessions.repo_name から埋める
    db.run(
      `UPDATE session_commits
         SET repo_name = (
           SELECT s.repo_name FROM sessions s WHERE s.id = session_commits.session_id
         )
         WHERE repo_name = ''
           AND EXISTS (
             SELECT 1 FROM sessions s
             WHERE s.id = session_commits.session_id AND s.repo_name != ''
           )`,
    );
    const updatedCommits = db.exec(
      "SELECT COUNT(*) FROM session_commits WHERE repo_name != ''",
    )[0]?.values[0]?.[0] ?? 0;

    // commit_files: session_commits 経由で repo_name を逆引き
    db.run(
      `UPDATE commit_files
         SET repo_name = (
           SELECT sc.repo_name FROM session_commits sc
           WHERE sc.commit_hash = commit_files.commit_hash
             AND sc.repo_name != ''
           LIMIT 1
         )
         WHERE repo_name = ''
           AND EXISTS (
             SELECT 1 FROM session_commits sc
             WHERE sc.commit_hash = commit_files.commit_hash AND sc.repo_name != ''
           )`,
    );
    const updatedFiles = db.exec(
      "SELECT COUNT(*) FROM commit_files WHERE repo_name != ''",
    )[0]?.values[0]?.[0] ?? 0;

    this.logger.info(
      `[Migration] repo_name_backfill_v1: session_commits non-empty=${String(updatedCommits)}, commit_files non-empty=${String(updatedFiles)}`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('repo_name_backfill_v1')");
  }

  private backfillDerivedCounts_v1(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'derived_counts_backfill_v1'");
    if (done[0]?.values?.length) return;

    const startedAt = Date.now();
    db.run(
      `UPDATE sessions SET
         sub_agent_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND tool_name = 'Agent'
         ), 0),
         error_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND is_error = 1
         ), 0),
         assistant_message_count = COALESCE((
           SELECT COUNT(*) FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ), 0)`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('derived_counts_backfill_v1')");
    this.logger.info(`[Migration] derived_counts_backfill_v1: done (${Date.now() - startedAt}ms)`);
  }

  private backfillSourceToolLinkFields(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'source_tool_link_backfill_v1'");
    if (done[0]?.values?.length) return;

    const rows = db.exec(
      `SELECT s.id, s.file_path
       FROM sessions s
       WHERE s.source = 'claude_code'
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.session_id = s.id
             AND (m.source_tool_assistant_uuid IS NULL OR m.source_tool_assistant_uuid = '')
         )`,
    )[0]?.values ?? [];

    const updateStmt = db.prepare(
      'UPDATE messages SET source_tool_assistant_uuid = ?, source_tool_use_id = ? WHERE session_id = ? AND uuid = ?',
    );
    let updated = 0;
    for (const row of rows) {
      const sid = String(row[0] ?? '');
      const filePath = String(row[1] ?? '');
      if (!sid || !filePath) continue;
      if (!fs.existsSync(filePath)) continue;
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let raw: RawLine;
        try {
          raw = JSON.parse(trimmed) as RawLine;
        } catch {
          continue;
        }
        if (!raw.uuid) continue;
        const srcAssistant = raw.sourceToolAssistantUUID ?? null;
        const srcToolUseId = raw.sourceToolUseID ?? null;
        if (!srcAssistant && !srcToolUseId) continue;
        updateStmt.run([srcAssistant, srcToolUseId, sid, raw.uuid]);
        updated++;
      }
    }
    updateStmt.free();
    this.logger.info(`[Migration] source_tool_link_backfill_v1: updated=${updated}`);
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('source_tool_link_backfill_v1')");
  }

  private migrateDropSessionsProjectColumn(db: Database): void {
    let foreignKeysWereEnabled = true;
    try {
      const colInfo = db.exec(`PRAGMA table_info(sessions)`);
      const cols = (colInfo[0]?.values ?? []).map((r) => String(r[1]));
      if (!cols.includes('project')) return;
      const fkInfo = db.exec('PRAGMA foreign_keys');
      foreignKeysWereEnabled = Number(fkInfo[0]?.values?.[0]?.[0] ?? 1) === 1;
      db.run('PRAGMA foreign_keys = OFF');
      db.run('BEGIN TRANSACTION');
      db.run(`CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL DEFAULT '',
        repo_name TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        entrypoint TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT '',
        commits_resolved_at TEXT,
        peak_context_tokens INTEGER,
        initial_context_tokens INTEGER,
        git_branch TEXT,
        interruption_reason TEXT,
        interruption_context_tokens INTEGER,
        message_commits_resolved_at TEXT,
        source TEXT NOT NULL DEFAULT 'claude_code',
        compact_count INTEGER
      )`);
      db.run(`INSERT INTO sessions_new (
        id, slug, repo_name, version, entrypoint, model,
        start_time, end_time, message_count, file_path, file_size, imported_at,
        commits_resolved_at, peak_context_tokens, initial_context_tokens, git_branch,
        interruption_reason, interruption_context_tokens, message_commits_resolved_at,
        source, compact_count
      )
      SELECT
        id, slug, repo_name, version, entrypoint, model,
        start_time, end_time, message_count, file_path, file_size, imported_at,
        commits_resolved_at, peak_context_tokens, initial_context_tokens, git_branch,
        interruption_reason, interruption_context_tokens, message_commits_resolved_at,
        source, compact_count
      FROM sessions`);
      db.run('DROP TABLE sessions');
      db.run('ALTER TABLE sessions_new RENAME TO sessions');
      db.run('COMMIT');
      if (foreignKeysWereEnabled) db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch { /* ignore */ }
      if (foreignKeysWereEnabled) {
        try { db.run('PRAGMA foreign_keys = ON'); } catch (re) { this.logger.error('restore foreign_keys failed', re); }
      }
      this.logger.error('migrateDropSessionsProjectColumn failed', e);
    }
  }

  /**
   * 既存 session_commits の各コミットに対して変更ファイルを commit_files にバックフィルする。
   * ai-first-try-success-rate 指標がファイル overlap で failure 判定するために必要。
   * importAll の先頭で gitRoot が確定している状態で呼ぶ。
   */
  private backfillCommitFiles(gitRoot: string, onProgress?: (msg: string) => void): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'commit_files_backfill_v2'");
    if (done[0]?.values?.length) return;

    const commitRes = db.exec(
      'SELECT DISTINCT commit_hash FROM session_commits WHERE NOT EXISTS (SELECT 1 FROM commit_files cf WHERE cf.commit_hash = session_commits.commit_hash)',
    );
    const hashes = commitRes[0]?.values.map((row) => row[0] as string) ?? [];
    if (hashes.length === 0) {
      db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('commit_files_backfill_v2')");
      return;
    }

    onProgress?.(`Backfilling commit files for ${hashes.length} commits...`);
    this.logger.info(`[Migration] commit_files_backfill_v2: backfilling file lists for ${hashes.length} commits`);

    const insertStmt = db.prepare('INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)');
    try {
      let processed = 0;
      let skipped = 0;
      for (const hash of hashes) {
        try {
          const out = execFileSync('git', [
            'show', '--format=', '--numstat', hash,
          ], { encoding: 'utf-8', timeout: 5_000, cwd: gitRoot });
          for (const line of out.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split('\t');
            const filePath = parts[2];
            if (filePath) insertStmt.run([hash, filePath]);
          }
          processed++;
        } catch {
          // Commit may have been garbage-collected or outside this repo — skip.
          skipped++;
        }
        if (processed % 50 === 0) {
          onProgress?.(`Backfilling commit files: ${processed}/${hashes.length}`);
        }
      }
      this.logger.info(`[Migration] commit_files_backfill_v2: processed=${processed}, skipped=${skipped}`);
    } finally {
      insertStmt.free();
    }

    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('commit_files_backfill_v2')");
  }

  /**
   * 旧 matchCommitsToMessages は assistant メッセージ UUID を message_commits.message_uuid に
   * 保存していたため、Lead Time / Commit Success Rate の計算（user UUID と突合）が常に空になる
   * 不具合があった。既存データを破棄し、次回同期で user UUID ベースで再構築する。
   */
  private migrateMessageCommitsToUserUuid(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'message_commits_to_user_uuid'");
    if (done[0]?.values?.length) return;

    this.logger.info(
      '[Migration] message_commits_to_user_uuid: clearing message_commits and resetting resolved timestamps for rebuild',
    );
    db.run('DELETE FROM message_commits');
    db.run('UPDATE sessions SET message_commits_resolved_at = NULL');
    db.run("INSERT INTO _migrations (key) VALUES ('message_commits_to_user_uuid')");
  }

  private migrateMessageCommitsSchema(db: Database): void {
    db.run('CREATE INDEX IF NOT EXISTS idx_message_commits_session ON message_commits(session_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON message_commits(commit_hash)');
  }

  /**
   * 既存 messages に対して subagent_type を後付けで埋める。一度だけ実行（_migrations で冪等性確保）。
   *   1) 各 project 配下の `subagents/agent-{id}.meta.json` を走査し、agent_id → agentType マッピングを作る
   *   2) tool_calls JSON に Agent tool_use を持つ親メッセージから input.subagent_type を抽出
   * 既に値がある行は触らない（`WHERE subagent_type IS NULL`）。
   * @internal テスト用に projectsDir を差し替え可能。本番は `~/.claude/projects` を使用。
   */
  private backfillSubagentType(projectsDir?: string): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'subagent_type_backfill_v1'");
    if (done[0]?.values?.length) return;

    const startedAt = Date.now();
    this.logger.info('[Migration] subagent_type_backfill_v1: starting...');

    // 性能上の必須: messages.agent_id にインデックスがないと UPDATE WHERE agent_id=? が
    // 毎回フルスキャン。1000+ meta.json × 数十万 messages で数億行スキャンになり数十分ハングする。
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id)');

    const baseDir = projectsDir ?? path.join(os.homedir(), '.claude', 'projects');

    // Step 1: meta.json を集約してメモリ上で agent_id → agentType マップを作る（fs IO のみ、SQL なし）
    const agentTypeByAgentId = new Map<string, string>();
    let projectNames: string[];
    try {
      projectNames = fs.readdirSync(baseDir);
    } catch (e) {
      this.logger.warn(`[Migration] subagent_type_backfill_v1: cannot read projects dir ${baseDir}: ${e instanceof Error ? e.message : String(e)}`);
      projectNames = [];
    }
    for (const projectName of projectNames) {
      const projectPath = path.join(baseDir, projectName);
      let sessionEntries: string[];
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
        sessionEntries = fs.readdirSync(projectPath);
      } catch { continue; }
      for (const sessionEntry of sessionEntries) {
        const subagentDir = path.join(projectPath, sessionEntry, 'subagents');
        let metaFiles: string[];
        try {
          metaFiles = fs.readdirSync(subagentDir).filter((f) => f.endsWith('.meta.json'));
        } catch { continue; }
        for (const metaFile of metaFiles) {
          const match = /^agent-(.+)\.meta\.json$/.exec(metaFile);
          if (!match) continue;
          const agentId = match[1];
          try {
            const raw = fs.readFileSync(path.join(subagentDir, metaFile), 'utf-8');
            const meta = JSON.parse(raw) as { agentType?: unknown };
            const agentType = typeof meta.agentType === 'string' && meta.agentType.length > 0 ? meta.agentType : null;
            if (agentType) agentTypeByAgentId.set(agentId, agentType);
          } catch (e) {
            this.logger.warn(`[Migration] subagent_type_backfill_v1: skip ${metaFile}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
    this.logger.info(`[Migration] subagent_type_backfill_v1: collected ${agentTypeByAgentId.size} agent_id mappings (${Date.now() - startedAt}ms)`);

    // Step 2: 単一トランザクションで一括 UPDATE。インデックスありで O(log N)/UPDATE。
    let metaUpdated = 0;
    const phase2Start = Date.now();
    db.run('BEGIN TRANSACTION');
    try {
      const updateByAgentId = db.prepare(
        'UPDATE messages SET subagent_type = ? WHERE agent_id = ? AND subagent_type IS NULL',
      );
      try {
        let processed = 0;
        for (const [agentId, agentType] of agentTypeByAgentId) {
          updateByAgentId.run([agentType, agentId]);
          metaUpdated++;
          processed++;
          if (processed % 500 === 0) {
            this.logger.info(`[Migration] subagent_type_backfill_v1: agent_id UPDATEs ${processed}/${agentTypeByAgentId.size} (${Date.now() - phase2Start}ms)`);
          }
        }
      } finally {
        updateByAgentId.free();
      }
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (re) { this.logger.error('[Migration] subagent_type_backfill_v1: ROLLBACK failed', re); }
      throw e;
    }
    this.logger.info(`[Migration] subagent_type_backfill_v1: meta UPDATE done meta=${metaUpdated} (${Date.now() - phase2Start}ms)`);

    // Step 3: 親メッセージ側 (Agent tool_use を持つ assistant)。tool_calls JSON は大きいので
    // 先に uuid リストだけ取り出し、次に PK 経由で 1 行ずつ SELECT して逐次処理する。
    const phase3Start = Date.now();
    const uuidRes = db.exec(
      "SELECT uuid FROM messages WHERE subagent_type IS NULL AND tool_calls LIKE '%\"name\":\"Agent\"%'",
    );
    const candidateUuids = (uuidRes[0]?.values ?? []).map((r) => String(r[0] ?? '')).filter(Boolean);
    this.logger.info(`[Migration] subagent_type_backfill_v1: ${candidateUuids.length} parent message candidates (${Date.now() - phase3Start}ms)`);

    let parentUpdated = 0;
    if (candidateUuids.length > 0) {
      db.run('BEGIN TRANSACTION');
      try {
        const selectStmt = db.prepare('SELECT tool_calls FROM messages WHERE uuid = ?');
        const updateParent = db.prepare('UPDATE messages SET subagent_type = ? WHERE uuid = ?');
        try {
          for (let i = 0; i < candidateUuids.length; i++) {
            const uuid = candidateUuids[i];
            selectStmt.bind([uuid]);
            try {
              if (selectStmt.step()) {
                const row = selectStmt.get();
                const toolCalls = row[0] as string | null;
                if (toolCalls) {
                  const info = extractAgentInfo(toolCalls);
                  if (info.subagentType) {
                    updateParent.run([info.subagentType, uuid]);
                    parentUpdated++;
                  }
                }
              }
            } finally {
              selectStmt.reset();
            }
            if ((i + 1) % 500 === 0) {
              this.logger.info(`[Migration] subagent_type_backfill_v1: parent ${i + 1}/${candidateUuids.length} processed`);
            }
          }
        } finally {
          selectStmt.free();
          updateParent.free();
        }
        db.run('COMMIT');
      } catch (e) {
        try { db.run('ROLLBACK'); } catch (re) { this.logger.error('[Migration] subagent_type_backfill_v1: ROLLBACK failed', re); }
        throw e;
      }
    }

    this.logger.info(
      `[Migration] subagent_type_backfill_v1: COMPLETED meta=${metaUpdated} parent=${parentUpdated} totalMs=${Date.now() - startedAt}`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('subagent_type_backfill_v1')");
  }

  /**
   * tool_use_result の保存形式修正に伴い、既存データを再インポートする。
   * message_tool_calls を全削除し、sessions の file_size を 0 にリセットして
   * 次回 importAll で全セッションが再インポート＋再解析されるようにする。
   */
  private migrateToolUseResult(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'tool_use_result_fix'");
    if (done[0]?.values?.length) return;

    this.logger.info('[Migration] tool_use_result_fix: clearing message_tool_calls and resetting file sizes for full re-import');
    db.run('DELETE FROM message_tool_calls');
    db.run('UPDATE sessions SET file_size = 0');
    db.run("INSERT INTO _migrations (key) VALUES ('tool_use_result_fix')");
  }

  /**
   * 既存データの日時カラムをUTC ISO 8601に一括変換する。
   * 一度実行済みなら _migrations テーブルのフラグで二重実行を防止する。
   */
  private migrateTimestampsToUTC(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');

    const done = db.exec(
      "SELECT 1 FROM _migrations WHERE key = 'timestamps_to_utc'",
    );
    if (done[0]?.values?.length) return;

    db.run('BEGIN TRANSACTION');
    try {
      // sessions: start_time, end_time, imported_at, commits_resolved_at
      const sessions = db.exec(
        'SELECT id, start_time, end_time, imported_at, commits_resolved_at FROM sessions',
      );
      if (sessions[0]?.values) {
        const stmt = db.prepare(
          'UPDATE sessions SET start_time = ?, end_time = ?, imported_at = ?, commits_resolved_at = ? WHERE id = ?',
        );
        for (const row of sessions[0].values) {
          stmt.run([
            toUTC(String(row[1] ?? '')),
            toUTC(String(row[2] ?? '')),
            toUTC(String(row[3] ?? '')),
            row[4] ? toUTC(String(row[4])) : null,
            String(row[0]),
          ]);
        }
        stmt.free();
      }

      // messages: timestamp
      const messages = db.exec('SELECT uuid, timestamp FROM messages');
      if (messages[0]?.values) {
        const stmt = db.prepare(
          'UPDATE messages SET timestamp = ? WHERE uuid = ?',
        );
        for (const row of messages[0].values) {
          stmt.run([toUTC(String(row[1] ?? '')), String(row[0])]);
        }
        stmt.free();
      }

      // session_commits: committed_at
      const commits = db.exec(
        'SELECT session_id, commit_hash, committed_at FROM session_commits',
      );
      if (commits[0]?.values) {
        const stmt = db.prepare(
          'UPDATE session_commits SET committed_at = ? WHERE session_id = ? AND commit_hash = ?',
        );
        for (const row of commits[0].values) {
          stmt.run([
            toUTC(String(row[2] ?? '')),
            String(row[0]),
            String(row[1]),
          ]);
        }
        stmt.free();
      }

      db.run("INSERT INTO _migrations (key) VALUES ('timestamps_to_utc')");
      db.run('COMMIT');
    } catch (e) {
      console.error('[TrailDatabase] migrateTimestampsToUTC failed:', e);
      db.run('ROLLBACK');
    }
  }

  /**
   * 旧 trail_graphs テーブルのデータを current_graphs / release_graphs に移行して破棄する。
   * - id='current' 行 → current_graphs（commit_id は空文字で初期化）
   * - それ以外で releases.tag に存在するもの → release_graphs
   * - releases に存在しない孤児タグはログ警告のみで破棄
   */
  private migrateTrailGraphsTable(db: Database): void {
    const exists = db.exec(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='trail_graphs'",
    );
    if (!exists[0]?.values?.length) return;

    try {
      // 旧 id='current' 行は repo_name を特定できないため current_graphs には移行せず破棄する。
      // ワークスペースで次回 C4 解析を実行した時点で新規登録される。
      const droppedCurrentRes = db.exec(
        "SELECT COUNT(*) FROM trail_graphs WHERE id = 'current'",
      );
      const droppedCurrent = Number(droppedCurrentRes[0]?.values?.[0]?.[0] ?? 0);

      const releaseTagsRes = db.exec('SELECT tag FROM releases');
      const knownTags = new Set<string>(
        releaseTagsRes[0]?.values?.map((r) => String(r[0])) ?? [],
      );

      const othersRes = db.exec(
        "SELECT id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at FROM trail_graphs WHERE id <> 'current'",
      );
      const orphans: string[] = [];
      for (const row of othersRes[0]?.values ?? []) {
        const tag = String(row[0]);
        if (!knownTags.has(tag)) {
          orphans.push(tag);
          continue;
        }
        db.run(
          `INSERT OR REPLACE INTO release_graphs
             (tag, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            tag,
            String(row[1] ?? ''),
            String(row[2] ?? ''),
            String(row[3] ?? ''),
            String(row[4] ?? ''),
            String(row[5] ?? ''),
          ],
        );
      }

      if (orphans.length > 0) {
        this.logger.warn(
          `migrateTrailGraphsTable: dropped ${orphans.length} orphan tag(s) not present in releases: ${orphans.join(', ')}`,
        );
      }

      db.run('DROP TABLE trail_graphs');
      this.logger.info(
        `migrateTrailGraphsTable: migrated trail_graphs → release_graphs (releases=${(othersRes[0]?.values?.length ?? 0) - orphans.length}, dropped_current=${droppedCurrent})`,
      );
      // sql.js はインメモリなので、マイグレーション結果をディスクに即時永続化する
      this.save();
    } catch (e) {
      this.logger.error('migrateTrailGraphsTable failed', e);
    }
  }

  /**
   * current_graphs のスキーマが旧版（id 列 PK）だった場合、テーブルを破棄して新版で作り直す。
   * データは空のため内容移行は行わない（ユーザー指示で事前クリア済み）。
   */
  /** file_analysis テーブルが旧スキーマ（repo_name なし）で存在する場合に DROP して再作成を促す。 */
  private migrateFileAnalysisSchema(db: Database): void {
    const tables = [
      'current_file_analysis',
      'release_file_analysis',
      'current_function_analysis',
      'release_function_analysis',
    ];
    for (const table of tables) {
      const exists = db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`);
      if (!exists[0]?.values?.length) continue;
      const info = db.exec(`PRAGMA table_info(${table})`);
      const columns = info[0]?.values?.map((r) => String(r[1])) ?? [];
      if (columns.includes('repo_name')) continue;
      try {
        db.run(`DROP TABLE ${table}`);
        this.logger.info(`migrateFileAnalysisSchema: dropped legacy ${table} (no repo_name) for recreation`);
        this.save();
      } catch (e) {
        this.logger.error(`migrateFileAnalysisSchema: failed to drop ${table}`, e);
      }
    }
  }

  private migrateCurrentGraphsSchema(db: Database): void {
    const exists = db.exec(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='current_graphs'",
    );
    if (!exists[0]?.values?.length) return;

    const info = db.exec('PRAGMA table_info(current_graphs)');
    const columns = info[0]?.values?.map((r) => String(r[1])) ?? [];
    if (columns.includes('repo_name')) return;

    try {
      db.run('DROP TABLE current_graphs');
      this.logger.info('migrateCurrentGraphsSchema: dropped legacy current_graphs (id PK) for recreation with repo_name PK');
      this.save();
    } catch (e) {
      this.logger.error('migrateCurrentGraphsSchema failed', e);
    }
  }

  /**
   * SQLite の DATE() に渡すローカル TZ オフセット文字列を返す。
   * WSL 上の Node プロセスが UTC で動作し、ユーザーの期待する JST と一致しない
   * 問題を避けるため、IANA タイムゾーンベースで計算する（dateUtils に委譲）。
   */
  private getLocalTzOffset(): string {
    return getSqliteTzOffset();
  }

  /** 全セッションの全アシスタントメッセージ（tool_calls あり）を取得する */
  getAllAssistantMessages(): Pick<MessageRow, 'tool_calls' | 'output_tokens'>[] {
    try {
      const db = this.ensureDb();
      const result = db.exec(
        `SELECT tool_calls, output_tokens FROM messages WHERE type = 'assistant' AND tool_calls IS NOT NULL`,
      );
      if (!result[0]) return [];
      return result[0].values.map(row => ({
        tool_calls: row[0] != null ? String(row[0]) : null,
        output_tokens: Number(row[1]),
      }));
    } catch (err) {
      this.logger.warn(`getAllAssistantMessages failed: ${(err as Error).message}`);
      return [];
    }
  }

  getSessionCosts(sessionId: string): readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd
       FROM session_costs WHERE session_id = ?`,
      [sessionId],
    );
    if (!result[0]) return [];
    return result[0].values.map((r) => ({
      model: r[0] as string,
      input_tokens: r[1] as number,
      output_tokens: r[2] as number,
      cache_read_tokens: r[3] as number,
      cache_creation_tokens: r[4] as number,
      estimated_cost_usd: r[5] as number,
    }));
  }

  getAllSessionCosts(): readonly {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd
       FROM session_costs`,
    );
    if (!result[0]) return [];
    return result[0].values.map((r) => ({
      session_id: r[0] as string,
      model: r[1] as string,
      input_tokens: r[2] as number,
      output_tokens: r[3] as number,
      cache_read_tokens: r[4] as number,
      cache_creation_tokens: r[5] as number,
      estimated_cost_usd: r[6] as number,
    }));
  }

  getAllDailyCounts(): readonly {
    date: string;
    kind: string;
    key: string;
    count: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    duration_ms: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec('SELECT * FROM daily_counts ORDER BY date, kind, key');
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row =>
      Object.fromEntries(columns.map((c, i) => [c, row[i]]))
    ) as unknown as ReturnType<TrailDatabase['getAllDailyCounts']>;
  }

  getAllMessageToolCalls(cutoff?: string): readonly {
    id: number;
    session_id: string;
    message_uuid: string;
    turn_index: number;
    call_index: number;
    tool_name: string;
    file_path: string | null;
    command: string | null;
    skill_name: string | null;
    model: string | null;
    is_sidechain: number;
    turn_exec_ms: number | null;
    has_thinking: number;
    is_error: number;
    error_type: string | null;
    timestamp: string;
  }[] {
    const db = this.ensureDb();
    const result = cutoff
      ? db.exec('SELECT * FROM message_tool_calls WHERE timestamp >= ? ORDER BY id ASC', [cutoff])
      : db.exec('SELECT * FROM message_tool_calls ORDER BY id ASC');
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]]))) as unknown as ReturnType<TrailDatabase['getAllMessageToolCalls']>;
  }

  /** Delete and rebuild session_costs from all messages. */
  private rebuildSessionCosts(): void {
    const db = this.ensureDb();
    db.run('DELETE FROM session_costs');

    const result = db.exec(
      `SELECT m.session_id, COALESCE(m.model,''), s.source,
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY m.session_id, m.model, s.source`,
    );
    const stmt = db.prepare(INSERT_SESSION_COST);
    for (const row of result[0]?.values ?? []) {
      const sid = String(row[0]); const m = String(row[1]); const source = String(row[2]) as PricingSource;
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      const billingModel = resolvePricingModelName(m, source);
      stmt.run([sid, billingModel, inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc, source)]);
    }
    stmt.free();
  }

  /**
   * Populate per-session pre-aggregated stat columns (peak_context_tokens,
   * initial_context_tokens, git_branch, interruption_reason, interruption_context_tokens)
   * in a single pass. Avoids expensive per-read GROUP BY scans over messages.
   */
  private rebuildSessionStats(): void {
    const db = this.ensureDb();

    // Peak context + initial context (cache_creation_tokens of first assistant message)
    db.run(
      `UPDATE sessions SET
         peak_context_tokens = (
           SELECT MAX(COALESCE(m.input_tokens, 0) + COALESCE(m.cache_read_tokens, 0) + COALESCE(m.cache_creation_tokens, 0))
           FROM messages m WHERE m.session_id = sessions.id
         ),
         initial_context_tokens = (
           SELECT COALESCE(m.cache_creation_tokens, 0)
           FROM messages m
           WHERE m.session_id = sessions.id AND m.type = 'assistant'
           ORDER BY m.timestamp ASC LIMIT 1
         ),
         git_branch = (
           SELECT m.git_branch FROM messages m
           WHERE m.session_id = sessions.id AND m.git_branch IS NOT NULL AND m.git_branch != ''
           ORDER BY m.rowid ASC LIMIT 1
         )`,
    );

    // Interruption detection:
    //   1) last assistant has stop_reason='max_tokens' → max_tokens
    //   2) last non-meta message is 'user' (no assistant response follows) → no_response
    db.run(
      `UPDATE sessions SET
         interruption_reason = CASE
           WHEN (SELECT m.stop_reason FROM messages m
                 WHERE m.session_id = sessions.id AND m.type = 'assistant' AND m.is_meta = 0
                 ORDER BY m.timestamp DESC LIMIT 1) = 'max_tokens' THEN 'max_tokens'
           WHEN (SELECT m.type FROM messages m
                 WHERE m.session_id = sessions.id AND m.is_meta = 0 AND m.type IN ('user','assistant')
                 ORDER BY m.timestamp DESC LIMIT 1) = 'user' THEN 'no_response'
           ELSE NULL
         END,
         interruption_context_tokens = COALESCE(
           (SELECT COALESCE(m.input_tokens, 0) + COALESCE(m.cache_read_tokens, 0) + COALESCE(m.cache_creation_tokens, 0)
            FROM messages m
            WHERE m.session_id = sessions.id AND m.type = 'assistant' AND m.is_meta = 0
            ORDER BY m.timestamp DESC LIMIT 1),
           0
         )`,
    );

    // 自動 /compact 検出: 連続 assistant ターンで cacheRead が 50K 以上から 70% 以上減少した回数。
    // LAG ウィンドウ関数で前ターンの cache_read_tokens を取得して比較する。
    db.run(
      `UPDATE sessions SET compact_count = COALESCE((
         SELECT COUNT(*) FROM (
           SELECT cache_read_tokens,
                  LAG(cache_read_tokens) OVER (ORDER BY timestamp ASC) AS prev_cr
           FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ) WHERE prev_cr >= 50000 AND cache_read_tokens <= prev_cr * 0.3
       ), 0)`,
    );

    db.run(
      `UPDATE sessions SET
         sub_agent_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND tool_name = 'Agent'
         ), 0),
         error_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND is_error = 1
         ), 0),
         assistant_message_count = COALESCE((
           SELECT COUNT(*) FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ), 0)`,
    );
  }

  /**
   * Delete and rebuild daily_counts for all 6 kinds in a single pass.
   * kinds: cost_actual / cost_skill / tool / skill / error / model
   */
  private rebuildDailyCounts(): void {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();

    db.run('DELETE FROM daily_counts');

    const INSERT_DC = `INSERT INTO daily_counts
      (date, kind, key, count, tokens, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, duration_ms, estimated_cost_usd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(date, kind, key) DO UPDATE SET
        count = daily_counts.count + excluded.count,
        tokens = daily_counts.tokens + excluded.tokens,
        input_tokens = daily_counts.input_tokens + excluded.input_tokens,
        output_tokens = daily_counts.output_tokens + excluded.output_tokens,
        cache_read_tokens = daily_counts.cache_read_tokens + excluded.cache_read_tokens,
        cache_creation_tokens = daily_counts.cache_creation_tokens + excluded.cache_creation_tokens,
        duration_ms = daily_counts.duration_ms + excluded.duration_ms,
        estimated_cost_usd = daily_counts.estimated_cost_usd + excluded.estimated_cost_usd`;
    const stmt = db.prepare(INSERT_DC);

    // ── kind='cost_actual' : assistant メッセージ日次トークン・コスト（session start_time 基準）──
    const actual = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}'), COALESCE(m.model,''), s.source,
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY DATE(s.start_time, '${tzOffset}'), m.model, s.source`,
    );
    for (const row of actual[0]?.values ?? []) {
      const d = String(row[0]); const m = String(row[1]); const source = String(row[2]) as PricingSource;
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      const billingModel = resolvePricingModelName(m, source);
      stmt.run([d, 'cost_actual', billingModel, 0, 0, inp, outp, cr, cc, 0, estimateCost(m, inp, outp, cr, cc, source)]);
    }

    // Auto-register new skills that are not yet in skill_models
    db.run(
      `INSERT OR IGNORE INTO skill_models (skill, recommended_model)
       SELECT DISTINCT m.skill, 'sonnet'
       FROM messages m
       WHERE m.skill IS NOT NULL
         AND m.skill NOT IN (SELECT skill FROM skill_models)`,
    );

    // ── kind='cost_skill' : スキル推奨モデルでの仮想コスト（session start_time 基準）──
    const skill = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}'),
        COALESCE(sm.recommended_model, 'sonnet'),
        COUNT(*) AS msg_count,
        SUM(a.input_tokens), SUM(a.output_tokens),
        SUM(a.cache_read_tokens), SUM(a.cache_creation_tokens)
       FROM messages a
       JOIN sessions s ON s.id = a.session_id
       LEFT JOIN skill_models_resolved sm ON a.skill = sm.skill
       WHERE a.type = 'assistant'
       GROUP BY DATE(s.start_time, '${tzOffset}'),
         COALESCE(sm.recommended_model, 'sonnet')`,
    );
    for (const row of skill[0]?.values ?? []) {
      const d = String(row[0]); const m = String(row[1]);
      const cnt = Number(row[2]);
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      stmt.run([d, 'cost_skill', m, cnt, 0, inp, outp, cr, cc, 0, estimateCost(m, inp, outp, cr, cc)]);
    }

    // ── kind='tool' : メッセージトークン/ターン時間按分のツール別日次集計 ──
    for (const row of this.aggregateToolUsageByDateRange(tzOffset)) {
      stmt.run([row.date, 'tool', row.tool, row.count, row.tokens, 0, 0, 0, 0, row.durationMs, 0]);
    }

    // ── kind='skill' : スキル別日次集計（session start_time 基準）──
    const skillCounts = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS d, mtc.skill_name, COUNT(*) AS count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.skill_name IS NOT NULL
       GROUP BY d, mtc.skill_name`,
    );
    for (const row of skillCounts[0]?.values ?? []) {
      stmt.run([String(row[0]), 'skill', String(row[1] ?? ''), Number(row[2] ?? 0), 0, 0, 0, 0, 0, 0, 0]);
    }

    // ── kind='error' : ツール別エラー日次集計（session start_time 基準）──
    const errors = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS d,
              CASE
                WHEN mtc.tool_name LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
                THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                ELSE mtc.tool_name
              END AS tool,
              SUM(mtc.is_error) AS err_count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       GROUP BY d, tool
       HAVING err_count > 0`,
    );
    for (const row of errors[0]?.values ?? []) {
      stmt.run([String(row[0]), 'error', String(row[1] ?? ''), Number(row[2] ?? 0), 0, 0, 0, 0, 0, 0, 0]);
    }

    // ── kind='model' : assistant メッセージ数のモデル別日次集計（session start_time 基準）──
    const modelCounts = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS d,
              s.source,
              COALESCE(m.model, '') AS model,
              COUNT(*) AS count,
              CAST(SUM(COALESCE(m.input_tokens, 0) + COALESCE(m.output_tokens, 0)) AS INTEGER) AS tokens
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY d, s.source, COALESCE(m.model, '')`,
    );
    for (const row of modelCounts[0]?.values ?? []) {
      const source = String(row[1]) as PricingSource;
      const model = resolvePricingModelName(String(row[2] ?? ''), source);
      stmt.run([String(row[0]), 'model', model, Number(row[3] ?? 0), Number(row[4] ?? 0), 0, 0, 0, 0, 0, 0]);
    }

    stmt.free();
  }

  /** 当日（JST）の input + output トークン合計を返す。 */
  getDailyTokensToday(): number {
    const db = this.ensureDb();
    const tzOffset = getSqliteTzOffset('Asia/Tokyo');
    const result = db.exec(
      `SELECT s.source,
        SUM(COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)) AS raw_tokens,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
         AND DATE(m.timestamp, '${tzOffset}') = DATE('now', '${tzOffset}')
       GROUP BY s.source`,
    );
    let total = 0;
    for (const row of result[0]?.values ?? []) {
      const rawTokens = Number(row[1]);
      const totalTurns = Number(row[2]);
      const missingTurns = Number(row[3]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      total += Math.round(rawTokens * factor);
    }
    return total;
  }

  /** 指定セッションの input + output トークン合計を返す（欠損補正済み）。 */
  getSessionTokens(sessionId: string): number {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT
        SUM(COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)) AS raw_tokens,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       WHERE m.type = 'assistant' AND m.session_id = ?`,
      [sessionId],
    );
    const row = result[0]?.values[0];
    if (!row) return 0;
    const rawTokens = Number(row[0] ?? 0);
    const totalTurns = Number(row[1] ?? 0);
    const missingTurns = Number(row[2] ?? 0);
    const observed = totalTurns - missingTurns;
    const factor = observed > 0 ? totalTurns / observed : 1;
    return Math.round(rawTokens * factor);
  }

  save(): void {
    const db = this.ensureDb();
    const alerts = this.integrityMonitor.recordAndDetect(db);
    if (alerts.length > 0 && this.onIntegrityAlert) {
      this.onIntegrityAlert(alerts);
    }
    const data = db.export();
    this.storage.save(data);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  // -------------------------------------------------------------------------
  //  Import
  // -------------------------------------------------------------------------

  /** Load all imported sessions into memory for fast lookup during importAll. */
  /** Load imported sessions keyed by file_path for accurate skip detection.
   *  `hasMessages` is false when `sessions` row exists but no `messages` rows are present
   *  (happens after a silent message-insert failure). Callers should re-import such sessions. */
  private getImportedFileMap(): Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean; hasUsableCostData: boolean }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT s.id, s.file_path, s.file_size, s.commits_resolved_at,
        CASE WHEN s.message_count = 0 THEN 1
             WHEN EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id) THEN 1
             ELSE 0 END AS has_messages,
        CASE WHEN s.source = 'codex' AND s.message_count > 0 THEN
             CASE WHEN EXISTS (
               SELECT 1 FROM session_costs sc
               WHERE sc.session_id = s.id
                 AND (COALESCE(sc.input_tokens, 0) + COALESCE(sc.output_tokens, 0) +
                      COALESCE(sc.cache_read_tokens, 0) + COALESCE(sc.cache_creation_tokens, 0) +
                      COALESCE(sc.estimated_cost_usd, 0)) > 0
             ) THEN 1 ELSE 0 END
             ELSE 1 END AS has_usable_cost_data
       FROM sessions s`,
    );
    const map = new Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean; hasUsableCostData: boolean }>();
    for (const row of result[0]?.values ?? []) {
      map.set(String(row[1]), {
        sessionId: String(row[0]),
        fileSize: Number(row[2]),
        commitsResolved: row[3] != null,
        hasMessages: Number(row[4]) === 1,
        hasUsableCostData: Number(row[5]) === 1,
      });
    }
    return map;
  }

  /** Get set of session IDs that exist in DB. */

  isImported(sessionId: string): boolean {
    const db = this.ensureDb();
    const stmt = db.prepare('SELECT 1 FROM sessions WHERE id = ? LIMIT 1');
    stmt.bind([sessionId]);
    const exists = stmt.step();
    stmt.free();
    return exists;
  }

  getImportedFileSize(sessionId: string): number {
    const db = this.ensureDb();
    const stmt = db.prepare('SELECT file_size FROM sessions WHERE id = ? LIMIT 1');
    stmt.bind([sessionId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as { file_size: number };
      stmt.free();
      return row.file_size;
    }
    stmt.free();
    return 0;
  }

  isCommitsResolved(sessionId: string): boolean {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT 1 FROM sessions WHERE id = ? AND commits_resolved_at IS NOT NULL LIMIT 1',
    );
    stmt.bind([sessionId]);
    const exists = stmt.step();
    stmt.free();
    return exists;
  }

  private getSessionTimeRange(sessionId: string): {
    startTime: string; endTime: string; gitBranch: string;
  } | null {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT start_time, end_time FROM sessions WHERE id = ? LIMIT 1',
    );
    stmt.bind([sessionId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as {
      start_time: string; end_time: string;
    };
    stmt.free();

    // git_branch is stored in messages table, not sessions
    let gitBranch = '';
    try {
      const branchResult = db.exec(
        `SELECT git_branch FROM messages
         WHERE session_id = ? AND git_branch IS NOT NULL AND git_branch != ''
         LIMIT 1`,
        [sessionId],
      );
      gitBranch = String(branchResult[0]?.values[0]?.[0] ?? '');
    } catch { /* no branch info available */ }

    return {
      startTime: row.start_time,
      endTime: row.end_time,
      gitBranch,
    };
  }

  /** Session-Id トレーラーから UUID を抽出。なければ null */
  parseSessionIdFromBody(body: string): string | null {
    const match = /^Session-Id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/im.exec(body);
    return match ? match[1] : null;
  }

  private readCodexSessionMeta(filePath: string): { cwd: string | null } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let rec: RawLine;
        try {
          rec = JSON.parse(trimmed) as RawLine;
        } catch {
          continue;
        }
        if (rec.type !== 'session_meta' || !rec.payload || typeof rec.payload !== 'object') continue;
        const cwd = (rec.payload as Record<string, unknown>).cwd;
        return { cwd: typeof cwd === 'string' ? cwd : null };
      }
      return null;
    } catch {
      return null;
    }
  }

  resolveCommits(sessionId: string, gitRoot: string, repoName: string): number {
    const db = this.ensureDb();
    const range = this.getSessionTimeRange(sessionId);
    if (!range) return 0;

    const { startTime, endTime, gitBranch } = range;

    // Add 5 minutes buffer to endTime for commits made right after session
    const endDate = new Date(endTime);
    endDate.setMinutes(endDate.getMinutes() + 5);
    const bufferedEnd = endDate.toISOString();

    const execOpts = { encoding: 'utf-8' as const, timeout: 10_000 };
    const logFormat = '%H%x00%s%x00%an%x00%aI%x00%b%x1e';

    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO session_commits
        (session_id, commit_hash, commit_message, author, committed_at,
         is_ai_assisted, files_changed, lines_added, lines_deleted, repo_name)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );

    let count = 0;

    // Phase A: Session-Id trailer exact match
    try {
      const grepPattern = `^Session-Id: ${sessionId}$`;
      const phaseAOutput = execFileSync('git', [
        'log', '--all',
        '--extended-regexp', `--grep=${grepPattern}`,
        `--format=${logFormat}`,
        '--no-merges',
      ], { ...execOpts, cwd: gitRoot });

      count += this.processCommitEntries(phaseAOutput, sessionId, repoName, insertStmt, execOpts, gitRoot);
    } catch {
      // git grep may fail if no commits match — not an error
    }

    // Phase B: Time-range fallback (existing behavior + Session-Id filter)
    let logOutput = '';
    const useBranch = gitBranch && gitBranch.trim() !== '';
    try {
      logOutput = execFileSync('git', [
        'log', useBranch ? gitBranch : '--all',
        `--after=${startTime}`,
        `--before=${bufferedEnd}`,
        `--format=${logFormat}`,
        '--no-merges',
      ], { ...execOpts, cwd: gitRoot });
    } catch {
      try {
        logOutput = execFileSync('git', [
          'log', '--all',
          `--after=${startTime}`,
          `--before=${bufferedEnd}`,
          `--format=${logFormat}`,
          '--no-merges',
        ], { ...execOpts, cwd: gitRoot });
      } catch {
        // On any git error, mark as resolved and return Phase A count
        insertStmt.free();
        this.markCommitResolutionDone(sessionId, repoName);
        return count;
      }
    }

    count += this.processCommitEntries(logOutput, sessionId, repoName, insertStmt, execOpts, gitRoot, true);

    insertStmt.free();

    this.markCommitResolutionDone(sessionId, repoName);

    return count;
  }

  /** Mark (sessionId, repoName) as resolved in session_commit_resolutions, plus legacy sessions.commits_resolved_at. */
  private markCommitResolutionDone(sessionId: string, repoName: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT INTO session_commit_resolutions (session_id, repo_name, resolved_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(session_id, repo_name) DO UPDATE SET resolved_at = excluded.resolved_at`,
      [sessionId, repoName],
    );
    // 既存挙動の互換: 主リポジトリ解決時も sessions.commits_resolved_at を更新
    db.run(
      "UPDATE sessions SET commits_resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      [sessionId],
    );
  }

  /** Returns true if (sessionId, repoName) is already recorded as resolved. */
  isCommitResolutionDone(sessionId: string, repoName: string): boolean {
    const db = this.ensureDb();
    const r = db.exec(
      'SELECT 1 FROM session_commit_resolutions WHERE session_id = ? AND repo_name = ? LIMIT 1',
      [sessionId, repoName],
    );
    return Boolean(r[0]?.values?.length);
  }

  /** Parse git log output and insert commits into session_commits table.
   *  @param filterBySessionId If true, skip commits whose Session-Id trailer belongs to another session */
  private processCommitEntries(
    logOutput: string,
    sessionId: string,
    repoName: string,
    insertStmt: SqlJsStatement,
    execOpts: { encoding: 'utf-8'; timeout: number },
    gitRoot: string,
    filterBySessionId = false,
  ): number {
    const commits = logOutput
      .split('\x1e')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let count = 0;
    for (const entry of commits) {
      const parts = entry.split('\x00');
      if (parts.length < 4) continue;

      const hash = parts[0];
      const subject = parts[1];
      const author = parts[2];
      const committedAt = toUTC(parts[3]);
      const body = parts[4] ?? '';

      // Phase B filter: skip commits that belong to a different session
      if (filterBySessionId) {
        const trailerSessionId = this.parseSessionIdFromBody(body);
        if (trailerSessionId && trailerSessionId !== sessionId) continue;
      }

      const isAiAssisted = /Co-Authored-By:.*Claude/i.test(body) ? 1 : 0;

      let filesChanged = 0;
      let linesAdded = 0;
      let linesDeleted = 0;
      const filePaths: string[] = [];
      try {
        const numstat = execFileSync('git', [
          'diff', '--numstat', `${hash}^..${hash}`,
        ], { ...execOpts, cwd: gitRoot });

        for (const line of numstat.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split('\t');
          const added = parts[0];
          const deleted = parts[1];
          const filePath = parts[2];
          filesChanged++;
          if (added !== '-') linesAdded += Number.parseInt(added, 10) || 0;
          if (deleted !== '-') linesDeleted += Number.parseInt(deleted, 10) || 0;
          if (filePath) filePaths.push(filePath);
        }
      } catch {
        // Initial commit or other error — skip numstat
      }

      insertStmt.run([
        sessionId, hash, subject, author, committedAt,
        isAiAssisted, filesChanged, linesAdded, linesDeleted, repoName,
      ]);

      if (filePaths.length > 0) {
        const filesStmt = this.ensureDb().prepare(
          'INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_name) VALUES (?, ?, ?)',
        );
        try {
          for (const fp of filePaths) {
            filesStmt.run([hash, fp, repoName]);
          }
        } finally {
          filesStmt.free();
        }
      }

      count++;
    }

    return count;
  }

  /** @returns number of messages imported */
  importSession(filePath: string, repoName: string, isSubagent = false, externalTransaction = false): number {
    const db = this.ensureDb();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');

    // サブエージェント JSONL の場合は隣接 meta.json から subagent_type を取得し、
    // この JSONL 内の全メッセージに付与する。古いセッションは meta.json なし → NULL のまま。
    const fileSubagentType = isSubagent ? readSubagentTypeFromMeta(filePath) : null;

    const parsedRaw: RawLine[] = [];
    for (const line of lines) {
      try {
        parsedRaw.push(JSON.parse(line) as RawLine);
      } catch {
        // Skip malformed lines
      }
    }

    if (parsedRaw.length === 0) return 0;

    const fallbackSessionId = path.basename(filePath).replace(/\.jsonl$/i, '');
    const isCodex = parsedRaw.some(
      (r) => r.type === 'session_meta' || r.type === 'response_item' || r.type === 'event_msg',
    );
    const codexNormalized = isCodex ? normalizeCodexRecords(parsedRaw, fallbackSessionId) : null;
    const parsed: RawLine[] = codexNormalized ? codexNormalized.normalized : parsedRaw;
    const source: 'claude_code' | 'codex' = isCodex ? 'codex' : 'claude_code';
    if (parsed.length === 0) return 0;

    // Extract session metadata
    let sessionId = '';
    let slug = '';
    let version = '';
    let model = '';
    let entrypoint = '';
    let startTime = '';
    let endTime = '';
    let messageCount = 0;

    // Collect messages to insert
    const messagesToInsert: RawLine[] = [];

    for (const raw of parsed) {
      if (!raw.type || SKIP_TYPES.has(raw.type)) continue;
      if (raw.isMeta === true) continue;

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId;
      if (!slug && raw.slug) slug = raw.slug;
      if (!version && raw.version) version = raw.version;
      if (!entrypoint && raw.entrypoint) entrypoint = raw.entrypoint;
      if (!model && raw.message?.model) model = raw.message.model;
      if (!startTime && raw.timestamp) startTime = toUTC(raw.timestamp);
      if (raw.timestamp) endTime = toUTC(raw.timestamp);

      messagesToInsert.push(raw);
      messageCount++;
    }

    if (!sessionId) sessionId = codexNormalized?.sessionId || fallbackSessionId;
    if (!version && codexNormalized?.version) version = codexNormalized.version;

    const fileSize = fs.statSync(filePath).size;
    const importedAt = new Date().toISOString();

    if (!externalTransaction) db.run('BEGIN TRANSACTION');
    try {
      // Insert/update session metadata only for main session files
      if (!isSubagent) {
        db.run(INSERT_SESSION, [
          sessionId, slug, repoName, version,
          entrypoint, model, startTime, endTime, messageCount,
          filePath, fileSize, importedAt, source,
        ]);
      }

      // Insert messages
      const msgStmt = db.prepare(INSERT_MESSAGE);
      for (const raw of messagesToInsert) {
        const textContent = raw.type === 'assistant'
          ? extractTextContent(raw.message?.content)
          : null;
        const userContent = raw.type === 'user'
          ? (typeof raw.message?.content === 'string' ? raw.message.content : null)
          : null;
        const toolCalls = raw.type === 'assistant'
          ? extractToolCalls(raw.message?.content)
          : null;
        // tool_use_result: ユーザーメッセージの content から tool_result ブロックを抽出する。
        // raw.toolUseResult はエラーテキストのみの場合があり、buildErrorMap が期待する
        // [{type:"tool_result", is_error:true, tool_use_id:"..."}] 形式ではないため、
        // message.content 配列から tool_result ブロックを直接取得する。
        let toolUseResult: string | null = null;
        if (raw.type === 'user' && Array.isArray(raw.message?.content)) {
          const toolResults = (raw.message.content as unknown[]).filter(
            (b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'tool_result',
          );
          if (toolResults.length > 0) {
            toolUseResult = JSON.stringify(toolResults);
          }
        }
        if (!toolUseResult && raw.toolUseResult != null) {
          toolUseResult = typeof raw.toolUseResult === 'string'
            ? raw.toolUseResult
            : JSON.stringify(raw.toolUseResult);
        }

        // --- Analytics fields ---
        const durationMs = raw.durationMs ?? null;
        const toolResultSize = estimateTokenCount(toolUseResult);
        const agentInfo = extractAgentInfo(toolCalls);

        // --- New metadata fields ---
        const permMode = raw.permissionMode ?? null;
        const skill = extractSkillName(toolCalls);
        const agentId = raw.agentId ?? null;
        const sourceToolAssistantUUID = raw.sourceToolAssistantUUID ?? null;
        const sourceToolUseID = raw.sourceToolUseID ?? null;
        const systemCommand = raw.subtype === 'compact_boundary' ? '/compact'
          : raw.subtype === 'local_command' ? '/clear'
          : null;

        // 主セッションでは Agent tool_use を持つ親メッセージのみ subagent_type を持つ（呼び出し意図記録）。
        // サブエージェント JSONL では全メッセージが meta.json 由来の subagent_type を持つ。
        const subagentType = isSubagent ? fileSubagentType : agentInfo.subagentType;

        msgStmt.run([
          raw.uuid ?? '',
          sessionId,
          raw.parentUuid ?? null,
          raw.type ?? '',
          raw.subtype ?? null,
          textContent,
          userContent,
          toolCalls,
          toolUseResult,
          raw.message?.model ?? null,
          raw.requestId ?? null,
          raw.message?.stop_reason ?? null,
          raw.message?.usage?.input_tokens ?? 0,
          raw.message?.usage?.output_tokens ?? 0,
          raw.message?.usage?.cache_read_input_tokens ?? 0,
          raw.message?.usage?.cache_creation_input_tokens ?? 0,
          raw.message?.usage?.service_tier ?? null,
          raw.message?.usage?.speed ?? null,
          toUTC(raw.timestamp ?? ''),
          raw.isSidechain ? 1 : 0,
          raw.isMeta ? 1 : 0,
          raw.cwd ?? null,
          raw.gitBranch ?? null,
          durationMs,
          toolResultSize,
          agentInfo.description,
          agentInfo.model,
          permMode,
          skill,
          agentId,
          sourceToolAssistantUUID,
          sourceToolUseID,
          systemCommand,
          subagentType,
        ]);
      }
      msgStmt.free();

      if (!externalTransaction) db.run('COMMIT');
      return messageCount;
    } catch (err) {
      if (!externalTransaction) db.run('ROLLBACK');
      throw err;
    }
  }

  async importAll(
    onProgress?: (message: string, increment?: number) => void,
    gitRoots?: readonly string[],
    excludePatterns?: readonly string[],
    analyzeFn?: AnalyzeFunction,
  ): Promise<{ imported: number; skipped: number; commitsResolved: number; releasesResolved: number; releasesAnalyzed: number; coverageImported: number; currentCoverageImported: number; messageCommitsBackfilled: number }> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    // 主リポジトリは gitRoots[0] とみなす（コード解析・Codex セッションのフィルタに使う既存挙動の互換）
    const gitRoot = gitRoots?.[0];
    const repoName = gitRoot ? path.basename(gitRoot) : '';
    const watched = (gitRoots ?? []).map((r) => ({ gitRoot: r, repoName: path.basename(r) }));
    let imported = 0;
    let skipped = 0;
    let commitsResolved = 0;


    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return { imported, skipped, commitsResolved, releasesResolved: 0, releasesAnalyzed: 0, coverageImported: 0, currentCoverageImported: 0, messageCommitsBackfilled: 0 };
    }

    // Pre-load imported file paths + sizes for fast skip
    const importedFiles = this.getImportedFileMap();
    const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

    // Collect files per session directory (main + subagents grouped)
    type SessionDir = {
      sid: string;
      mainFile: string;
      subagentFiles: string[];
      repoName: string;
      source: 'claude_code' | 'codex';
    };
    const sessionDirs: SessionDir[] = [];

    for (const projectName of projectDirs) {
      const projectPath = path.join(projectsDir, projectName);
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
      } catch { continue; }

      let entries: string[];
      try { entries = fs.readdirSync(projectPath); } catch { continue; }

      for (const entry of entries) {
        // Main session file: UUID.jsonl at project directory level
        if (!entry.endsWith('.jsonl')) continue;
        const sid = entry.slice(0, -6); // remove .jsonl
        if (!UUID_RE.test(sid)) continue;

        const mainFile = path.join(projectPath, entry);

        // Subagent files: UUID/subagents/*.jsonl
        const subagentDir = path.join(projectPath, sid, 'subagents');
        const subagentFiles: string[] = [];
        try {
          for (const sf of fs.readdirSync(subagentDir)) {
            if (sf.endsWith('.jsonl')) {
              subagentFiles.push(path.join(subagentDir, sf));
            }
          }
        } catch { /* no subagents dir */ }

        sessionDirs.push({ sid, mainFile, subagentFiles, repoName: repoName || projectName, source: 'claude_code' });
      }
    }

    // Codex sessions (~/.codex/sessions/**/rollout-*.jsonl)
    try {
      const codexFiles = collectJsonlFilesRecursive(codexSessionsDir).filter((f: string) =>
        path.basename(f).startsWith('rollout-'),
      );
      for (const filePath of codexFiles) {
        const sidMatch = filePath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
        const sid = sidMatch?.[1] ?? path.basename(filePath, '.jsonl');
        if (gitRoot) {
          const meta = this.readCodexSessionMeta(filePath);
          if (!meta?.cwd) continue;
          const normalizedCwd = path.resolve(meta.cwd);
          const normalizedGitRoot = path.resolve(gitRoot);
          if (!normalizedCwd.startsWith(normalizedGitRoot)) continue;
        }
        sessionDirs.push({ sid, mainFile: filePath, subagentFiles: [], repoName: repoName || 'codex', source: 'codex' });
      }
    } catch {
      // codex sessions may not exist
    }

    const totalSessions = sessionDirs.length;
    const totalFiles = sessionDirs.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    const claudeSessions = sessionDirs.filter(d => d.source === 'claude_code');
    const codexSessions = sessionDirs.filter(d => d.source === 'codex');
    const claudeFiles = claudeSessions.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    const codexFiles = codexSessions.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    onProgress?.(
      `Found ${totalSessions} sessions (${totalFiles} files): ` +
        `Claude Code ${claudeSessions.length} sessions (${claudeFiles} files), ` +
        `Codex ${codexSessions.length} sessions (${codexFiles} files)`,
      0,
    );

    const BATCH_MESSAGE_LIMIT = 20_000;
    const BATCH_FILE_LIMIT = 100;
    let batchMessageCount = 0;
    let batchFileCount = 0;
    let inTransaction = false;
    let processedFiles = 0;
    const processedBySource = { claude_code: 0, codex: 0 };
    const skippedBySource = { claude_code: 0, codex: 0 };
    // Sessions that entered the import path in this run. Sessions skipped via
    // the file-size check did not gain new messages, so message_tool_calls is
    // already up to date and the analyzer can be skipped for them.
    const sessionsToAnalyze = new Set<string>();

    const formatProgress = (): string =>
      `${batchMessageCount} messages (${processedFiles}/${totalFiles}, skipped ${skipped}): ` +
      `Claude Code ${processedBySource.claude_code}/${claudeFiles} skipped ${skippedBySource.claude_code}, ` +
      `Codex ${processedBySource.codex}/${codexFiles} skipped ${skippedBySource.codex}`;

    for (const dir of sessionDirs) {
      const sessionFileTotal = 1 + dir.subagentFiles.length;
      // Skip entire session (main + all subagents) if main file size unchanged
      // and the existing row actually has messages. A session row with zero messages
      // is a leftover from a previously-failed import and must be re-processed.
      const existing = importedFiles.get(dir.mainFile);
      if (existing && existing.hasMessages && existing.hasUsableCostData) {
        let currentFileSize = 0;
        try { currentFileSize = fs.statSync(dir.mainFile).size; } catch (e) { this.logger.error(`statSync failed: ${dir.mainFile}`, e); skipped++; skippedBySource[dir.source]++; continue; }
        if (currentFileSize <= existing.fileSize) {
          skipped += sessionFileTotal;
          skippedBySource[dir.source] += sessionFileTotal;
          processedFiles += sessionFileTotal;
          processedBySource[dir.source] += sessionFileTotal;
          for (const w of watched) {
            if (this.isCommitResolutionDone(dir.sid, w.repoName)) continue;
            try { commitsResolved += this.resolveCommits(dir.sid, w.gitRoot, w.repoName); } catch (e) { this.logger.error(`resolveCommits failed (skipped session): ${dir.sid} repo=${w.repoName}`, e); }
          }
          continue;
        }
      }

      sessionsToAnalyze.add(dir.sid);

      // Import all files for this session (main + subagents) in one batch
      const db = this.ensureDb();
      if (!inTransaction) {
        db.run('BEGIN TRANSACTION');
        inTransaction = true;
        batchMessageCount = 0;
        batchFileCount = 0;
      }

      const filesToImport = [
        { filePath: dir.mainFile, isSubagent: false },
        ...dir.subagentFiles.map((f) => ({ filePath: f, isSubagent: true })),
      ];

      for (const file of filesToImport) {
        try {
          const msgCount = this.importSession(file.filePath, dir.repoName, file.isSubagent, true);
          imported++;
          batchMessageCount += msgCount;
          batchFileCount++;
        } catch (e) {
          this.logger.error(`importSession failed: ${file.filePath}`, e);
        }
        processedFiles++;
        processedBySource[dir.source]++;
      }

      // Resolve commits after all files for this session — once per watched repo
      for (const w of watched) {
        if (this.isCommitResolutionDone(dir.sid, w.repoName)) continue;
        try { commitsResolved += this.resolveCommits(dir.sid, w.gitRoot, w.repoName); } catch (e) { this.logger.error(`resolveCommits failed: ${dir.sid} repo=${w.repoName}`, e); }
      }

      // Commit at session boundary when limits exceeded
      if (batchMessageCount >= BATCH_MESSAGE_LIMIT || batchFileCount >= BATCH_FILE_LIMIT) {
        if (inTransaction) {
          try { db.run('COMMIT'); } catch (e) { this.logger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (re) { this.logger.error('ROLLBACK also failed', re); } }
          inTransaction = false;
        }
        onProgress?.(formatProgress(), 0);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // Commit remaining batch
    if (inTransaction) {
      const db = this.ensureDb();
      try { db.run('COMMIT'); } catch (e) { this.logger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (re) { this.logger.error('ROLLBACK also failed', re); } }
      inTransaction = false;
      onProgress?.(formatProgress(), 0);
    }

    // Resolve releases from version tags
    let releasesResolved = 0;
    if (gitRoot) {
      try {
        onProgress?.('Resolving releases from version tags...', 0);
        releasesResolved = this.resolveReleases(gitRoot);
        onProgress?.(`Releases resolved: ${releasesResolved}`, 0);
      } catch {
        // Skip release resolution errors
      }
    }

    // Analyze source code for each release
    let releasesAnalyzed = 0;
    if (gitRoot && analyzeFn) {
      try {
        onProgress?.('Analyzing releases...', 0);
        releasesAnalyzed = this.analyzeReleases(gitRoot, analyzeFn, (msg) => onProgress?.(msg, 0), excludePatterns);
        onProgress?.(`Releases analyzed: ${releasesAnalyzed}`, 0);
      } catch {
        // Skip analysis errors
      }
    }

    // Import coverage data from packages/*/coverage/coverage-summary.json
    let coverageImported = 0;
    let currentCoverageImported = 0;
    if (gitRoot) {
      try {
        onProgress?.('Importing coverage data...', 0);
        coverageImported = this.importCoverage(gitRoot);
        onProgress?.(`Coverage imported: ${coverageImported} entries`, 0);
      } catch {
        // Skip coverage import errors
      }
      try {
        onProgress?.('Importing current coverage snapshot...', 0);
        currentCoverageImported = this.importCurrentCoverage(gitRoot, path.basename(gitRoot));
        onProgress?.(`Current coverage imported: ${currentCoverageImported} entries`, 0);
      } catch {
        // Skip current coverage import errors
      }
    }

    // Rebuild session_costs and daily_counts from all messages / tool_calls
    onProgress?.('Rebuilding session costs...', 0);
    this.rebuildSessionCosts();
    onProgress?.('Session costs rebuilt', 0);

    // Analyze Claude Code behavior only for sessions that were (re)imported in this run.
    // Sessions skipped above had no new messages, so message_tool_calls is already current.
    if (sessionsToAnalyze.size > 0) {
      const db = this.ensureDb();
      const analyzer = new ClaudeCodeBehaviorAnalyzer();
      onProgress?.(`Analyzing Claude Code behavior (${sessionsToAnalyze.size} sessions)...`, 0);
      for (const sid of sessionsToAnalyze) {
        try {
          analyzer.analyze(sid, db);
        } catch (e) {
          this.logger.error(`ClaudeCodeBehaviorAnalyzer failed for session ${sid}`, e);
        }
      }
    }

    // Rebuild daily_counts (6 kinds) after message_tool_calls is populated
    onProgress?.('Rebuilding daily counts...', 0);
    this.rebuildDailyCounts();
    onProgress?.('Daily counts rebuilt', 0);

    // Pre-aggregate per-session stats used by /api/trail/sessions
    onProgress?.('Rebuilding session stats...', 0);
    this.rebuildSessionStats();
    onProgress?.('Session stats rebuilt', 0);

    // Phase 2a: backfill commit_files (one-time migration for existing commits)
    if (gitRoot) {
      this.backfillCommitFiles(gitRoot, (msg) => onProgress?.(msg, 0));
    }

    // Phase D-2: backfill subagent_type from .meta.json + parent tool_calls (one-time)
    onProgress?.('Backfilling subagent_type...', 0);
    try {
      this.backfillSubagentType();
    } catch (e) {
      this.logger.warn(`backfillSubagentType failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }

    // Phase 2: backfill message_commits
    onProgress?.('Backfilling message_commits...', 0);
    const unresolvedSessions = this.getUnresolvedMessageCommitSessions();
    let messageCommitsBackfilled = 0;
    for (const { sessionId, filePath } of unresolvedSessions) {
      try {
        const messages = JsonlSessionReader.loadFromFile(filePath);
        const rawCommits = this.getSessionCommits(sessionId);
        const commits = rawCommits.map((c) => ({
          commitHash: c.commit_hash,
          commitMessage: c.commit_message,
          author: c.author,
          committedAt: c.committed_at,
          isAiAssisted: c.is_ai_assisted === 1,
          filesChanged: c.files_changed,
          linesAdded: c.lines_added,
          linesDeleted: c.lines_deleted,
          repoName: c.repo_name ?? '',
        }));
        const matches = matchCommitsToMessages(messages, commits);
        const now = new Date().toISOString();
        for (const m of matches) {
          this.insertMessageCommit({
            messageUuid: m.messageUuid,
            sessionId,
            commitHash: m.commitHash,
            detectedAt: now,
            matchConfidence: m.matchConfidence,
          });
        }
        this.markMessageCommitsResolved(sessionId, now);
        messageCommitsBackfilled += matches.length;
      } catch (e) {
        this.logger.error(`Backfill failed for session ${sessionId}`, e);
      }
    }
    onProgress?.(`Backfilled ${messageCommitsBackfilled} message_commits`, 0);

    this.save();
    return {
      imported,
      skipped,
      commitsResolved,
      releasesResolved,
      releasesAnalyzed,
      coverageImported,
      currentCoverageImported,
      messageCommitsBackfilled,
    };
  }

  saveManualElement(
    repoName: string,
    input: { type: string; name: string; description?: string; external: boolean; parentId: string | null; serviceType?: string },
  ): string {
    const db = this.ensureDb();
    const prefix = this.getTypePrefix(input.type);
    const nextN = this.getNextManualSequence(repoName, prefix) + 1;
    const id = `${prefix}${nextN}`;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO c4_manual_elements
         (repo_name, element_id, type, name, description, external, parent_id, service_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repoName, id, input.type, input.name, input.description ?? null, input.external ? 1 : 0, input.parentId, input.serviceType ?? null, now],
    );
    this.save();
    return id;
  }

  updateManualElement(
    repoName: string,
    elementId: string,
    changes: { name?: string; description?: string; external?: boolean; serviceType?: string },
  ): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (changes.name !== undefined) { sets.push('name = ?'); vals.push(changes.name); }
    if (changes.description !== undefined) { sets.push('description = ?'); vals.push(changes.description); }
    if (changes.external !== undefined) { sets.push('external = ?'); vals.push(changes.external ? 1 : 0); }
    if (changes.serviceType !== undefined) { sets.push('service_type = ?'); vals.push(changes.serviceType); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    vals.push(now, repoName, elementId);
    db.run(
      `UPDATE c4_manual_elements SET ${sets.join(', ')} WHERE repo_name = ? AND element_id = ?`,
      vals,
    );
    this.save();
  }

  deleteManualElement(repoName: string, elementId: string): void {
    const db = this.ensureDb();
    db.run(
      `DELETE FROM c4_manual_relationships WHERE repo_name = ? AND (from_id = ? OR to_id = ?)`,
      [repoName, elementId, elementId],
    );
    db.run(
      `DELETE FROM c4_manual_elements WHERE repo_name = ? AND element_id = ?`,
      [repoName, elementId],
    );
    this.save();
  }

  getManualElements(repoName: string): readonly ManualElement[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT element_id, type, name, description, external, parent_id, service_type, updated_at
         FROM c4_manual_elements WHERE repo_name = ? ORDER BY element_id`,
      [repoName],
    );
    const rows = result[0]?.values ?? [];
    return rows.map((row) => ({
      id: String(row[0]),
      type: String(row[1]) as ManualElement['type'],
      name: String(row[2]),
      description: row[3] == null ? undefined : String(row[3]),
      external: Boolean(row[4]),
      parentId: row[5] == null ? null : String(row[5]),
      serviceType: row[6] == null ? undefined : String(row[6]),
      updatedAt: String(row[7]),
    }));
  }

  saveManualRelationship(
    repoName: string,
    input: { fromId: string; toId: string; label?: string; technology?: string },
  ): string {
    const db = this.ensureDb();
    const nextN = this.getNextManualSequence(repoName, 'rel_manual_') + 1;
    const id = `rel_manual_${nextN}`;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO c4_manual_relationships
         (repo_name, rel_id, from_id, to_id, label, technology, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repoName, id, input.fromId, input.toId, input.label ?? null, input.technology ?? null, now],
    );
    this.save();
    return id;
  }

  deleteManualRelationship(repoName: string, relId: string): void {
    const db = this.ensureDb();
    db.run(
      `DELETE FROM c4_manual_relationships WHERE repo_name = ? AND rel_id = ?`,
      [repoName, relId],
    );
    this.save();
  }

  getManualRelationships(repoName: string): readonly ManualRelationship[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT rel_id, from_id, to_id, label, technology, updated_at
         FROM c4_manual_relationships WHERE repo_name = ? ORDER BY rel_id`,
      [repoName],
    );
    const rows = result[0]?.values ?? [];
    return rows.map((row) => ({
      id: String(row[0]),
      fromId: String(row[1]),
      toId: String(row[2]),
      label: row[3] == null ? undefined : String(row[3]),
      technology: row[4] == null ? undefined : String(row[4]),
      updatedAt: String(row[5]),
    }));
  }

  insertManualElementRaw(repoName: string, e: ManualElement): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO c4_manual_elements
         (repo_name, element_id, type, name, description, external, parent_id, service_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repoName, e.id, e.type, e.name, e.description ?? null, e.external ? 1 : 0, e.parentId, e.serviceType ?? null, e.updatedAt],
    );
    this.save();
  }

  insertManualRelationshipRaw(repoName: string, r: ManualRelationship): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO c4_manual_relationships
         (repo_name, rel_id, from_id, to_id, label, technology, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repoName, r.id, r.fromId, r.toId, r.label ?? null, r.technology ?? null, r.updatedAt],
    );
    this.save();
  }

  saveManualGroup(
    repoName: string,
    input: { memberIds: string[]; label?: string },
  ): string {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT group_id FROM c4_manual_groups WHERE repo_name = ? AND group_id LIKE 'grp_manual_%'`,
      [repoName],
    );
    const maxN = (result[0]?.values ?? []).reduce((m: number, row) => {
      const n = Number.parseInt(String(row[0]).substring('grp_manual_'.length), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const id = `grp_manual_${maxN + 1}`;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO c4_manual_groups (repo_name, group_id, member_ids, label, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [repoName, id, JSON.stringify(input.memberIds), input.label ?? null, now],
    );
    this.save();
    return id;
  }

  updateManualGroup(
    repoName: string,
    groupId: string,
    changes: { memberIds?: string[]; label?: string | null },
  ): void {
    const db = this.ensureDb();
    const sets: string[] = ['updated_at = ?'];
    const values: (string | null)[] = [new Date().toISOString()];
    if (changes.memberIds !== undefined) { sets.push('member_ids = ?'); values.push(JSON.stringify(changes.memberIds)); }
    if ('label' in changes) { sets.push('label = ?'); values.push(changes.label ?? null); }
    values.push(repoName, groupId);
    db.run(`UPDATE c4_manual_groups SET ${sets.join(', ')} WHERE repo_name = ? AND group_id = ?`, values);
    this.save();
  }

  deleteManualGroup(repoName: string, groupId: string): void {
    const db = this.ensureDb();
    db.run(`DELETE FROM c4_manual_groups WHERE repo_name = ? AND group_id = ?`, [repoName, groupId]);
    this.save();
  }

  getManualGroups(repoName: string): readonly ManualGroup[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT group_id, member_ids, label, updated_at FROM c4_manual_groups WHERE repo_name = ? ORDER BY group_id`,
      [repoName],
    );
    return (result[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      memberIds: JSON.parse(String(row[1])) as string[],
      label: row[2] == null ? undefined : String(row[2]),
      updatedAt: String(row[3]),
    }));
  }

  private getTypePrefix(type: string): string {
    switch (type) {
      case 'person': return 'person_';
      case 'system': return 'sys_manual_';
      case 'container': return 'pkg_manual_';
      case 'component': return 'cmp_manual_';
      default: throw new Error(`Unknown manual element type: ${type}`);
    }
  }

  private getNextManualSequence(repoName: string, prefix: string): number {
    const db = this.ensureDb();
    const table = prefix === 'rel_manual_' ? 'c4_manual_relationships' : 'c4_manual_elements';
    const col = prefix === 'rel_manual_' ? 'rel_id' : 'element_id';
    const result = db.exec(
      `SELECT ${col} FROM ${table} WHERE repo_name = ? AND ${col} LIKE ?`,
      [repoName, `${prefix}%`],
    );
    const rows = result[0]?.values ?? [];
    let max = 0;
    for (const row of rows) {
      const id = String(row[0]);
      const n = Number.parseInt(id.substring(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  saveCurrentGraph(graph: TrailGraph, tsconfigPath: string, commitId: string, repoName: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO current_graphs
         (repo_name, commit_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [
        repoName,
        commitId,
        JSON.stringify(graph),
        tsconfigPath,
        graph.metadata.projectRoot,
        graph.metadata.analyzedAt,
      ],
    );
    this.save();
  }

  /**
   * リポジトリの current グラフを取得する。
   * repoName 未指定時は、保存されているうち最初の1件（sqlite 既定順）を返す。
   */
  getCurrentGraph(repoName?: string): TrailGraph | null {
    const db = this.ensureDb();
    const result = repoName
      ? db.exec('SELECT graph_json FROM current_graphs WHERE repo_name = ?', [repoName])
      : db.exec('SELECT graph_json FROM current_graphs LIMIT 1');
    const json = result[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    return JSON.parse(json) as TrailGraph;
  }

  getCurrentTsconfigPath(repoName?: string): string | null {
    const db = this.ensureDb();
    const result = repoName
      ? db.exec('SELECT tsconfig_path FROM current_graphs WHERE repo_name = ?', [repoName])
      : db.exec('SELECT tsconfig_path FROM current_graphs LIMIT 1');
    const val = result[0]?.values?.[0]?.[0];
    return typeof val === 'string' ? val : null;
  }

  saveReleaseGraph(graph: TrailGraph, tsconfigPath: string, tag: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO release_graphs
         (tag, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [
        tag,
        JSON.stringify(graph),
        tsconfigPath,
        graph.metadata.projectRoot,
        graph.metadata.analyzedAt,
      ],
    );
    this.save();
  }

  getReleaseGraph(tag: string): TrailGraph | null {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT graph_json FROM release_graphs WHERE tag = ?',
      [tag],
    );
    const json = result[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    return JSON.parse(json) as TrailGraph;
  }

  // ---------------------------------------------------------------------------
  //  CodeGraph CRUD
  // ---------------------------------------------------------------------------

  saveCurrentCodeGraph(repoName: string, graph: CodeGraph): void {
    const db = this.ensureDb();
    const { stored, communities } = splitCodeGraph(graph);
    db.run(
      `INSERT OR REPLACE INTO current_code_graphs
         (repo_name, graph_json, generated_at, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [repoName, JSON.stringify(stored), stored.generatedAt],
    );
    // 新しいグラフに存在しない古いコミュニティのみ削除（AI 要約を保持するため全削除はしない）
    if (communities.length === 0) {
      db.run('DELETE FROM current_code_graph_communities WHERE repo_name = ?', [repoName]);
    } else {
      const placeholders = communities.map(() => '?').join(',');
      db.run(
        `DELETE FROM current_code_graph_communities WHERE repo_name = ? AND community_id NOT IN (${placeholders})`,
        [repoName, ...communities.map((c) => c.id)],
      );
    }
    // label は常に更新。name/summary は新しい値が空の場合は既存の AI 要約を保持する
    const stmt = db.prepare(
      `INSERT INTO current_code_graph_communities
         (repo_name, community_id, label, name, summary, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(repo_name, community_id) DO UPDATE SET
         label      = excluded.label,
         name       = CASE WHEN excluded.name    != '' THEN excluded.name    ELSE name    END,
         summary    = CASE WHEN excluded.summary != '' THEN excluded.summary ELSE summary END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    );
    for (const c of communities) {
      stmt.run([repoName, c.id, c.label, c.name, c.summary]);
    }
    stmt.free();
    this.save();
  }

  getCurrentCodeGraph(repoName: string): CodeGraph | null {
    const db = this.ensureDb();
    const graphResult = db.exec(
      'SELECT graph_json FROM current_code_graphs WHERE repo_name = ?',
      [repoName],
    );
    const json = graphResult[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    const stored = JSON.parse(json) as import('@anytime-markdown/trail-core/codeGraph').StoredCodeGraph;
    const commResult = db.exec(
      'SELECT community_id, label, name, summary FROM current_code_graph_communities WHERE repo_name = ?',
      [repoName],
    );
    const communities: StoredCommunity[] = (commResult[0]?.values ?? []).map((row) => ({
      id: row[0] as number,
      label: row[1] as string,
      name: row[2] as string,
      summary: row[3] as string,
    }));
    return composeCodeGraph(stored, communities);
  }

  getAllCurrentCodeGraphRaws(): Array<{ repo_name: string; graph_json: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const result = db.exec('SELECT repo_name, graph_json, generated_at, updated_at FROM current_code_graphs');
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      graph_json: String(r[1] ?? ''),
      generated_at: String(r[2] ?? ''),
      updated_at: String(r[3] ?? ''),
    }));
  }

  getAllCurrentCodeGraphCommunityRaws(): Array<{ repo_name: string; community_id: number; label: string; name: string; summary: string; mappings_json: string | null; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)');
    const colNames = (cols[0]?.values ?? []).map((r) => String(r[1]));
    const hasMappings = colNames.includes('mappings_json');
    const select = hasMappings
      ? 'SELECT repo_name, community_id, label, name, summary, mappings_json, generated_at, updated_at FROM current_code_graph_communities'
      : 'SELECT repo_name, community_id, label, name, summary, generated_at, updated_at FROM current_code_graph_communities';
    const result = db.exec(select);
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      community_id: Number(r[1] ?? 0),
      label: String(r[2] ?? ''),
      name: String(r[3] ?? ''),
      summary: String(r[4] ?? ''),
      mappings_json: hasMappings ? (r[5] == null ? null : String(r[5])) : null,
      generated_at: String(r[hasMappings ? 6 : 5] ?? ''),
      updated_at: String(r[hasMappings ? 7 : 6] ?? ''),
    }));
  }

  getAllReleaseCodeGraphRaws(): Array<{ release_tag: string; graph_json: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const result = db.exec('SELECT release_tag, graph_json, generated_at, updated_at FROM release_code_graphs');
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: String(r[0] ?? ''),
      graph_json: String(r[1] ?? ''),
      generated_at: String(r[2] ?? ''),
      updated_at: String(r[3] ?? ''),
    }));
  }

  getAllReleaseCodeGraphCommunityRaws(): Array<{ release_tag: string; community_id: number; label: string; name: string; summary: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT release_tag, community_id, label, name, summary, generated_at, updated_at FROM release_code_graph_communities',
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: String(r[0] ?? ''),
      community_id: Number(r[1] ?? 0),
      label: String(r[2] ?? ''),
      name: String(r[3] ?? ''),
      summary: String(r[4] ?? ''),
      generated_at: String(r[5] ?? ''),
      updated_at: String(r[6] ?? ''),
    }));
  }

  upsertCurrentCodeGraphCommunities(
    repoName: string,
    communities: ReadonlyArray<{ community_id: number; label?: string; name: string; summary: string }>,
  ): void {
    const db = this.ensureDb();
    for (const c of communities) {
      const existing = db.exec(
        'SELECT label FROM current_code_graph_communities WHERE repo_name = ? AND community_id = ?',
        [repoName, c.community_id],
      );
      const existingLabel = existing[0]?.values?.[0]?.[0] as string | undefined;
      db.run(
        `INSERT OR REPLACE INTO current_code_graph_communities
           (repo_name, community_id, label, name, summary, generated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        [repoName, c.community_id, c.label ?? existingLabel ?? '', c.name, c.summary],
      );
    }
    this.save();
  }

  /**
   * AI 後処理スキル（anytime-reverse-engineer）からコミュニティの name/summary を upsert する。
   * 既存の `upsertCurrentCodeGraphCommunities` は同期サービス用（label 含む全項目を上書き）なので、
   * 命名のみを更新する API として独立。mappings_json は触らないので保持される。
   */
  upsertCurrentCodeGraphCommunitySummaries(
    repoName: string,
    rows: ReadonlyArray<{ communityId: number; name: string; summary: string }>,
  ): { updated: number } {
    const db = this.ensureDb();
    for (const r of rows) {
      db.run(
        `INSERT INTO current_code_graph_communities
           (repo_name, community_id, label, name, summary, generated_at, updated_at)
         VALUES (?, ?, '', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(repo_name, community_id) DO UPDATE SET
           name = excluded.name,
           summary = excluded.summary,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        [repoName, r.communityId, r.name, r.summary],
      );
    }
    this.save();
    return { updated: rows.length };
  }

  /**
   * AI 後処理スキルからコミュニティ別の C4 要素 role マッピングを upsert する。
   * `mappings_json` カラムが未存在の DB（古いスキーマ）では ALTER TABLE で追加する。
   */
  upsertCurrentCodeGraphCommunityMappings(
    repoName: string,
    rows: ReadonlyArray<{
      communityId: number;
      mappings: ReadonlyArray<{ elementId: string; elementType: string; role: 'primary' | 'secondary' | 'dependency' }>;
    }>,
  ): { updated: number; inserted: number } {
    const db = this.ensureDb();

    // mappings_json カラム保証（初回マイグレーション）
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)')[0]?.values ?? [];
    if (!cols.some((c) => String((c as unknown[])[1]) === 'mappings_json')) {
      db.run('ALTER TABLE current_code_graph_communities ADD COLUMN mappings_json TEXT');
    }

    let updated = 0;
    let inserted = 0;
    for (const r of rows) {
      const exists = db.exec(
        'SELECT 1 FROM current_code_graph_communities WHERE repo_name = ? AND community_id = ?',
        [repoName, r.communityId],
      );
      const found = (exists[0]?.values?.length ?? 0) > 0;
      db.run(
        `INSERT INTO current_code_graph_communities
           (repo_name, community_id, label, name, summary, generated_at, updated_at, mappings_json)
         VALUES (?, ?, '', '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
         ON CONFLICT(repo_name, community_id) DO UPDATE SET
           mappings_json = excluded.mappings_json,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        [repoName, r.communityId, JSON.stringify(r.mappings)],
      );
      if (found) updated++;
      else inserted++;
    }
    this.save();
    return { updated, inserted };
  }

  /**
   * 指定リポジトリの全コミュニティ行を返す（label/name/summary/mappings_json 込み）。
   * `mappings_json` カラムが無いスキーマでは null を返す。
   */
  listCurrentCodeGraphCommunities(
    repoName: string,
  ): ReadonlyArray<{
    readonly communityId: number;
    readonly label: string;
    readonly name: string;
    readonly summary: string;
    readonly mappingsJson: string | null;
  }> {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)')[0]?.values ?? [];
    const hasMappings = cols.some((c) => String((c as unknown[])[1]) === 'mappings_json');
    const sql = hasMappings
      ? 'SELECT community_id, label, name, summary, mappings_json FROM current_code_graph_communities WHERE repo_name = ? ORDER BY community_id'
      : 'SELECT community_id, label, name, summary FROM current_code_graph_communities WHERE repo_name = ? ORDER BY community_id';
    const result = db.exec(sql, [repoName]);
    return (result[0]?.values ?? []).map((row) => ({
      communityId: Number(row[0]),
      label: String(row[1] ?? ''),
      name: String(row[2] ?? ''),
      summary: String(row[3] ?? ''),
      mappingsJson: hasMappings ? (row[4] == null ? null : String(row[4])) : null,
    }));
  }

  saveReleaseCodeGraph(tag: string, graph: CodeGraph): void {
    const db = this.ensureDb();
    const { stored, communities } = splitCodeGraph(graph);
    db.run(
      `INSERT OR REPLACE INTO release_code_graphs
         (release_tag, graph_json, generated_at, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [tag, JSON.stringify(stored), stored.generatedAt],
    );
    db.run('DELETE FROM release_code_graph_communities WHERE release_tag = ?', [tag]);
    const stmt = db.prepare(
      `INSERT INTO release_code_graph_communities
         (release_tag, community_id, label, name, summary, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    );
    for (const c of communities) {
      stmt.run([tag, c.id, c.label, c.name, c.summary]);
    }
    stmt.free();
    this.save();
  }

  getReleaseCodeGraph(tag: string): CodeGraph | null {
    const db = this.ensureDb();
    const graphResult = db.exec(
      'SELECT graph_json FROM release_code_graphs WHERE release_tag = ?',
      [tag],
    );
    const json = graphResult[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    const stored = JSON.parse(json) as import('@anytime-markdown/trail-core/codeGraph').StoredCodeGraph;
    const commResult = db.exec(
      'SELECT community_id, label, name, summary FROM release_code_graph_communities WHERE release_tag = ?',
      [tag],
    );
    const communities: StoredCommunity[] = (commResult[0]?.values ?? []).map((row) => ({
      id: row[0] as number,
      label: row[1] as string,
      name: row[2] as string,
      summary: row[3] as string,
    }));
    return composeCodeGraph(stored, communities);
  }

  deleteCurrentCodeGraphs(): void {
    const db = this.ensureDb();
    db.run('DELETE FROM current_code_graph_communities');
    db.run('DELETE FROM current_code_graphs');
    this.save();
  }

  deleteReleaseCodeGraphs(): void {
    const db = this.ensureDb();
    db.run('DELETE FROM release_code_graph_communities');
    db.run('DELETE FROM release_code_graphs');
    this.save();
  }

  analyzeReleaseCodeGraphsForce(opts: {
    codeGraphService: { generate: (onProgress?: (phase: string, percent: number) => void) => Promise<CodeGraph> };
    gitRoot: string;
    onProgress?: (msg: string) => void;
  }): Promise<number> {
    const db = this.ensureDb();
    const releases = this.getReleases();
    if (releases.length === 0) return Promise.resolve(0);

    const git = new ExecFileGitService(opts.gitRoot);
    let count = 0;

    const runNext = async (i: number): Promise<number> => {
      if (i >= releases.length) return count;
      const release = releases[i];
      const tag = release.tag;
      const tmpDir = path.join(os.tmpdir(), `trail-cg-release-${tag.replaceAll('/', '-')}`);
      try {
        opts.onProgress?.(`Generating code graph for release ${tag}...`);
        if (fs.existsSync(tmpDir)) {
          try {
            execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], { cwd: opts.gitRoot, stdio: 'pipe' });
          } catch {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
          }
        }
        const commitHash = git.getTagCommitHash(tag);
        execFileSync('git', ['worktree', 'add', '--detach', tmpDir, commitHash], { cwd: opts.gitRoot, stdio: 'pipe' });
        const worktreeNodeModules = path.join(tmpDir, 'node_modules');
        if (!fs.existsSync(worktreeNodeModules)) {
          fs.symlinkSync(path.join(opts.gitRoot, 'node_modules'), worktreeNodeModules, 'dir');
        }
        const graph = await opts.codeGraphService.generate();
        this.saveReleaseCodeGraph(tag, graph);
        count++;
        opts.onProgress?.(`Release ${tag}: code graph saved`);
      } catch (e) {
        opts.onProgress?.(`Skipping ${tag}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        try {
          execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], { cwd: opts.gitRoot, stdio: 'pipe' });
        } catch {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }
      return runNext(i + 1);
    };
    void db; // db is used via this.ensureDb() in called methods
    return runNext(0);
  }

  /**
   * 互換ラッパー: id='current' なら current_graphs、それ以外は release_graphs から取得する。
   * id='current' の場合、repoName が指定されていればそのリポジトリを、未指定なら最初の1件を返す。
   */
  getTrailGraph(id = 'current', repoName?: string): TrailGraph | null {
    return id === 'current' ? this.getCurrentGraph(repoName) : this.getReleaseGraph(id);
  }

  /**
   * このローカル DB を IC4ModelStore として公開するアダプタを返す。
   * TrailGraph → C4Model 変換（trailToC4）はこのアダプタ内で実行する。
   */
  asC4ModelStore(): IC4ModelStore {
    const db = this;
    return {
      getCurrentC4Model(repoName: string): C4ModelResult | null {
        const graph = db.getCurrentGraph(repoName);
        if (!graph) return null;
        const model = trailToC4(graph);
        const info = db.getCurrentGraphCommit(repoName);
        return { model, commitId: info?.commitId };
      },
      getReleaseC4Model(tag: string): C4ModelResult | null {
        const graph = db.getReleaseGraph(tag);
        if (!graph) return null;
        return { model: trailToC4(graph) };
      },
      getC4ModelEntries(): readonly C4ModelEntry[] {
        return db.getTrailGraphEntries();
      },
    };
  }

  /**
   * 全 current_graphs 行を返す（洗い替え同期用）。
   */
  listCurrentGraphs(): Array<{ repoName: string; commitId: string; graph: TrailGraph }> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT repo_name, commit_id, graph_json FROM current_graphs',
    );
    const rows = result[0]?.values ?? [];
    const out: Array<{ repoName: string; commitId: string; graph: TrailGraph }> = [];
    for (const row of rows) {
      const repoName = String(row[0] ?? '');
      const commitId = String(row[1] ?? '');
      const json = row[2];
      if (typeof json !== 'string') continue;
      try {
        out.push({ repoName, commitId, graph: JSON.parse(json) as TrailGraph });
      } catch (e) {
        this.logger.warn(`listCurrentGraphs: failed to parse graph_json for repo=${repoName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
  }

  /**
   * 直近 windowDays 日に変更されたファイルから時間的結合（Ghost Edge）を計算する。
   * 静的依存ペア（current_graphs.graph_json から抽出）は excludePairs として除外する。
   * directional: true の場合は方向性付き Confidence ベースのエッジを返す。
   */
  fetchTemporalCoupling(options: FetchTemporalCouplingOptions & { directional?: false }): TemporalCouplingEdge[];
  fetchTemporalCoupling(options: FetchTemporalCouplingOptions & { directional: true }): ConfidenceCouplingEdge[];
  fetchTemporalCoupling(
    options: FetchTemporalCouplingOptions,
  ): TemporalCouplingEdge[] | ConfidenceCouplingEdge[] {
    const db = this.ensureDb();
    const {
      repoName,
      windowDays,
      directional = false,
      confidenceThreshold = 0.5,
      directionalDiffThreshold = 0.3,
      granularity = 'commit',
    } = options;

    // 粒度別デフォルト
    const isSession = granularity === 'session';
    const isSubagentType = granularity === 'subagentType';
    // subagentType は集約数が極端に少ない（実用 2〜6 型）。minChangeCount=2 にすると
    // 「2 つ以上の型に跨って触られたファイル」のみが eligible になり、
    // 役割別に専門領域が分かれる典型ケースで eligibleFiles.size<2 短絡 → 0 件となる。
    // そのため minChangeCount=1（すべてのファイルを eligible 化）にし、
    // 各 subagent_type の内部で co-edit ペアを描画する。
    const minChangeCount = options.minChangeCount
      ?? (isSubagentType ? 1 : isSession ? 3 : 5);
    const jaccardThreshold = options.jaccardThreshold
      ?? (isSubagentType ? 0.5 : isSession ? 0.4 : 0.5);
    const topK = options.topK ?? 50;
    // subagentType は 1 型あたり数百〜数千ファイルになる（general-purpose は半年で 500+）。
    // maxFilesPerGroup を絞ると「巨大な役割」が丸ごとスキップされ実質 0 件になる典型ケースを生む。
    // ペア計算は内部 Map で N^2 だが N=2000 なら 2M ペアで in-memory に収まるため Infinity 相当の上限にする。
    const maxFilesPerGroup = isSubagentType ? 5000 : isSession ? 20 : 50;

    const now = new Date();
    const toIso = now.toISOString();
    const fromIso = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const excludePairs = this.buildStaticDependencyPairs(repoName);

    if (isSession) {
      const editToolPlaceholders = SESSION_COUPLING_EDIT_TOOLS.map(() => '?').join(', ');
      const result = db.exec(
        `SELECT mtc.session_id, mtc.file_path
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE mtc.tool_name IN (${editToolPlaceholders})
           AND mtc.file_path IS NOT NULL
           AND mtc.file_path != ''
           AND s.start_time >= ? AND s.start_time <= ?
         ORDER BY mtc.session_id`,
        [...SESSION_COUPLING_EDIT_TOOLS, fromIso, toIso],
      );
      const values = result[0]?.values ?? [];

      // message_tool_calls.file_path は Claude Code の Edit/Write ツール input を
      // そのまま記録するため絶対パス。CodeGraph のノード ID はリポ相対パス前提なので
      // current_graphs.metadata.projectRoot を起点に正規化する。
      //
      // repoName と current_graphs.repo_name の表記が揺れる運用（例: CodeGraph 側は
      // 'Workspace' / TrailDatabase 側はパッケージ名）にも耐えるよう、すべての
      // current_graphs 行から projectRoot を集めて prefix match で相対化する。
      // 短い順（リポルートに近いほうが先）にソートして、`/anytime-markdown/packages/...`
      // のような長いルートよりリポルート側を優先する。
      const projectRootCandidates = Array.from(
        new Set(
          this.listCurrentGraphs()
            .map((g) => g.graph?.metadata?.projectRoot)
            .filter((p): p is string => typeof p === 'string' && p.length > 0),
        ),
      ).sort((a, b) => a.length - b.length);

      const normalize = (raw: string): string | null => {
        if (!raw) return null;
        if (!raw.startsWith('/')) return stripWorktreePrefix(raw);
        for (const root of projectRootCandidates) {
          if (raw === root) continue;
          const prefix = root.endsWith('/') ? root : `${root}/`;
          if (raw.startsWith(prefix)) return stripWorktreePrefix(raw.slice(prefix.length));
        }
        return null; // どの projectRoot にも一致しない → リポ外と判断
      };

      const sessionRows: SessionFileRow[] = [];
      for (const r of values) {
        const sessionId = String(r[0] ?? '');
        const normalized = normalize(String(r[1] ?? ''));
        if (sessionId && normalized) {
          sessionRows.push({ sessionId, filePath: normalized });
        }
      }

      if (directional) {
        return computeSessionConfidenceCoupling(sessionRows, {
          minChangeCount,
          confidenceThreshold,
          directionalDiffThreshold,
          topK,
          maxFilesPerCommit: maxFilesPerGroup,
          excludePairs,
          pathFilter: defaultTemporalCouplingPathFilter,
        });
      }

      return computeSessionCoupling(sessionRows, {
        minChangeCount,
        jaccardThreshold,
        topK,
        maxFilesPerCommit: maxFilesPerGroup,
        excludePairs,
        pathFilter: defaultTemporalCouplingPathFilter,
      });
    }

    if (isSubagentType) {
      // filterBy='session' で TC subagentType の既存挙動（s.start_time でのウィンドウ判定）を維持。
      const activityRows = this.fetchSubagentActivityRows({
        from: fromIso,
        to: toIso,
        toolNames: SESSION_COUPLING_EDIT_TOOLS,
        filterBy: 'session',
      });
      const values: ReadonlyArray<readonly [string, string]> = activityRows.map(
        (r) => [r.subagentType, r.filePath] as const,
      );

      // session 粒度と同じ projectRoot 正規化を適用（mtc.file_path は絶対パス）。
      const projectRootCandidates = Array.from(
        new Set(
          this.listCurrentGraphs()
            .map((g) => g.graph?.metadata?.projectRoot)
            .filter((p): p is string => typeof p === 'string' && p.length > 0),
        ),
      ).sort((a, b) => a.length - b.length);
      const normalize = (raw: string): string | null => {
        if (!raw) return null;
        if (!raw.startsWith('/')) return stripWorktreePrefix(raw);
        for (const root of projectRootCandidates) {
          if (raw === root) continue;
          const prefix = root.endsWith('/') ? root : `${root}/`;
          if (raw.startsWith(prefix)) return stripWorktreePrefix(raw.slice(prefix.length));
        }
        return null;
      };

      const subagentRows: SubagentTypeFileRow[] = [];
      let normalizationDropped = 0;
      for (const r of values) {
        const subagentType = String(r[0] ?? '');
        const rawPath = String(r[1] ?? '');
        const normalized = normalize(rawPath);
        if (subagentType && normalized) {
          subagentRows.push({ subagentType, filePath: normalized });
        } else if (subagentType && rawPath && !normalized) {
          normalizationDropped++;
        }
      }

      // 0 件時の診断: 取得段階で空ならスキーマ/データの欠落、正規化で全部落ちたなら projectRoot ミスマッチ。
      if (subagentRows.length === 0) {
        const totalMessages = (db.exec(
          'SELECT COUNT(*) FROM messages WHERE subagent_type IS NOT NULL',
        )[0]?.values[0]?.[0] ?? 0) as number;
        this.logger.warn(
          `[fetchTemporalCoupling/subagentType] 0 rows. ` +
          `messages.subagent_type populated=${totalMessages}, ` +
          `mtc_join_rows=${values.length}, normalizationDropped=${normalizationDropped}, ` +
          `projectRootCandidates=${projectRootCandidates.length}`,
        );
      } else {
        // edges=0 が「グループのファイル数が多すぎてスキップ」由来かを確認できるよう、
        // 粒度別の生データ件数を残す。maxFilesPerGroup 越えのグループは丸ごと aggregatePairs で除外される。
        const filesPerType = new Map<string, Set<string>>();
        for (const r of subagentRows) {
          let s = filesPerType.get(r.subagentType);
          if (!s) { s = new Set(); filesPerType.set(r.subagentType, s); }
          s.add(r.filePath);
        }
        const summary = Array.from(filesPerType.entries())
          .map(([t, s]) => `${t}=${s.size}${s.size > maxFilesPerGroup ? '(SKIPPED:>maxFilesPerGroup)' : ''}`)
          .join(', ');
        this.logger.info(
          `[fetchTemporalCoupling/subagentType] rows=${subagentRows.length}, ` +
          `maxFilesPerGroup=${maxFilesPerGroup}, normalizationDropped=${normalizationDropped}, ` +
          `groups: ${summary}`,
        );
        // directional は粒度間で Confidence の差を見るので、グループが 1 つしかない場合は
        // 任意のペアで co=count(A)=count(B) → C(A→B)=C(B→A)=1.0 → diff=0 で必ず undirected になる。
        // 矢印が出ない原因が「単一グループ」であることを発見できるよう WARN を出す。
        if (directional && filesPerType.size < 2) {
          this.logger.warn(
            `[fetchTemporalCoupling/subagentType] directional=true だが subagent_type が ${filesPerType.size} 種類しか存在しないため、` +
            `すべてのペアが undirected になり矢印は描画されません。` +
            `期間（windowDays）を伸ばすか、複数の subagent_type を含むデータの取り込みを確認してください。`,
          );
        }
      }

      if (directional) {
        return computeSubagentTypeConfidenceCoupling(subagentRows, {
          minChangeCount,
          confidenceThreshold,
          directionalDiffThreshold,
          topK,
          maxFilesPerCommit: maxFilesPerGroup,
          excludePairs,
          pathFilter: defaultTemporalCouplingPathFilter,
        });
      }

      return computeSubagentTypeCoupling(subagentRows, {
        minChangeCount,
        jaccardThreshold,
        topK,
        maxFilesPerCommit: maxFilesPerGroup,
        excludePairs,
        pathFilter: defaultTemporalCouplingPathFilter,
      });
    }

    // commit 粒度 (Phase 1/2)
    const result = db.exec(
      `SELECT cf.commit_hash, cf.file_path
       FROM commit_files cf
       WHERE cf.commit_hash IN (
         SELECT DISTINCT commit_hash FROM session_commits
         WHERE committed_at >= ? AND committed_at <= ?
       )
       ORDER BY cf.commit_hash`,
      [fromIso, toIso],
    );
    const values = result[0]?.values ?? [];
    const rows: CommitFileRow[] = values.map((r) => ({
      commitHash: String(r[0] ?? ''),
      filePath: String(r[1] ?? ''),
    }));

    if (directional) {
      return computeConfidenceCoupling(rows, {
        minChangeCount,
        confidenceThreshold,
        directionalDiffThreshold,
        topK,
        maxFilesPerCommit: maxFilesPerGroup,
        excludePairs,
        pathFilter: defaultTemporalCouplingPathFilter,
      });
    }

    return computeTemporalCoupling(rows, {
      minChangeCount,
      jaccardThreshold,
      topK,
      maxFilesPerCommit: maxFilesPerGroup,
      excludePairs,
      pathFilter: defaultTemporalCouplingPathFilter,
    });
  }

  fetchDefectRisk(options: FetchDefectRiskOptions & { repo?: string }): DefectRiskEntry[] {
    const db = this.ensureDb();
    const { windowDays, halfLifeDays, repo } = options;
    const now = new Date();
    const toIso = now.toISOString();
    const fromIso = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const sql = repo
      ? `SELECT sc.commit_hash, sc.commit_message, sc.committed_at, cf.file_path
         FROM session_commits sc
         JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
         INNER JOIN sessions s ON s.id = sc.session_id
         WHERE sc.committed_at >= ? AND sc.committed_at <= ?
           AND s.repo_name = ?
         ORDER BY sc.committed_at`
      : `SELECT sc.commit_hash, sc.commit_message, sc.committed_at, cf.file_path
         FROM session_commits sc
         JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
         WHERE sc.committed_at >= ? AND sc.committed_at <= ?
         ORDER BY sc.committed_at`;
    const args = repo ? [fromIso, toIso, repo] : [fromIso, toIso];
    const result = db.exec(sql, args);

    const values = result[0]?.values ?? [];
    const rows: CommitRiskRow[] = values.map((r) => ({
      commitHash: String(r[0] ?? ''),
      commitMessage: String(r[1] ?? ''),
      committedAt: String(r[2] ?? ''),
      filePath: String(r[3] ?? ''),
    })).filter((r) => r.filePath && r.commitHash);

    return computeDefectRisk(rows, { halfLifeDays });
  }

  /**
   * current_graphs.graph_json の import エッジから、ファイル間の静的依存ペアを抽出する。
   * 同一ファイル内のシンボル参照は除外する。
   */
  private buildStaticDependencyPairs(repoName: string): ReadonlyArray<readonly [string, string]> {
    const graph = this.getCurrentGraph(repoName);
    if (!graph) return [];
    const idToFile = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.filePath) idToFile.set(node.id, node.filePath);
    }
    const seen = new Set<string>();
    const pairs: Array<readonly [string, string]> = [];
    for (const edge of graph.edges) {
      const src = idToFile.get(edge.source);
      const tgt = idToFile.get(edge.target);
      if (!src || !tgt || src === tgt) continue;
      const key = src < tgt ? `${src} ${tgt}` : `${tgt} ${src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([src, tgt]);
    }
    return pairs;
  }

  /** current_graphs の commit_id を取得する内部ヘルパ */
  private getCurrentGraphCommit(repoName: string): { commitId: string } | null {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT commit_id FROM current_graphs WHERE repo_name = ?',
      [repoName],
    );
    const commitId = result[0]?.values?.[0]?.[0];
    if (typeof commitId !== 'string') return null;
    return { commitId };
  }

  /**
   * current_graphs と release_graphs に存在する ID の一覧を返す。
   * current 行は一律 'current' として返し、複数リポジトリがある場合は重複する。
   * current を先頭に、残りは released_at の降順。
   */
  getTrailGraphIds(): string[] {
    const db = this.ensureDb();
    const result = db.exec(`
      SELECT id FROM (
        SELECT 'current' AS id, 0 AS sort_order, '' AS released_at
          FROM current_graphs
        UNION ALL
        SELECT rg.tag AS id, 1 AS sort_order, COALESCE(r.released_at, '') AS released_at
          FROM release_graphs rg
          LEFT JOIN releases r ON rg.tag = r.tag
      )
      ORDER BY sort_order, released_at DESC
    `);
    return (result[0]?.values?.map((r) => r[0] as string) ?? []);
  }

  /**
   * current_graphs と release_graphs の { tag, repoName } ペア一覧を返す。
   * current 行は tag='current'、repoName=<repo_name> として全リポジトリ分を返す。
   * current を先頭に、残りは released_at の降順。
   */
  getTrailGraphEntries(): Array<{ tag: string; repoName: string | null }> {
    const db = this.ensureDb();
    const result = db.exec(`
      SELECT tag, repo_name FROM (
        SELECT 'current' AS tag, repo_name AS repo_name, 0 AS sort_order, '' AS released_at
          FROM current_graphs
        UNION ALL
        SELECT rg.tag AS tag, r.repo_name AS repo_name, 1 AS sort_order, COALESCE(r.released_at, '') AS released_at
          FROM release_graphs rg
          LEFT JOIN releases r ON rg.tag = r.tag
      )
      ORDER BY sort_order, released_at DESC
    `);
    return (result[0]?.values?.map((row) => ({
      tag: row[0] as string,
      repoName: (row[1] as string | null) ?? null,
    })) ?? []);
  }

  // -------------------------------------------------------------------------
  //  Queries
  // -------------------------------------------------------------------------

  getSessions(filters?: SessionFilters): SessionRow[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters?.branch) {
      conditions.push('s.id IN (SELECT DISTINCT session_id FROM messages WHERE git_branch = ?)');
      params.push(filters.branch);
    }
    if (filters?.model) {
      conditions.push('s.model = ?');
      params.push(filters.model);
    }
    if (filters?.repository) {
      conditions.push('s.repo_name = ?');
      params.push(filters.repository);
    }
    if (filters?.from) {
      conditions.push('s.start_time >= ?');
      params.push(filters.from);
    }
    if (filters?.to) {
      conditions.push('s.start_time <= ?');
      params.push(filters.to);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const sql = `SELECT s.*,
      COALESCE(SUM(sc.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(sc.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(sc.cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(sc.cache_creation_tokens), 0) AS cache_creation_tokens,
      COALESCE(SUM(sc.estimated_cost_usd), 0) AS estimated_cost_usd
      FROM sessions s
      LEFT JOIN session_costs sc ON s.id = sc.session_id
      ${where}
      GROUP BY s.id
      ORDER BY s.start_time DESC`;

    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: SessionRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRow);
    }
    stmt.free();
    return rows;
  }

  getSessionBranches(sessionIds: readonly string[]): Map<string, string> {
    const result = new Map<string, string>();
    if (sessionIds.length === 0) return result;
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(',');
    const rows = db.exec(
      `SELECT session_id, git_branch FROM messages
       WHERE session_id IN (${placeholders}) AND git_branch IS NOT NULL AND git_branch != ''
       GROUP BY session_id
       ORDER BY MIN(rowid)`,
      sessionIds as string[],
    );
    for (const row of rows[0]?.values ?? []) {
      result.set(String(row[0]), String(row[1]));
    }
    return result;
  }

  getSessionContextStats(sessionIds: readonly string[]): Map<string, { peak: number; initial: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, { peak: number; initial: number }>();

    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      // Peak context per session
      const peakResult = db.exec(
        `SELECT session_id,
          MAX(COALESCE(input_tokens,0) + COALESCE(cache_read_tokens,0) + COALESCE(cache_creation_tokens,0)) AS peak
        FROM messages WHERE session_id IN (${placeholders})
        GROUP BY session_id`,
        sessionIds as string[],
      );
      for (const row of peakResult[0]?.values ?? []) {
        result.set(String(row[0]), { peak: Number(row[1]), initial: 0 });
      }

      // Initial context (first assistant message's cache_creation_tokens per session)
      const initResult = db.exec(
        `SELECT session_id, COALESCE(cache_creation_tokens, 0)
        FROM messages WHERE session_id IN (${placeholders}) AND type = 'assistant'
        GROUP BY session_id
        HAVING timestamp = MIN(timestamp)`,
        sessionIds as string[],
      );
      for (const row of initResult[0]?.values ?? []) {
        const id = String(row[0]);
        const entry = result.get(id);
        if (entry) {
          entry.initial = Number(row[1]);
        } else {
          result.set(id, { peak: 0, initial: Number(row[1]) });
        }
      }
    } catch {
      // Graceful fallback if queries fail
    }

    return result;
  }

  getSessionInterruptions(
    sessionIds: readonly string[],
  ): Map<string, { interrupted: boolean; reason: 'max_tokens' | 'no_response' | null; contextTokens: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, { interrupted: boolean; reason: 'max_tokens' | 'no_response' | null; contextTokens: number }>();
    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      // Get the last message per session (by timestamp desc) and the last assistant message
      const lastMsgResult = db.exec(
        `SELECT session_id, type, stop_reason,
          COALESCE(input_tokens,0) + COALESCE(cache_read_tokens,0) + COALESCE(cache_creation_tokens,0) AS ctx
        FROM messages
        WHERE session_id IN (${placeholders}) AND is_meta = 0
        AND type IN ('user','assistant')
        ORDER BY session_id, timestamp DESC`,
        sessionIds as string[],
      );

      // Group by session_id — first row per session is the last message
      const sessionLastMsg = new Map<string, { type: string; stopReason: string | null; ctx: number }>();
      const sessionLastAssistant = new Map<string, { stopReason: string | null; ctx: number }>();
      for (const row of lastMsgResult[0]?.values ?? []) {
        const sid = String(row[0]);
        const type = String(row[1]);
        const stopReason = row[2] === null ? null : String(row[2]);
        const ctx = Number(row[3]);
        if (!sessionLastMsg.has(sid)) {
          sessionLastMsg.set(sid, { type, stopReason, ctx });
        }
        if (type === 'assistant' && !sessionLastAssistant.has(sid)) {
          sessionLastAssistant.set(sid, { stopReason, ctx });
        }
      }

      for (const sid of sessionIds) {
        const lastMsg = sessionLastMsg.get(sid);
        const lastAssistant = sessionLastAssistant.get(sid);
        if (!lastMsg) continue;

        if (lastAssistant?.stopReason === 'max_tokens') {
          result.set(sid, { interrupted: true, reason: 'max_tokens', contextTokens: lastAssistant.ctx });
        } else if (lastMsg.type === 'user') {
          result.set(sid, {
            interrupted: true,
            reason: 'no_response',
            contextTokens: lastAssistant?.ctx ?? 0,
          });
        }
      }
    } catch {
      // Graceful fallback
    }

    return result;
  }

  getSessionCommitStats(
    sessionIds: readonly string[],
  ): Map<string, { commits: number; linesAdded: number; linesDeleted: number; filesChanged: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, {
      commits: number; linesAdded: number; linesDeleted: number; filesChanged: number;
    }>();
    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      const rows = db.exec(
        `SELECT session_id,
          COUNT(*) AS commits,
          COALESCE(SUM(lines_added), 0) AS lines_added,
          COALESCE(SUM(lines_deleted), 0) AS lines_deleted,
          COALESCE(SUM(files_changed), 0) AS files_changed
        FROM session_commits
        WHERE session_id IN (${placeholders})
        GROUP BY session_id`,
        sessionIds as string[],
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), {
          commits: Number(row[1]),
          linesAdded: Number(row[2]),
          linesDeleted: Number(row[3]),
          filesChanged: Number(row[4]),
        });
      }
    } catch {
      // Graceful fallback
    }

    return result;
  }

  getSessionErrorCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(*) AS error_count
         FROM message_tool_calls
         WHERE is_error = 1 AND session_id IN (${placeholders})
         GROUP BY session_id`,
        sessionIds as string[],
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionSubAgentCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(*) AS sub_agent_count
         FROM message_tool_calls
         WHERE tool_name = 'Agent' AND session_id IN (${placeholders})
         GROUP BY session_id`,
        sessionIds as string[],
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionDistinctAgentIdCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(DISTINCT agent_id) AS agent_count
         FROM messages
         WHERE session_id IN (${placeholders})
           AND agent_id IS NOT NULL
           AND agent_id != ''
         GROUP BY session_id`,
        sessionIds as string[],
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionDelegatedTrackCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, tool_calls
         FROM messages
         WHERE session_id IN (${placeholders})
           AND type = 'assistant'
           AND (agent_id IS NULL OR agent_id = '')
           AND tool_calls IS NOT NULL`,
        sessionIds as string[],
      );
      const tracksBySession = new Map<string, Set<string>>();
      for (const row of rows[0]?.values ?? []) {
        const sid = String(row[0] ?? '');
        const toolCallsJson = typeof row[1] === 'string' ? row[1] : '';
        if (!sid || !toolCallsJson) continue;
        let calls: Array<{ name?: string; input?: Record<string, unknown> }> = [];
        try {
          calls = JSON.parse(toolCallsJson) as Array<{ name?: string; input?: Record<string, unknown> }>;
        } catch {
          continue;
        }
        const agentCall = calls.find((c) => c.name === 'Agent');
        if (!agentCall) continue;
        const subagentType = typeof agentCall.input?.subagent_type === 'string'
          ? agentCall.input.subagent_type
          : 'unknown';
        let set = tracksBySession.get(sid);
        if (!set) {
          set = new Set<string>();
          tracksBySession.set(sid, set);
        }
        set.add(`delegated:${subagentType}`);
      }
      for (const [sid, set] of tracksBySession.entries()) {
        result.set(sid, set.size);
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionCommits(sessionId: string): SessionCommitRow[] {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT * FROM session_commits WHERE session_id = ? ORDER BY committed_at ASC',
    );
    stmt.bind([sessionId]);
    const rows: SessionCommitRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionCommitRow);
    }
    stmt.free();
    return rows;
  }

  insertMessageCommit(input: MessageCommitInput): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO message_commits
        (message_uuid, session_id, commit_hash, detected_at, match_confidence)
        VALUES (?, ?, ?, ?, ?)`,
    );
    try {
      stmt.run([input.messageUuid, input.sessionId, input.commitHash, input.detectedAt, input.matchConfidence]);
    } finally {
      stmt.free();
    }
  }

  markMessageCommitsResolved(sessionId: string, resolvedAt: string): void {
    const db = this.ensureDb();
    const stmt = db.prepare('UPDATE sessions SET message_commits_resolved_at = ? WHERE id = ?');
    try {
      stmt.run([resolvedAt, sessionId]);
    } finally {
      stmt.free();
    }
  }

  isMessageCommitsResolved(sessionId: string): boolean {
    const db = this.ensureDb();
    const result = db.exec('SELECT message_commits_resolved_at FROM sessions WHERE id = ?', [sessionId]);
    const val = result[0]?.values[0]?.[0];
    return typeof val === 'string' && val.length > 0;
  }

  getMessageCommitsBySession(sessionId: string): readonly TrailMessageCommit[] {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT * FROM message_commits WHERE session_id = ? ORDER BY detected_at ASC',
    );
    stmt.bind([sessionId]);
    const rows: TrailMessageCommit[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject() as Record<string, unknown>;
      rows.push({
        messageUuid: r['message_uuid'] as string,
        sessionId: r['session_id'] as string,
        commitHash: r['commit_hash'] as string,
        detectedAt: r['detected_at'] as string,
        matchConfidence: r['match_confidence'] as TrailMessageCommit['matchConfidence'],
      });
    }
    stmt.free();
    return rows;
  }

  getUnresolvedMessageCommitSessions(): readonly { sessionId: string; filePath: string }[] {
    const db = this.ensureDb();
    const result = db.exec(`
      SELECT DISTINCT s.id, s.file_path
      FROM sessions s
      INNER JOIN session_commits sc ON sc.session_id = s.id
      WHERE s.message_commits_resolved_at IS NULL
    `);
    return (result[0]?.values ?? []).map((row) => ({
      sessionId: row[0] as string,
      filePath: row[1] as string,
    }));
  }

  /** Return the set of message UUIDs that executed a git commit Bash command in the session. */
  getGitCommitMessageUuids(sessionId: string): Set<string> {
    const db = this.ensureDb();
    const result = db.exec(
      "SELECT DISTINCT message_uuid FROM message_tool_calls WHERE session_id = ? AND tool_name = 'Bash' AND command LIKE '%git commit%'",
      [sessionId],
    );
    const uuids = new Set<string>();
    if (result[0]) {
      for (const row of result[0].values) {
        if (typeof row[0] === 'string') uuids.add(row[0]);
      }
    }
    return uuids;
  }

  /** Return the set of message UUIDs that had at least one is_error=1 tool call in the session. */
  getErrorMessageUuids(sessionId: string): Set<string> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT DISTINCT message_uuid FROM message_tool_calls WHERE session_id = ? AND is_error = 1',
      [sessionId],
    );
    const uuids = new Set<string>();
    if (result[0]) {
      for (const row of result[0].values) {
        if (typeof row[0] === 'string') uuids.add(row[0]);
      }
    }
    return uuids;
  }

  getSkillsBySession(sessionId: string): Map<string, string> {
    const db = this.ensureDb();
    const map = new Map<string, string>();

    // Primary: message_tool_calls.skill_name (populated for sessions imported after skill column was added)
    const tcResult = db.exec(
      'SELECT message_uuid, skill_name FROM message_tool_calls WHERE session_id = ? AND skill_name IS NOT NULL GROUP BY message_uuid',
      [sessionId],
    );
    if (tcResult[0]) {
      for (const row of tcResult[0].values) {
        const uuid = row[0];
        const skill = row[1];
        if (typeof uuid === 'string' && typeof skill === 'string') {
          map.set(uuid, skill);
        }
      }
    }

    // Fallback: parse messages.tool_calls directly for sessions where skill_name was not backfilled
    const msgResult = db.exec(
      "SELECT uuid, tool_calls FROM messages WHERE session_id = ? AND type = 'assistant' AND tool_calls IS NOT NULL",
      [sessionId],
    );
    if (msgResult[0]) {
      for (const row of msgResult[0].values) {
        const uuid = row[0];
        const toolCallsJson = row[1];
        if (typeof uuid === 'string' && typeof toolCallsJson === 'string' && !map.has(uuid)) {
          const skill = extractSkillName(toolCallsJson);
          if (skill) {
            map.set(uuid, skill);
          }
        }
      }
    }

    return map;
  }

  getTurnExecMsBySession(sessionId: string): Map<string, number> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT message_uuid, turn_exec_ms FROM message_tool_calls WHERE session_id = ? GROUP BY message_uuid',
      [sessionId],
    );
    const map = new Map<string, number>();
    if (result[0]) {
      for (const row of result[0].values) {
        const uuid = row[0];
        const ms = row[1];
        if (typeof uuid === 'string' && typeof ms === 'number' && ms > 0) {
          map.set(uuid, ms);
        }
      }
    }
    const fallback = db.exec(
      `SELECT uuid, type, timestamp, tool_calls, tool_use_result
       FROM messages
       WHERE session_id = ?
       ORDER BY timestamp ASC, uuid ASC`,
      [sessionId],
    );
    const rows = fallback[0]?.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const uuid = row[0];
      const type = row[1];
      const timestamp = row[2];
      const toolCalls = row[3];
      if (typeof uuid !== 'string' || map.has(uuid)) continue;
      if (type !== 'assistant' || typeof timestamp !== 'string' || typeof toolCalls !== 'string') continue;
      const startMs = new Date(timestamp).getTime();
      if (!Number.isFinite(startMs)) continue;
      for (let j = i + 1; j < rows.length; j++) {
        const next = rows[j];
        if (next[1] !== 'user' || typeof next[2] !== 'string' || typeof next[4] !== 'string') continue;
        const endMs = new Date(next[2]).getTime();
        if (Number.isFinite(endMs) && endMs > startMs) {
          map.set(uuid, endMs - startMs);
        }
        break;
      }
    }
    return map;
  }

  getMessages(sessionId: string): MessageRow[] {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
    );
    stmt.bind([sessionId]);

    const rows: MessageRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as MessageRow);
    }
    stmt.free();
    return rows;
  }

  /**
   * 委任 (CC sidechain or codex) を CC 親 assistant UUID から委任先 codex session ID へ解決する。
   * 1セッション分の解決を行うラッパー。バッチ実行は `fetchLinkedCodexSessionMapForCcSessions` を使う。
   */
  getLinkedCodexSessionByAssistantUuid(sessionId: string): Map<string, string> {
    return this.fetchLinkedCodexSessionMapForCcSessions([sessionId]).get(sessionId) ?? new Map();
  }

  getLinkedCodexSessionCount(sessionId: string): number {
    return new Set(this.getLinkedCodexSessionByAssistantUuid(sessionId).values()).size;
  }

  /**
   * 期間 [from, to] 内の Claude Code セッションから委任された codex セッション ID 集合。
   */
  fetchLinkedCodexSessionIdsInRange(from: string, to: string): Set<string> {
    const out = new Set<string>();
    try {
      const db = this.ensureDb();
      const ccRes = db.exec(
        `SELECT id FROM sessions
         WHERE source = 'claude_code'
           AND start_time >= ? AND start_time <= ?`,
        [from, to],
      );
      const ccIds = (ccRes[0]?.values ?? [])
        .map((r) => String(r[0] ?? ''))
        .filter((s) => s.length > 0);
      const linkMap = this.fetchLinkedCodexSessionMapForCcSessions(ccIds);
      for (const m of linkMap.values()) {
        for (const codexId of m.values()) out.add(codexId);
      }
    } catch (e) {
      this.logger.warn(
        `fetchLinkedCodexSessionIdsInRange failed (returning empty set): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return out;
  }

  /**
   * 複数 CC セッションについて `(parent_assistant_uuid → codex_session_id)` Map をバッチ解決する。
   * クエリ数は CC セッション数によらず最大 3。N+1 を避けるための共通実装。
   */
  private fetchLinkedCodexSessionMapForCcSessions(
    ccSessionIds: readonly string[],
  ): Map<string, Map<string, string>> {
    const out = new Map<string, Map<string, string>>();
    if (ccSessionIds.length === 0) return out;
    const db = this.ensureDb();
    const idPlaceholders = ccSessionIds.map(() => '?').join(',');

    type Delegation = { ccSessionId: string; parentUuid: string; ms: number };
    type CodexSess = { id: string; repoName: string; startMs: number; endMs: number };

    const ccRepoRes = db.exec(
      `SELECT id, repo_name FROM sessions WHERE id IN (${idPlaceholders})`,
      ccSessionIds as string[],
    );
    const repoByCcId = new Map<string, string>();
    for (const r of ccRepoRes[0]?.values ?? []) {
      repoByCcId.set(String(r[0] ?? ''), String(r[1] ?? ''));
    }

    const delegRes = db.exec(
      `SELECT session_id, source_tool_assistant_uuid, MIN(timestamp)
       FROM messages
       WHERE session_id IN (${idPlaceholders})
         AND source_tool_assistant_uuid IS NOT NULL
         AND source_tool_assistant_uuid != ''
       GROUP BY session_id, source_tool_assistant_uuid`,
      ccSessionIds as string[],
    );
    const delegationsByCc = new Map<string, Delegation[]>();
    const repoNamesNeeded = new Set<string>();
    for (const r of delegRes[0]?.values ?? []) {
      const ccId = String(r[0] ?? '');
      const parent = String(r[1] ?? '');
      const ts = String(r[2] ?? '');
      const ms = Date.parse(ts);
      if (!ccId || !parent || !Number.isFinite(ms)) continue;
      const list = delegationsByCc.get(ccId) ?? [];
      list.push({ ccSessionId: ccId, parentUuid: parent, ms });
      delegationsByCc.set(ccId, list);
      repoNamesNeeded.add(repoByCcId.get(ccId) ?? '');
    }
    if (delegationsByCc.size === 0) return out;

    const repoFilter = Array.from(repoNamesNeeded).filter((r) => r.length > 0);
    const codexRes = repoFilter.length > 0
      ? db.exec(
          `SELECT id, repo_name, start_time, end_time
           FROM sessions
           WHERE source = 'codex' AND repo_name IN (${repoFilter.map(() => '?').join(',')})
           ORDER BY start_time ASC`,
          repoFilter,
        )
      : db.exec(
          `SELECT id, repo_name, start_time, end_time
           FROM sessions WHERE source = 'codex' ORDER BY start_time ASC`,
        );
    const codexByRepo = new Map<string, CodexSess[]>();
    for (const r of codexRes[0]?.values ?? []) {
      const id = String(r[0] ?? '');
      const repo = String(r[1] ?? '');
      const startMs = Date.parse(String(r[2] ?? ''));
      const endMs = Date.parse(String(r[3] ?? ''));
      if (!id || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      const list = codexByRepo.get(repo) ?? [];
      list.push({ id, repoName: repo, startMs, endMs });
      codexByRepo.set(repo, list);
    }

    for (const [ccId, delegations] of delegationsByCc) {
      const repo = repoByCcId.get(ccId) ?? '';
      const candidates = codexByRepo.get(repo) ?? [];
      if (candidates.length === 0) continue;
      const m = new Map<string, string>();
      for (const d of delegations) {
        const matched = matchCodexSessionByTime(d.ms, candidates);
        if (matched) m.set(d.parentUuid, matched);
      }
      if (m.size > 0) out.set(ccId, m);
    }
    return out;
  }

  /**
   * subagent 粒度の集計で使用する活動行を返す共通関数。
   * - 経路 A (CC ネイティブ subagent): `messages.subagent_type IS NOT NULL` の編集行
   * - 経路 B (codex 委任): `sessions.source='codex'` かつ範囲内 CC から委任された session の編集行
   *   → `subagentType` ラベルとして `'codex'` を合成
   *
   * `filterBy`:
   *   - `'message'` (default): `m.timestamp` で範囲フィルタ。Heatmap/Trend/Hotspot 用
   *   - `'session'`: `s.start_time` で範囲フィルタ。TC subagentType 既存挙動互換
   *
   * 戻り値は `committedAt` (= messages.timestamp) でソート済み。
   */
  fetchSubagentActivityRows(params: {
    from: string;
    to: string;
    toolNames: readonly string[];
    filterBy?: 'message' | 'session';
    repo?: string;
  }): ReadonlyArray<{
    readonly committedAt: string;
    readonly filePath: string;
    readonly subagentType: string;
    readonly sessionId: string;
    readonly messageUuid: string;
  }> {
    const db = this.ensureDb();
    const { from, to, toolNames, filterBy = 'message', repo } = params;
    if (toolNames.length === 0) return [];

    const toolPlaceholders = toolNames.map(() => '?').join(',');
    const rows: Array<{
      committedAt: string;
      filePath: string;
      subagentType: string;
      sessionId: string;
      messageUuid: string;
    }> = [];

    // session JOIN は filterBy='session' または repo 指定時に必要
    const needsSessionJoin = filterBy === 'session' || !!repo;
    const rangeJoin = needsSessionJoin
      ? 'INNER JOIN sessions s ON s.id = m.session_id'
      : '';
    const rangeWhere = filterBy === 'session'
      ? 's.start_time >= ? AND s.start_time <= ?'
      : 'm.timestamp >= ? AND m.timestamp <= ?';
    const repoFilter = repo ? 'AND s.repo_name = ?' : '';
    const repoArg = repo ? [repo] : [];

    // 経路 A: CC ネイティブ subagent
    try {
      const resA = db.exec(
        `SELECT m.timestamp, mtc.file_path, m.subagent_type, m.session_id, m.uuid
         FROM message_tool_calls mtc
         INNER JOIN messages m ON m.uuid = mtc.message_uuid
         ${rangeJoin}
         WHERE ${rangeWhere}
           ${repoFilter}
           AND mtc.tool_name IN (${toolPlaceholders})
           AND mtc.file_path IS NOT NULL
           AND mtc.file_path != ''
           AND m.subagent_type IS NOT NULL`,
        [from, to, ...repoArg, ...toolNames],
      );
      for (const row of resA[0]?.values ?? []) {
        const subagentType = String(row[2] ?? '');
        if (!subagentType) continue;
        rows.push({
          committedAt: String(row[0] ?? ''),
          filePath: String(row[1] ?? ''),
          subagentType,
          sessionId: String(row[3] ?? ''),
          messageUuid: String(row[4] ?? ''),
        });
      }
    } catch (e) {
      this.logger.warn(
        `fetchSubagentActivityRows path A (cc subagent) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 経路 B: codex 委任セッション（同一 repo + 時刻近傍でリンク済）
    const codexSessionIds = this.fetchLinkedCodexSessionIdsInRange(from, to);
    if (codexSessionIds.size > 0) {
      try {
        const idList = Array.from(codexSessionIds);
        const idPlaceholders = idList.map(() => '?').join(',');
        const resB = db.exec(
          `SELECT m.timestamp, mtc.file_path, m.session_id, m.uuid
           FROM message_tool_calls mtc
           INNER JOIN messages m ON m.uuid = mtc.message_uuid
           ${rangeJoin}
           WHERE ${rangeWhere}
             ${repoFilter}
             AND mtc.tool_name IN (${toolPlaceholders})
             AND mtc.file_path IS NOT NULL
             AND mtc.file_path != ''
             AND m.session_id IN (${idPlaceholders})`,
          [from, to, ...repoArg, ...toolNames, ...idList],
        );
        for (const row of resB[0]?.values ?? []) {
          rows.push({
            committedAt: String(row[0] ?? ''),
            filePath: String(row[1] ?? ''),
            subagentType: CODEX_SUBAGENT_TYPE,
            sessionId: String(row[2] ?? ''),
            messageUuid: String(row[3] ?? ''),
          });
        }
      } catch (e) {
        this.logger.warn(
          `fetchSubagentActivityRows path B (codex linked) failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    rows.sort((a, b) => (a.committedAt < b.committedAt ? -1 : a.committedAt > b.committedAt ? 1 : 0));
    return rows;
  }

  searchMessages(query: string): SearchResult[] {
    const db = this.ensureDb();
    const pattern = `%${query}%`;
    const sql = `SELECT session_id, uuid, type, timestamp,
      COALESCE(
        SUBSTR(text_content, MAX(1, INSTR(LOWER(text_content), LOWER(?)) - 30), 80),
        SUBSTR(user_content, MAX(1, INSTR(LOWER(user_content), LOWER(?)) - 30), 80),
        ''
      ) AS snippet
      FROM messages
      WHERE text_content LIKE ? OR user_content LIKE ? OR tool_calls LIKE ?
      ORDER BY timestamp DESC
      LIMIT 100`;

    const stmt = db.prepare(sql);
    stmt.bind([query, query, pattern, pattern, pattern]);

    const results: SearchResult[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as SearchResult);
    }
    stmt.free();
    return results;
  }

  getLastImportedAt(): string | null {
    this.ensureDb();
    const result = this.db!.exec(
      `SELECT MAX(imported_at) as last_imported FROM sessions`,
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const value = result[0].values[0][0];
    return value ? String(value) : null;
  }

  getStats(): DbStats {
    const db = this.ensureDb();

    // Totals
    const totals = db.exec(
      `SELECT COUNT(*) as cnt,
        COALESCE(SUM(input_tokens), 0) as ti,
        COALESCE(SUM(output_tokens), 0) as to2
      FROM sessions`,
    );
    const totalRow = totals[0]?.values[0] ?? [0, 0, 0];

    // Top tool names from messages
    const toolsSql = `SELECT jt.value AS name, COUNT(*) AS cnt
      FROM messages, json_each(
        (SELECT group_concat(json_extract(je.value, '$.name'))
         FROM json_each(tool_calls) AS je)
      ) AS jt
      WHERE tool_calls IS NOT NULL
      GROUP BY jt.value
      ORDER BY cnt DESC
      LIMIT 10`;

    let topToolNames: { name: string; count: number }[] = [];
    try {
      const toolResult = db.exec(toolsSql);
      if (toolResult[0]) {
        topToolNames = toolResult[0].values.map((r) => ({
          name: String(r[0]),
          count: Number(r[1]),
        }));
      }
    } catch {
      // FTS or json functions may not be available
    }

    // Sessions per branch
    const branchResult = db.exec(
      `SELECT git_branch, COUNT(*) as cnt FROM sessions
       WHERE git_branch != '' GROUP BY git_branch ORDER BY cnt DESC`,
    );
    const sessionsByBranch = (branchResult[0]?.values ?? []).map((r) => ({
      branch: String(r[0]),
      count: Number(r[1]),
    }));

    // Sessions per model
    const modelResult = db.exec(
      `SELECT model, COUNT(*) as cnt FROM sessions
       WHERE model != '' GROUP BY model ORDER BY cnt DESC`,
    );
    const sessionsByModel = (modelResult[0]?.values ?? []).map((r) => ({
      model: String(r[0]),
      count: Number(r[1]),
    }));

    return {
      totalSessions: Number(totalRow[0]),
      totalInputTokens: Number(totalRow[1]),
      totalOutputTokens: Number(totalRow[2]),
      topToolNames,
      sessionsByBranch,
      sessionsByModel,
    };
  }

  /**
   * Compute tool-call-based metrics (Retry Rate, Build/Test Fail Rate).
   * If sessionId is provided, scopes to that session only.
   */
  computeToolMetrics(sessionId?: string): {
    totalRetries: number;
    totalEdits: number;
    totalBuildRuns: number;
    totalBuildFails: number;
    totalTestRuns: number;
    totalTestFails: number;
    toolUsage?: readonly { tool: string; count: number; tokens: number; durationMs: number }[];
    skillUsage?: readonly { skill: string; count: number; tokens: number; durationMs: number }[];
    errorsByTool?: { tool: string; count: number }[];
    modelUsage?: { model: string; count: number; tokens: number; durationMs: number }[];
  } {
    const zero = {
      totalRetries: 0, totalEdits: 0,
      totalBuildRuns: 0, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
    };
    try {
      const db = this.ensureDb();

      // Global metrics: use pre-computed message_tool_calls instead of parsing message JSON
      if (!sessionId) {
        const editRes = db.exec(
          `SELECT COUNT(*) FROM message_tool_calls WHERE tool_name IN ('Edit', 'Write')`,
        );
        const totalEdits = Number(editRes[0]?.values[0]?.[0] ?? 0);

        const retryRes = db.exec(
          `SELECT COALESCE(SUM(edit_count - 1), 0)
           FROM (
             SELECT COUNT(*) AS edit_count
             FROM message_tool_calls
             WHERE tool_name IN ('Edit', 'Write') AND file_path IS NOT NULL AND file_path != ''
             GROUP BY session_id, file_path
             HAVING COUNT(*) > 1
           )`,
        );
        const totalRetries = Number(retryRes[0]?.values[0]?.[0] ?? 0);

        const buildRes = db.exec(
          `SELECT COUNT(*), COALESCE(SUM(is_error), 0)
           FROM message_tool_calls
           WHERE tool_name = 'Bash' AND (
             command LIKE '%npm run build%' OR command LIKE '%npx tsc%' OR
             command LIKE '% tsc %' OR command LIKE '% tsc' OR command LIKE 'tsc %' OR
             command LIKE '%webpack%' OR command LIKE '%vite build%' OR
             command LIKE '%esbuild%' OR command LIKE '%rollup%'
           )`,
        );
        const totalBuildRuns = Number(buildRes[0]?.values[0]?.[0] ?? 0);
        const totalBuildFails = Number(buildRes[0]?.values[0]?.[1] ?? 0);

        const testRes = db.exec(
          `SELECT COUNT(*), COALESCE(SUM(is_error), 0)
           FROM message_tool_calls
           WHERE tool_name = 'Bash' AND (
             command LIKE '%jest%' OR command LIKE '%vitest%' OR
             command LIKE '%npm run test%' OR command LIKE '%npm test%'
           )`,
        );
        const totalTestRuns = Number(testRes[0]?.values[0]?.[0] ?? 0);
        const totalTestFails = Number(testRes[0]?.values[0]?.[1] ?? 0);

        return { totalRetries, totalEdits, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails };
      }

      // Session-specific path: fetch messages with tool_calls for per-session detail
      const result = db.exec(
        `SELECT m1.session_id, m1.tool_calls, m2.tool_use_result
         FROM messages m1
         LEFT JOIN messages m2
           ON m2.parent_uuid = m1.uuid AND m2.tool_use_result IS NOT NULL
         WHERE m1.session_id = ? AND m1.tool_calls IS NOT NULL`,
        [sessionId],
      );
      if (!result[0]) return zero;

      const BUILD_RE = /\b(npm run build|npx tsc|tsc\b|webpack|vite build|esbuild|rollup)\b/;
      const TEST_RE = /\b(jest|vitest|npm run test|npm test|npx jest)\b/;
      const FAIL_RE = /ERR!|exit code [1-9]|non-zero exit|Command failed/i;

      let totalEdits = 0;
      let totalRetries = 0;
      let totalBuildRuns = 0;
      let totalBuildFails = 0;
      let totalTestRuns = 0;
      let totalTestFails = 0;

      // Track Edit file paths per session for retry detection
      const editsBySession = new Map<string, Map<string, number>>();

      for (const row of result[0].values) {
        const sessId = String(row[0]);
        const toolCallsJson = String(row[1]);
        const toolResultStr = row[2] != null ? String(row[2]) : null;

        let calls: { name: string; input: Record<string, unknown> }[];
        try {
          calls = JSON.parse(toolCallsJson);
        } catch {
          continue;
        }
        if (!Array.isArray(calls)) continue;

        for (const call of calls) {
          if (call.name === 'Edit' || call.name === 'Write') {
            totalEdits++;
            const filePath = typeof call.input?.file_path === 'string'
              ? call.input.file_path : '';
            if (filePath) {
              let fileMap = editsBySession.get(sessId);
              if (!fileMap) {
                fileMap = new Map();
                editsBySession.set(sessId, fileMap);
              }
              fileMap.set(filePath, (fileMap.get(filePath) ?? 0) + 1);
            }
          }

          if (call.name === 'Bash') {
            const cmd = typeof call.input?.command === 'string'
              ? call.input.command : '';
            const isFailed = toolResultStr != null && FAIL_RE.test(toolResultStr);

            if (BUILD_RE.test(cmd)) {
              totalBuildRuns++;
              if (isFailed) totalBuildFails++;
            }
            if (TEST_RE.test(cmd)) {
              totalTestRuns++;
              if (isFailed) totalTestFails++;
            }
          }
        }
      }

      // Count retries: for each session, files edited 2+ times contribute
      // (editCount - 1) retries per file
      for (const fileMap of editsBySession.values()) {
        for (const count of fileMap.values()) {
          if (count > 1) {
            totalRetries += count - 1;
          }
        }
      }

      // セッション指定時のみツール別利用統計を集計
      let toolUsage: readonly { tool: string; count: number; tokens: number; durationMs: number }[] | undefined;
      if (sessionId) {
        toolUsage = this.aggregateToolUsageBySession(sessionId);
      }

      // スキル別利用統計
      let skillUsage: readonly { skill: string; count: number; tokens: number; durationMs: number }[] | undefined;
      if (sessionId) {
        skillUsage = this.aggregateSkillUsageBySession(sessionId);
      }

      // モデル別利用統計: count/tokens は assistant メッセージから、durationMs は distinct turn_exec_ms から集計
      let modelUsage: { model: string; count: number; tokens: number; durationMs: number }[] | undefined;
      if (sessionId) {
        const mdResult = db.exec(
          `SELECT model,
                  COUNT(*) AS count,
                  CAST(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS INTEGER) AS tokens
           FROM messages
           WHERE session_id = ? AND type = 'assistant' AND model IS NOT NULL
           GROUP BY model ORDER BY count DESC`,
          [sessionId],
        );
        const durResult = db.exec(
          `WITH turn_dur AS (
             SELECT DISTINCT session_id, turn_index, model, turn_exec_ms
             FROM message_tool_calls
             WHERE session_id = ? AND model IS NOT NULL
           )
           SELECT model, CAST(SUM(COALESCE(turn_exec_ms, 0)) AS INTEGER) AS duration_ms
           FROM turn_dur GROUP BY model`,
          [sessionId],
        );
        const durMap = new Map<string, number>();
        if (durResult[0]) {
          const cols = durResult[0].columns;
          for (const row of durResult[0].values) {
            const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
            durMap.set(String(r['model'] ?? ''), Number(r['duration_ms'] ?? 0));
          }
        }
        if (mdResult[0]) {
          const cols = mdResult[0].columns;
          modelUsage = mdResult[0].values.map(row => {
            const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
            const model = String(r['model'] ?? '');
            return {
              model,
              count: Number(r['count'] ?? 0),
              tokens: Number(r['tokens'] ?? 0),
              durationMs: durMap.get(model) ?? 0,
            };
          });
        }
      }

      // ツール別エラー回数（MCP 正規化）
      let errorsByTool: { tool: string; count: number }[] | undefined;
      if (sessionId) {
        const erResult = db.exec(
          `SELECT CASE
                    WHEN tool_name LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
                    THEN SUBSTR(tool_name, 1, INSTR(SUBSTR(tool_name, 6), '__') + 4)
                    ELSE tool_name
                  END AS tool,
                  COUNT(*) AS count
           FROM message_tool_calls
           WHERE session_id = ? AND is_error = 1
           GROUP BY tool
           ORDER BY count DESC`,
          [sessionId],
        );
        if (erResult[0]) {
          const cols = erResult[0].columns;
          errorsByTool = erResult[0].values.map(row => {
            const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
            return { tool: String(r['tool'] ?? ''), count: Number(r['count'] ?? 0) };
          });
        }
      }

      return {
        totalRetries, totalEdits,
        totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
        toolUsage,
        skillUsage,
        errorsByTool,
        modelUsage,
      };
    } catch {
      return zero;
    }
  }

  /**
   * 指定日の tool/skill/error/model 利用統計を daily_counts から集計して返す。
   * Activity タブで日付バーを選択した直後に表示する右側パネル用。
   */
  getDayToolMetrics(date: string): {
    totalRetries: number;
    totalEdits: number;
    totalBuildRuns: number;
    totalBuildFails: number;
    totalTestRuns: number;
    totalTestFails: number;
    toolUsage: { tool: string; count: number; tokens: number; durationMs: number }[];
    skillUsage: { skill: string; count: number; tokens: number; durationMs: number }[];
    errorsByTool: { tool: string; count: number }[];
    modelUsage: { model: string; count: number; tokens: number; durationMs: number }[];
  } | null {
    try {
      const db = this.ensureDb();

      const editRes = db.exec(
        `SELECT COUNT(*) FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name IN ('Edit', 'Write')`,
        [date],
      );
      const totalEdits = Number(editRes[0]?.values[0]?.[0] ?? 0);

      const retryRes = db.exec(
        `SELECT COALESCE(SUM(edit_count - 1), 0)
         FROM (
           SELECT COUNT(*) AS edit_count
           FROM message_tool_calls mtc
           JOIN sessions s ON s.id = mtc.session_id
           WHERE DATE(s.start_time, '+540 minutes') = ?
             AND mtc.tool_name IN ('Edit', 'Write') AND mtc.file_path IS NOT NULL AND mtc.file_path != ''
           GROUP BY mtc.session_id, mtc.file_path HAVING COUNT(*) > 1
         )`,
        [date],
      );
      const totalRetries = Number(retryRes[0]?.values[0]?.[0] ?? 0);

      const buildRes = db.exec(
        `SELECT COUNT(*), COALESCE(SUM(mtc.is_error), 0)
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name = 'Bash' AND (
           mtc.command LIKE '%npm run build%' OR mtc.command LIKE '%npx tsc%' OR
           mtc.command LIKE '% tsc %' OR mtc.command LIKE '% tsc' OR mtc.command LIKE 'tsc %' OR
           mtc.command LIKE '%webpack%' OR mtc.command LIKE '%vite build%' OR
           mtc.command LIKE '%esbuild%' OR mtc.command LIKE '%rollup%'
         )`,
        [date],
      );
      const totalBuildRuns = Number(buildRes[0]?.values[0]?.[0] ?? 0);
      const totalBuildFails = Number(buildRes[0]?.values[0]?.[1] ?? 0);

      const testRes = db.exec(
        `SELECT COUNT(*), COALESCE(SUM(mtc.is_error), 0)
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name = 'Bash' AND (
           mtc.command LIKE '%jest%' OR mtc.command LIKE '%vitest%' OR
           mtc.command LIKE '%npm run test%' OR mtc.command LIKE '%npm test%'
         )`,
        [date],
      );
      const totalTestRuns = Number(testRes[0]?.values[0]?.[0] ?? 0);
      const totalTestFails = Number(testRes[0]?.values[0]?.[1] ?? 0);

      // tool/skill: session start_time 基準（errorsByTool と同スコープ）
      const toolRows = this.aggregateByDayInternal(date, 'tool_name', false);
      const toolMap = new Map<string, { count: number; tokens: number; durationMs: number }>(
        toolRows.map((r) => [r.key, { count: r.count, tokens: r.tokens, durationMs: r.durationMs }]),
      );

      const skillRows = this.aggregateByDayInternal(date, 'skill_name', true);
      const skillMap = new Map<string, { count: number; tokens: number; durationMs: number }>(
        skillRows.map((r) => [r.key, { count: r.count, tokens: r.tokens, durationMs: r.durationMs }]),
      );

      // model: session start_time 基準
      const modelResult = db.exec(
        `SELECT COALESCE(m.model, '') AS model, s.source,
                COUNT(*) AS count,
                CAST(SUM(COALESCE(m.input_tokens, 0) + COALESCE(m.output_tokens, 0)) AS INTEGER) AS tokens
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND m.type = 'assistant'
         GROUP BY COALESCE(m.model, ''), s.source`,
        [date],
      );
      const modelMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
      for (const row of modelResult[0]?.values ?? []) {
        const source = String(row[1] ?? '') as PricingSource;
        const model = resolvePricingModelName(String(row[0] ?? ''), source);
        const count = Number(row[2] ?? 0);
        const tokens = Number(row[3] ?? 0);
        const e = modelMap.get(model) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += count;
        e.tokens += tokens;
        modelMap.set(model, e);
      }

      // errorsByTool: session start_time 基準で集計（セッション一覧の errorCount と同じスコープ）
      const errResult = db.exec(
        `SELECT CASE
                  WHEN mtc.tool_name LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
                  THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                  ELSE mtc.tool_name
                END AS tool,
                COUNT(*) AS count
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.is_error = 1
         GROUP BY tool
         ORDER BY count DESC`,
        [date],
      );
      const errMap = new Map<string, number>();
      for (const row of errResult[0]?.values ?? []) {
        const tool = String(row[0] ?? '');
        const count = Number(row[1] ?? 0);
        errMap.set(tool, (errMap.get(tool) ?? 0) + count);
      }

      return {
        totalRetries, totalEdits, totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
        toolUsage: [...toolMap.entries()].map(([tool, e]) => ({ tool, ...e })).sort((a, b) => b.count - a.count),
        skillUsage: [...skillMap.entries()].map(([skill, e]) => ({ skill, ...e })).sort((a, b) => b.count - a.count),
        errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
        modelUsage: [...modelMap.entries()].map(([model, e]) => ({ model, ...e })).sort((a, b) => b.count - a.count),
      };
    } catch (e) {
      this.logger.error(`getDayToolMetrics failed for date=${date}`, e);
      return null;
    }
  }

  getAnalytics(): AnalyticsData {
    const db = this.ensureDb();

    // Token totals from messages with source-aware missing-rate compensation
    const tzOffset = this.getLocalTzOffset();
    const tokensBySourceResult = db.exec(
      `SELECT s.source,
        SUM(COALESCE(m.input_tokens,0)) AS raw_input,
        SUM(COALESCE(m.output_tokens,0)) AS raw_output,
        SUM(COALESCE(m.cache_read_tokens,0)) AS raw_cache_read,
        SUM(COALESCE(m.cache_creation_tokens,0)) AS raw_cache_creation,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY s.source`,
    );
    const factorBySource = new Map<string, number>();
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
    for (const row of tokensBySourceResult[0]?.values ?? []) {
      const source = String(row[0] ?? '');
      const rawInput = Number(row[1]);
      const rawOutput = Number(row[2]);
      const rawCacheRead = Number(row[3]);
      const rawCacheCreation = Number(row[4]);
      const totalTurns = Number(row[5]);
      const missingTurns = Number(row[6]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      factorBySource.set(source, factor);
      totalInput += Math.round(rawInput * factor);
      totalOutput += Math.round(rawOutput * factor);
      totalCacheRead += Math.round(rawCacheRead * factor);
      totalCacheCreation += Math.round(rawCacheCreation * factor);
    }
    // Estimated cost from session_costs with source factor
    const costBySourceResult = db.exec(
      `SELECT s.source, COALESCE(SUM(sc.estimated_cost_usd), 0)
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       GROUP BY s.source`,
    );
    let totalEstimatedCost = 0;
    for (const row of costBySourceResult[0]?.values ?? []) {
      const source = String(row[0] ?? '');
      const rawCost = Number(row[1]);
      const factor = factorBySource.get(source) ?? 1;
      totalEstimatedCost += rawCost * factor;
    }
    const totalSessions = Number(db.exec(`SELECT COUNT(*) FROM sessions`)[0]?.values[0]?.[0] ?? 0);

    // Tool usage TOP 15
    const toolsSql = `SELECT jt.value AS name, COUNT(*) AS cnt
      FROM messages, json_each(
        (SELECT group_concat(json_extract(je.value, '$.name'))
         FROM json_each(tool_calls) AS je)
      ) AS jt
      WHERE tool_calls IS NOT NULL
      GROUP BY jt.value
      ORDER BY cnt DESC
      LIMIT 15`;

    let toolUsage: { name: string; count: number }[] = [];
    try {
      const toolResult = db.exec(toolsSql);
      if (toolResult[0]) {
        toolUsage = toolResult[0].values.map((r) => ({
          name: String(r[0]),
          count: Number(r[1]),
        }));
      }
    } catch {
      // json functions may not be available
    }

    // Daily activity from messages — grouped by session start_time date (same basis as session list)
    const dailyMsgResult = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS date,
        s.source,
        SUM(COALESCE(m.input_tokens,0)) AS raw_input,
        SUM(COALESCE(m.output_tokens,0)) AS raw_output,
        SUM(COALESCE(m.cache_read_tokens,0)) AS raw_cache_read,
        SUM(COALESCE(m.cache_creation_tokens,0)) AS raw_cache_creation,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, s.source
       ORDER BY date`,
    );
    const dailyCostResult = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS date,
        s.source, COALESCE(SUM(sc.estimated_cost_usd), 0)
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, s.source`,
    );
    type DailyEntry = { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; estimatedCostUsd: number; commits: number; linesAdded: number; linesDeleted: number };
    const dailyMap = new Map<string, DailyEntry>();
    for (const row of dailyMsgResult[0]?.values ?? []) {
      const date = String(row[0]);
      const source = String(row[1] ?? '');
      const rawInput = Number(row[2]);
      const rawOutput = Number(row[3]);
      const rawCacheRead = Number(row[4]);
      const rawCacheCreation = Number(row[5]);
      const totalTurns = Number(row[6]);
      const missingTurns = Number(row[7]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.inputTokens += Math.round(rawInput * factor);
      entry.outputTokens += Math.round(rawOutput * factor);
      entry.cacheReadTokens += Math.round(rawCacheRead * factor);
      entry.cacheCreationTokens += Math.round(rawCacheCreation * factor);
      dailyMap.set(date, entry);
    }
    for (const row of dailyCostResult[0]?.values ?? []) {
      const date = String(row[0]);
      const source = String(row[1] ?? '');
      const rawCost = Number(row[2]);
      const factor = factorBySource.get(source) ?? 1;
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.estimatedCostUsd += rawCost * factor;
      dailyMap.set(date, entry);
    }

    // Sessions, Commits, LOC daily breakdown
    const dailyStatsResult = db.exec(
      `SELECT date,
              SUM(sessions) AS sessions,
              SUM(commits) AS commits,
              SUM(loc_added) AS loc_added,
              SUM(loc_deleted) AS loc_deleted
       FROM (
         SELECT DATE(start_time, '${tzOffset}') AS date, COUNT(*) AS sessions, 0 AS commits, 0 AS loc_added, 0 AS loc_deleted
         FROM sessions WHERE start_time != '' GROUP BY date
         UNION ALL
         SELECT date, 0 AS sessions, SUM(commit_count) AS commits, SUM(lines_added) AS loc_added, SUM(lines_deleted) AS loc_deleted
         FROM (
           SELECT DATE(s.start_time, '${tzOffset}') AS date,
                  COUNT(*) AS commit_count,
                  SUM(COALESCE(sc.lines_added, 0)) AS lines_added,
                  SUM(COALESCE(sc.lines_deleted, 0)) AS lines_deleted
           FROM session_commits sc
           JOIN sessions s ON sc.session_id = s.id
           WHERE sc.committed_at != '' AND s.start_time != ''
           GROUP BY s.id
         )
         GROUP BY date
       )
       WHERE date >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date`,
    );
    for (const row of dailyStatsResult[0]?.values ?? []) {
      const date = String(row[0]);
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.sessions += Number(row[1]);
      entry.commits += Number(row[2]);
      entry.linesAdded += Number(row[3]);
      entry.linesDeleted += Number(row[4]);
      dailyMap.set(date, entry);
    }

    const dailyActivity = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Commit totals
    const commitTotals = db.exec(
      `SELECT COUNT(*) AS total_commits,
        COALESCE(SUM(lines_added), 0) AS total_lines_added,
        COALESCE(SUM(lines_deleted), 0) AS total_lines_deleted
      FROM (
        SELECT repo_name, commit_hash, MAX(COALESCE(lines_added, 0)) AS lines_added, MAX(COALESCE(lines_deleted, 0)) AS lines_deleted
        FROM session_commits GROUP BY repo_name, commit_hash
      )`,
    );
    const cr = commitTotals[0]?.values[0] ?? [0, 0, 0];
    const totalCommits = Number(cr[0]);
    const totalLinesAdded = Number(cr[1]);
    const totalLinesDeleted = Number(cr[2]);

    // AI-assisted commits + files changed
    const aiCommitResult = db.exec(
      `SELECT COALESCE(SUM(CASE WHEN is_ai_assisted = 1 THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(files_changed), 0)
       FROM session_commits`,
    );
    const acr = aiCommitResult[0]?.values[0] ?? [0, 0];
    const totalAiAssistedCommits = Number(acr[0]);
    const totalFilesChanged = Number(acr[1]);

    // Total session duration
    const durationResult = db.exec(
      `SELECT COALESCE(SUM(
        (julianday(end_time) - julianday(start_time)) * 86400000
      ), 0)
       FROM sessions
       WHERE start_time != '' AND end_time != ''`,
    );
    const totalSessionDurationMs = Number(
      durationResult[0]?.values[0]?.[0] ?? 0,
    );

    // Current total LOC from current_coverage
    const locResult = db.exec(`SELECT COALESCE(SUM(lines_total), 0) FROM current_coverage`);
    const totalLoc = Number(locResult[0]?.values[0]?.[0] ?? 0);

    // Tool-call-based metrics (Retry Rate, Build/Test Fail Rate)
    const toolMetrics = this.computeToolMetrics();

    return {
      totals: {
        sessions: totalSessions,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreation,
        estimatedCostUsd: totalEstimatedCost,
        totalCommits,
        totalLinesAdded,
        totalLinesDeleted,
        totalFilesChanged,
        totalAiAssistedCommits,
        totalSessionDurationMs,
        totalLoc,
        ...toolMetrics,
      },
      toolUsage,
      dailyActivity,
    };
  }

  getCombinedData(period: 'day' | 'week', rangeDays: 30 | 90): CombinedData {
    const db = this.ensureDb();
    // daily_counts.date は YYYY-MM-DD（タイムゾーン適用済み）。
    // week 集計時は strftime('%Y-W%W', date) で週キー化。
    const periodExpr = period === 'week' ? `strftime('%Y-W%W', date)` : 'date';
    const cutoff = `DATE('now', '-${rangeDays} days')`;
    const tzOffset = this.getLocalTzOffset();
    const messagePeriodExpr = period === 'week'
      ? `strftime('%Y-W%W', m.timestamp, '${tzOffset}')`
      : `DATE(m.timestamp, '${tzOffset}')`;
    const sessionStartPeriodExpr = period === 'week'
      ? `strftime('%Y-W%W', s.start_time, '${tzOffset}')`
      : `DATE(s.start_time, '${tzOffset}')`;
    const commitPeriodExpr = period === 'week'
      ? `strftime('%Y-W%W', committed_at, '${tzOffset}')`
      : `DATE(committed_at, '${tzOffset}')`;

    const toRows = (result: ReturnType<typeof db.exec>): Record<string, unknown>[] => {
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    };

    const toolRawRows = this.aggregateToolUsageByMessageDateCutoff(rangeDays, period, tzOffset);
    // JS 側で (period, tool) 単位に集約し factor を適用する
    type ToolAggEntry = { count: number; durationMs: number; adjustedTokens: number; totalTurns: number; missingTurns: number };
    const toolAggMap = new Map<string, ToolAggEntry>();
    for (const r of toolRawRows) {
      const p = String(r['period'] ?? '');
      const tool = String(r['tool'] ?? '');
      const totalTurns = Number(r['token_total_turns'] ?? 0);
      const missingTurns = Number(r['token_missing_turns'] ?? 0);
      const observedTurns = totalTurns - missingTurns;
      const factor = observedTurns > 0 ? totalTurns / observedTurns : 1;
      const rawTokens = Number(r['tokens'] ?? 0);
      const k = `${p}|${tool}`;
      const cur = toolAggMap.get(k) ?? { count: 0, durationMs: 0, adjustedTokens: 0, totalTurns: 0, missingTurns: 0 };
      cur.count += Number(r['count'] ?? 0);
      cur.durationMs += Number(r['duration_ms'] ?? 0);
      cur.adjustedTokens += rawTokens * factor;
      cur.totalTurns += totalTurns;
      cur.missingTurns += missingTurns;
      toolAggMap.set(k, cur);
    }
    const toolCounts = [...toolAggMap.entries()].map(([k, e]) => {
      const sep = k.indexOf('|');
      const period = k.slice(0, sep);
      const tool = k.slice(sep + 1);
      return {
        period,
        tool,
        count: e.count,
        tokens: Math.round(e.adjustedTokens),
        durationMs: e.durationMs,
        tokenMissingRate: e.totalTurns > 0 ? e.missingTurns / e.totalTurns : 0,
        tokenTotalTurns: e.totalTurns,
        tokenMissingTurns: e.missingTurns,
      };
    });

    // エラー集計: session start_time 基準（daily_counts の timestamp 基準と一致させる）
    const errResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              CASE
                WHEN mtc.tool_name LIKE 'mcp\\_\\_%\\_\\_%' ESCAPE '\\'
                THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                ELSE mtc.tool_name
              END AS tool,
              COUNT(*) AS err_count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.is_error = 1
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       GROUP BY period, tool`,
    );
    const errByPeriod = new Map<string, { byTool: Record<string, number> }>();
    for (const r of toRows(errResult)) {
      const p = String(r['period'] ?? '');
      const tool = String(r['tool'] ?? '');
      const errCount = Number(r['err_count'] ?? 0);
      if (errCount === 0) continue;
      const e = errByPeriod.get(p) ?? { byTool: {} };
      e.byTool[tool] = (e.byTool[tool] ?? 0) + errCount;
      errByPeriod.set(p, e);
    }
    const errorRate = [...errByPeriod.entries()].map(([p, v]) => ({
      period: p, rate: 0, byTool: v.byTool,
    }));

    const skillResult = db.exec(
      `SELECT ${periodExpr} AS period, key AS skill, SUM(count) AS count
       FROM daily_counts
       WHERE kind = 'skill' AND date >= ${cutoff}
       GROUP BY period, key`,
    );
    const skillStats = toRows(skillResult).map(r => ({
      period: String(r['period'] ?? ''),
      skill: String(r['skill'] ?? ''),
      count: Number(r['count'] ?? 0),
      costUsd: 0,
    }));

    const modelResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              COALESCE(m.model, '') AS model,
              s.source,
              COUNT(*) AS count,
              CAST(SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)) AS INTEGER) AS tokens,
              SUM(CASE WHEN COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)
                              + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0) = 0
                       THEN 1 ELSE 0 END) AS token_missing_turns
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, COALESCE(m.model, ''), s.source`,
    );
    const modelAggMap = new Map<string, { count: number; tokens: number; totalTurns: number; missingTurns: number }>();
    for (const r of toRows(modelResult)) {
      const period = String(r['period'] ?? '');
      const source = String(r['source'] ?? '') as PricingSource;
      const model = resolvePricingModelName(String(r['model'] ?? ''), source);
      const count = Number(r['count'] ?? 0);
      const rawTokens = Number(r['tokens'] ?? 0);
      const missingTurns = Number(r['token_missing_turns'] ?? 0);
      const observedTurns = count - missingTurns;
      const factor = observedTurns > 0 ? count / observedTurns : 1;
      const key = `${period}::${model}`;
      const cur = modelAggMap.get(key) ?? { count: 0, tokens: 0, totalTurns: 0, missingTurns: 0 };
      cur.count += count;
      cur.tokens += Math.round(rawTokens * factor);
      cur.totalTurns += count;
      cur.missingTurns += missingTurns;
      modelAggMap.set(key, cur);
    }
    const modelStats = [...modelAggMap.entries()].map(([k, v]) => {
      const sep = k.indexOf('::');
      return {
        period: k.slice(0, sep),
        model: k.slice(sep + 2),
        count: v.count,
        tokens: v.tokens,
        tokenMissingRate: v.totalTurns > 0 ? v.missingTurns / v.totalTurns : 0,
        tokenTotalTurns: v.totalTurns,
        tokenMissingTurns: v.missingTurns,
      };
    });

    const agentTokenResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0) + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0)) AS tokens,
              SUM(CASE WHEN m.type = 'assistant' THEN 1 ELSE 0 END) AS token_total_turns,
              SUM(CASE
                    WHEN m.type = 'assistant'
                     AND COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0) + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0) = 0
                    THEN 1 ELSE 0
                  END) AS token_missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentCostResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(sc.estimated_cost_usd,0)) AS cost_usd
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentLocResult = db.exec(
      `SELECT ${commitPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(c.lines_added,0)) AS loc
       FROM session_commits c
       JOIN sessions s ON s.id = c.session_id
       WHERE DATE(c.committed_at, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentMap = new Map<string, { tokens: number; costUsd: number; loc: number; tokenTotalTurns: number; tokenMissingTurns: number }>();
    const addAgentMetric = (period: string, agent: string, delta: Partial<{ tokens: number; costUsd: number; loc: number; tokenTotalTurns: number; tokenMissingTurns: number }>) => {
      const key = `${period}::${agent}`;
      const cur = agentMap.get(key) ?? { tokens: 0, costUsd: 0, loc: 0, tokenTotalTurns: 0, tokenMissingTurns: 0 };
      cur.tokens += delta.tokens ?? 0;
      cur.costUsd += delta.costUsd ?? 0;
      cur.loc += delta.loc ?? 0;
      cur.tokenTotalTurns += delta.tokenTotalTurns ?? 0;
      cur.tokenMissingTurns += delta.tokenMissingTurns ?? 0;
      agentMap.set(key, cur);
    };
    for (const r of toRows(agentTokenResult)) {
      addAgentMetric(String(r['period'] ?? ''), String(r['agent'] ?? ''), {
        tokens: Number(r['tokens'] ?? 0),
        tokenTotalTurns: Number(r['token_total_turns'] ?? 0),
        tokenMissingTurns: Number(r['token_missing_turns'] ?? 0),
      });
    }
    for (const r of toRows(agentCostResult)) {
      addAgentMetric(String(r['period'] ?? ''), String(r['agent'] ?? ''), { costUsd: Number(r['cost_usd'] ?? 0) });
    }
    for (const r of toRows(agentLocResult)) {
      addAgentMetric(String(r['period'] ?? ''), String(r['agent'] ?? ''), { loc: Number(r['loc'] ?? 0) });
    }
    const agentStats = [...agentMap.entries()].map(([k, v]) => {
      const sep = k.indexOf('::');
      const observedTurns = v.tokenTotalTurns - v.tokenMissingTurns;
      const factor = observedTurns > 0 ? v.tokenTotalTurns / observedTurns : 1;
      return {
        period: k.slice(0, sep),
        agent: k.slice(sep + 2),
        tokens: Math.round(v.tokens * factor),
        costUsd: v.costUsd * factor,
        loc: v.loc,
        tokenMissingRate: v.tokenTotalTurns > 0 ? v.tokenMissingTurns / v.tokenTotalTurns : 0,
        tokenTotalTurns: v.tokenTotalTurns,
        tokenMissingTurns: v.tokenMissingTurns,
      };
    });

    // Commit stats: session_commits を取得し、AI 1 発成功率のファイル overlap 判定に必要な
    // committed_at / is_ai_assisted / commit_files を一緒に取る。分母の fix 検出のために
    // 期間末尾から 168h 先のコミットも取得する。手動コミットが複数セッションに重複登録される
    // ため repo_name + commit_hash で排除する。
    const commitWindowSec = Math.round(AI_FIRST_TRY_FIX_WINDOW_MS / 1000);
    const sessionDateExpr = period === 'week'
      ? `strftime('%Y-W%W', s.start_time, '${tzOffset}')`
      : `DATE(s.start_time, '${tzOffset}')`;
    const commitResult = db.exec(
      `SELECT ${sessionDateExpr} AS period, sc.repo_name, sc.commit_hash,
              MAX(sc.commit_message) AS commit_message,
              MIN(sc.committed_at) AS committed_at,
              MAX(sc.is_ai_assisted) AS is_ai_assisted,
              MAX(COALESCE(sc.lines_added, 0)) AS lines_added,
              MAX(COALESCE(sc.lines_deleted, 0)) AS lines_deleted
       FROM session_commits sc
       JOIN sessions s ON sc.session_id = s.id
       WHERE sc.committed_at >= DATETIME('now', '-${rangeDays} days')
         AND sc.committed_at <= DATETIME('now', '+${commitWindowSec} seconds')
       GROUP BY sc.session_id, sc.repo_name, sc.commit_hash`,
    );
    type CommitRow = {
      period: string;
      repoName: string;
      hash: string;
      subject: string;
      committed_at: string;
      is_ai_assisted: boolean;
      linesAdded: number;
      linesDeleted: number;
      files: string[];
    };
    const commitRows: CommitRow[] = toRows(commitResult).map(r => ({
      period: String(r['period'] ?? ''),
      repoName: String(r['repo_name'] ?? ''),
      hash: String(r['commit_hash'] ?? ''),
      subject: String(r['commit_message'] ?? '').split('\n')[0],
      committed_at: String(r['committed_at'] ?? ''),
      is_ai_assisted: Number(r['is_ai_assisted'] ?? 0) === 1,
      linesAdded: Number(r['lines_added'] ?? 0),
      linesDeleted: Number(r['lines_deleted'] ?? 0),
      files: [],
    }));

    // Batch-fetch commit_files for all commit hashes in the window
    if (commitRows.length > 0) {
      const hashPlaceholders = commitRows.map(() => '?').join(',');
      const filesResult = db.exec(
        `SELECT repo_name, commit_hash, file_path FROM commit_files WHERE commit_hash IN (${hashPlaceholders})`,
        commitRows.map(c => c.hash),
      );
      if (filesResult[0]) {
        const byHash = new Map<string, string[]>();
        for (const row of filesResult[0].values) {
          const h = `${String(row[0] ?? '')}:${String(row[1] ?? '')}`;
          const p = String(row[2] ?? '');
          const list = byHash.get(h);
          if (list) list.push(p);
          else byHash.set(h, [p]);
        }
        for (const c of commitRows) {
          c.files = byHash.get(`${c.repoName}:${c.hash}`) ?? [];
        }
      }
    }

    // Commit prefix stats: 期間内のコミットだけを集計 (period はセッション開始日基準)
    const cutoffPeriodRes = db.exec(`SELECT ${sessionDateExpr.replace('s.start_time', `DATE('now')`)} AS period`);
    const todayPeriod = String(cutoffPeriodRes[0]?.values?.[0]?.[0] ?? '');
    const prefixMap = new Map<string, { count: number; linesAdded: number; linesDeleted: number }>();
    for (const c of commitRows) {
      if (c.period > todayPeriod) continue;  // skip future-window rows
      const prefix = extractCommitPrefix(c.subject);
      const k = `${c.period}::${prefix}`;
      const cur = prefixMap.get(k) ?? { count: 0, linesAdded: 0, linesDeleted: 0 };
      cur.count += 1;
      cur.linesAdded += c.linesAdded;
      cur.linesDeleted += c.linesDeleted;
      prefixMap.set(k, cur);
    }
    const commitPrefixStats = [...prefixMap.entries()].map(([k, v]) => {
      const sep = k.indexOf('::');
      return { period: k.slice(0, sep), prefix: k.slice(sep + 2), count: v.count, linesAdded: v.linesAdded, linesDeleted: v.linesDeleted };
    });

    // Repository stats: COUNT は commitRows を再利用（既に repo_name+commit_hash で重複排除済み）
    const repoCountMap = new Map<string, number>();
    for (const c of commitRows) {
      if (c.period > todayPeriod) continue;
      if (!c.repoName) continue;
      const k = `${c.period}::${c.repoName}`;
      repoCountMap.set(k, (repoCountMap.get(k) ?? 0) + 1);
    }

    // Repository stats: TOKEN は messages JOIN sessions で集計（session start_time 基準）
    const repoTokenResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              s.repo_name,
              SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)
                  + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0)) AS tokens
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
         AND DATE(s.start_time, '${tzOffset}') >= ${cutoff}
         AND s.repo_name != ''
       GROUP BY period, s.repo_name`,
    );
    const repoTokenMap = new Map<string, number>();
    for (const r of toRows(repoTokenResult)) {
      const period = String(r['period'] ?? '');
      const repoName = String(r['repo_name'] ?? '');
      const k = `${period}::${repoName}`;
      repoTokenMap.set(k, Number(r['tokens'] ?? 0));
    }

    // COUNT と TOKEN をマージ
    const repoAllKeys = new Set([...repoCountMap.keys(), ...repoTokenMap.keys()]);
    const repoStats = [...repoAllKeys].map(k => {
      const sep = k.indexOf('::');
      const repoName = k.slice(sep + 2);
      return {
        period: k.slice(0, sep),
        repoName,
        count: repoCountMap.get(k) ?? 0,
        tokens: repoTokenMap.get(k) ?? 0,
      };
    }).filter(r => r.repoName !== '');

    // AI First-Try Success Rate per period
    const fixes = commitRows
      .filter(c => isAiFirstTryFailureCommit(c.subject))
      .map(c => ({ ms: Date.parse(c.committed_at), codeFiles: c.files.filter(isCodeFile) }))
      .filter(f => !Number.isNaN(f.ms));
    const rateAgg = new Map<string, { total: number; success: number }>();
    for (const c of commitRows) {
      if (!c.is_ai_assisted) continue;
      if (c.period > todayPeriod) continue;
      const codeFiles = c.files.filter(isCodeFile);
      if (c.files.length > 0 && codeFiles.length === 0) continue;
      const commitMs = Date.parse(c.committed_at);
      if (Number.isNaN(commitMs)) continue;
      const aiSet = new Set(codeFiles);
      const failed = fixes.some(f =>
        f.ms > commitMs &&
        f.ms - commitMs <= AI_FIRST_TRY_FIX_WINDOW_MS &&
        (aiSet.size > 0 && f.codeFiles.length > 0 && f.codeFiles.some(fp => aiSet.has(fp))),
      );
      const e = rateAgg.get(c.period) ?? { total: 0, success: 0 };
      e.total += 1;
      if (!failed) e.success += 1;
      rateAgg.set(c.period, e);
    }
    const aiFirstTryRate = [...rateAgg.entries()]
      .map(([period, { total, success }]) => ({
        period,
        rate: total === 0 ? 0 : (success / total) * 100,
        sampleSize: total,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Build / Test fail rate per period
    const buildTestResult = db.exec(
      `SELECT period,
              SUM(CASE WHEN cmd_type = 'build' THEN 1 ELSE 0 END) AS build_runs,
              SUM(CASE WHEN cmd_type = 'build' AND is_error = 1 THEN 1 ELSE 0 END) AS build_fails,
              SUM(CASE WHEN cmd_type = 'test' THEN 1 ELSE 0 END) AS test_runs,
              SUM(CASE WHEN cmd_type = 'test' AND is_error = 1 THEN 1 ELSE 0 END) AS test_fails
       FROM (
         SELECT ${sessionStartPeriodExpr} AS period,
                mtc.is_error,
                CASE
                  WHEN mtc.command LIKE '%npm run build%' OR mtc.command LIKE '%npx tsc%'
                    OR mtc.command LIKE '% tsc %' OR mtc.command LIKE '% tsc'
                    OR mtc.command LIKE 'tsc %'
                    OR mtc.command LIKE '%webpack%' OR mtc.command LIKE '%vite build%'
                    OR mtc.command LIKE '%esbuild%' OR mtc.command LIKE '%rollup%'
                    THEN 'build'
                  WHEN mtc.command LIKE '%jest%' OR mtc.command LIKE '%vitest%'
                    OR mtc.command LIKE '%npm run test%' OR mtc.command LIKE '%npm test%'
                    THEN 'test'
                  ELSE NULL
                END AS cmd_type
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE mtc.tool_name = 'Bash'
           AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       )
       WHERE cmd_type IS NOT NULL
       GROUP BY period`,
    );

    // Retry rate per period: retries = (edit_count - 1) per (session, file) groups with count > 1
    const editCountResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period, COUNT(*) AS total_edits
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.tool_name IN ('Edit', 'Write')
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       GROUP BY period`,
    );
    const retryResult = db.exec(
      `SELECT period, SUM(cnt - 1) AS total_retries
       FROM (
         SELECT ${sessionStartPeriodExpr} AS period, COUNT(*) AS cnt
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE mtc.tool_name IN ('Edit', 'Write')
           AND mtc.file_path IS NOT NULL AND mtc.file_path != ''
           AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
         GROUP BY ${sessionStartPeriodExpr}, mtc.session_id, mtc.file_path
         HAVING COUNT(*) > 1
       )
       GROUP BY period`,
    );

    type QualityEntry = { buildRuns: number; buildFails: number; testRuns: number; testFails: number; edits: number; retries: number };
    const qualityMap = new Map<string, QualityEntry>();
    const getQuality = (p: string) => {
      const cur = qualityMap.get(p) ?? { buildRuns: 0, buildFails: 0, testRuns: 0, testFails: 0, edits: 0, retries: 0 };
      qualityMap.set(p, cur);
      return cur;
    };
    for (const r of toRows(buildTestResult)) {
      const e = getQuality(String(r['period'] ?? ''));
      e.buildRuns += Number(r['build_runs'] ?? 0);
      e.buildFails += Number(r['build_fails'] ?? 0);
      e.testRuns += Number(r['test_runs'] ?? 0);
      e.testFails += Number(r['test_fails'] ?? 0);
    }
    for (const r of toRows(editCountResult)) {
      getQuality(String(r['period'] ?? '')).edits += Number(r['total_edits'] ?? 0);
    }
    for (const r of toRows(retryResult)) {
      getQuality(String(r['period'] ?? '')).retries += Number(r['total_retries'] ?? 0);
    }
    const qualityRates = [...qualityMap.entries()]
      .map(([p, e]) => ({
        period: p,
        retryRate: e.edits > 0 ? (e.retries / e.edits) * 100 : null,
        buildFailRate: e.buildRuns > 0 ? (e.buildFails / e.buildRuns) * 100 : null,
        testFailRate: e.testRuns > 0 ? (e.testFails / e.testRuns) * 100 : null,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      toolCounts,
      errorRate,
      skillStats,
      modelStats,
      agentStats,
      commitPrefixStats,
      aiFirstTryRate,
      repoStats,
      qualityRates,
    };
  }

  getCostOptimization(): CostOptimizationData {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();

    // 1. Actual cost by model from session_costs
    const actualResult = db.exec(
      `SELECT model, SUM(estimated_cost_usd)
       FROM session_costs GROUP BY model`,
    );
    const actualByModel: Record<string, number> = {};
    let actualTotal = 0;
    for (const row of actualResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      actualByModel[m] = (actualByModel[m] ?? 0) + c;
      actualTotal += c;
    }

    // 2. Skill-based estimate from daily_counts (kind='cost_skill')
    const skillResult = db.exec(
      `SELECT key AS model, SUM(estimated_cost_usd)
       FROM daily_counts WHERE kind = 'cost_skill'
       GROUP BY key`,
    );
    const skillByModel: Record<string, number> = {};
    let skillTotal = 0;
    for (const row of skillResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      skillByModel[m] = (skillByModel[m] ?? 0) + c;
      skillTotal += c;
    }

    // 4. Daily breakdown from daily_counts (last 90 days, kind IN cost_actual/cost_skill)
    const dailyResult = db.exec(
      `SELECT date, SUBSTR(kind, 6) AS cost_type, SUM(estimated_cost_usd)
       FROM daily_counts
       WHERE kind IN ('cost_actual', 'cost_skill')
         AND date >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, kind ORDER BY date`,
    );
    const dailyMap = new Map<string, { actual: number; skill: number }>();
    for (const row of dailyResult[0]?.values ?? []) {
      const d = String(row[0]);
      const ct = String(row[1]);
      const c = Number(row[2]);
      const entry = dailyMap.get(d) ?? { actual: 0, skill: 0 };
      if (ct === 'actual') entry.actual += c;
      else if (ct === 'skill') entry.skill += c;
      dailyMap.set(d, entry);
    }
    const daily: Array<{ date: string; actualCost: number; skillCost: number }> = [];
    for (const [d, entry] of dailyMap) {
      daily.push({
        date: d,
        actualCost: entry.actual,
        skillCost: entry.skill,
      });
    }

    // 5. Model distribution (message count) — from daily_counts to avoid full messages scan
    const distActual = db.exec(
      `SELECT key, SUM(count) FROM daily_counts WHERE kind = 'model' GROUP BY key`,
    );
    const actualDist: Record<string, number> = {};
    for (const row of distActual[0]?.values ?? []) {
      actualDist[String(row[0])] = Number(row[1]);
    }

    const distSkill = db.exec(
      `SELECT key, SUM(count) FROM daily_counts WHERE kind = 'cost_skill' GROUP BY key`,
    );
    const skillDist: Record<string, number> = {};
    for (const row of distSkill[0]?.values ?? []) {
      skillDist[String(row[0])] = Number(row[1]);
    }

    return {
      actual: { totalCost: actualTotal, byModel: actualByModel },
      skillEstimate: { totalCost: skillTotal, byModel: skillByModel },
      daily,
      modelDistribution: {
        actual: actualDist,
        skillRecommended: skillDist,
      },
    };
  }

  importCoverage(gitRoot: string): number {
    const db = this.ensureDb();

    // 最新リリースタグを取得
    const latestResult = db.exec(
      "SELECT tag FROM releases ORDER BY released_at DESC LIMIT 1",
    );
    const latestTag = latestResult[0]?.values?.[0]?.[0] as string | undefined;
    if (!latestTag) return 0;

    const packagesDir = path.join(gitRoot, 'packages');
    let count = 0;

    let packageDirs: string[];
    try {
      packageDirs = fs.readdirSync(packagesDir);
    } catch {
      return 0;
    }

    for (const pkgDir of packageDirs) {
      const summaryPath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-summary.json');
      let summary: Record<string, CoverageSummaryEntry>;
      try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, CoverageSummaryEntry>;
      } catch {
        continue;
      }

      for (const [key, entry] of Object.entries(summary)) {
        if (!entry?.lines || !entry?.statements || !entry?.functions || !entry?.branches) {
          continue;
        }
        const filePath = key === 'total' ? '__total__' : key;
        try {
          db.run(
            `INSERT OR IGNORE INTO release_coverage (
              release_tag, package, file_path,
              lines_total, lines_covered, lines_pct,
              statements_total, statements_covered, statements_pct,
              functions_total, functions_covered, functions_pct,
              branches_total, branches_covered, branches_pct
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              latestTag, pkgDir, filePath,
              entry.lines.total, entry.lines.covered, entry.lines.pct,
              entry.statements.total, entry.statements.covered, entry.statements.pct,
              entry.functions.total, entry.functions.covered, entry.functions.pct,
              entry.branches.total, entry.branches.covered, entry.branches.pct,
            ],
          );
          count++;
        } catch { /* ignore */ }
      }
    }

    return count;
  }

  importCurrentCoverage(gitRoot: string, repoName: string): number {
    const db = this.ensureDb();
    // 洗い替え
    db.run('DELETE FROM current_coverage WHERE repo_name = ?', [repoName]);

    const packagesDir = path.join(gitRoot, 'packages');
    let count = 0;
    let pkgDirs: string[];
    try {
      pkgDirs = fs.readdirSync(packagesDir);
    } catch {
      return 0;
    }

    const now = new Date().toISOString();
    for (const pkgDir of pkgDirs) {
      const summaryPath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-summary.json');
      if (!fs.existsSync(summaryPath)) continue;
      let summary: Record<string, unknown>;
      try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        continue;
      }
      const toPct = (v: number | string | undefined | null): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
      for (const [key, entry] of Object.entries(summary)) {
        const e = entry as Record<string, { total: number; covered: number; pct: number | string }>;
        if (!e?.lines || !e?.statements || !e?.functions || !e?.branches) continue;
        const filePath = key === 'total' ? '__total__' : key;
        db.run(
          `INSERT OR REPLACE INTO current_coverage (
            repo_name, package, file_path,
            lines_total, lines_covered, lines_pct,
            statements_total, statements_covered, statements_pct,
            functions_total, functions_covered, functions_pct,
            branches_total, branches_covered, branches_pct,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            repoName, pkgDir, filePath,
            e.lines.total, e.lines.covered, toPct(e.lines.pct),
            e.statements.total, e.statements.covered, toPct(e.statements.pct),
            e.functions.total, e.functions.covered, toPct(e.functions.pct),
            e.branches.total, e.branches.covered, toPct(e.branches.pct),
            now,
          ],
        );
        count++;
      }
    }
    return count;
  }

  getCurrentCoverage(repoName: string): CurrentCoverageRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT repo_name, package, file_path, lines_total, lines_covered, lines_pct, statements_total, statements_covered, statements_pct, functions_total, functions_covered, functions_pct, branches_total, branches_covered, branches_pct, updated_at FROM current_coverage WHERE repo_name = ?',
      [repoName],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      package: String(r[1] ?? ''),
      file_path: String(r[2] ?? ''),
      lines_total: Number(r[3] ?? 0),
      lines_covered: Number(r[4] ?? 0),
      lines_pct: Number(r[5] ?? 0),
      statements_total: Number(r[6] ?? 0),
      statements_covered: Number(r[7] ?? 0),
      statements_pct: Number(r[8] ?? 0),
      functions_total: Number(r[9] ?? 0),
      functions_covered: Number(r[10] ?? 0),
      functions_pct: Number(r[11] ?? 0),
      branches_total: Number(r[12] ?? 0),
      branches_covered: Number(r[13] ?? 0),
      branches_pct: Number(r[14] ?? 0),
      updated_at: String(r[15] ?? ''),
    }));
  }

  getAllCurrentCoverage(): CurrentCoverageRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT repo_name, package, file_path, lines_total, lines_covered, lines_pct, statements_total, statements_covered, statements_pct, functions_total, functions_covered, functions_pct, branches_total, branches_covered, branches_pct, updated_at FROM current_coverage',
    );
    const values = result[0]?.values ?? [];
    // NaN-safe converter: istanbul/v8 stores "Unknown" for pct when total=0
    // Number("Unknown") = NaN, which JSON.stringify serializes as null → Supabase NOT NULL violation
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      package: String(r[1] ?? ''),
      file_path: String(r[2] ?? ''),
      lines_total: toNum(r[3]),
      lines_covered: toNum(r[4]),
      lines_pct: toNum(r[5]),
      statements_total: toNum(r[6]),
      statements_covered: toNum(r[7]),
      statements_pct: toNum(r[8]),
      functions_total: toNum(r[9]),
      functions_covered: toNum(r[10]),
      functions_pct: toNum(r[11]),
      branches_total: toNum(r[12]),
      branches_covered: toNum(r[13]),
      branches_pct: toNum(r[14]),
      updated_at: String(r[15] ?? ''),
    }));
  }

  // ---------------------------------------------------------------------------
  //  File Analysis (Dead Code Detection)
  // ---------------------------------------------------------------------------

  upsertCurrentFileAnalysis(rows: readonly FileAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO current_file_analysis (
          repo_name, file_path,
          importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
          dead_code_score,
          signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
          signal_zero_coverage, signal_isolated_community,
          is_ignored, ignore_reason, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.repoName, r.filePath,
          r.importanceScore, r.fanInTotal, r.cognitiveComplexityMax, r.lineCount, r.cyclomaticComplexityMax, r.functionCount,
          r.deadCodeScore,
          r.signals.orphan ? 1 : 0,
          r.signals.fanInZero ? 1 : 0,
          r.signals.noRecentChurn ? 1 : 0,
          r.signals.zeroCoverage ? 1 : 0,
          r.signals.isolatedCommunity ? 1 : 0,
          r.isIgnored ? 1 : 0, r.ignoreReason, r.analyzedAt,
        ],
      );
    }
    this.save();
  }

  getCurrentFileAnalysis(repoName: string): FileAnalysisRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path,
              importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
              dead_code_score,
              signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
              signal_zero_coverage, signal_isolated_community,
              is_ignored, ignore_reason, analyzed_at
       FROM current_file_analysis WHERE repo_name = ?`,
      [repoName],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: String(r[0] ?? ''),
      filePath: String(r[1] ?? ''),
      importanceScore: Number(r[2] ?? 0),
      fanInTotal: Number(r[3] ?? 0),
      cognitiveComplexityMax: Number(r[4] ?? 0),
      lineCount: Number(r[5] ?? 0),
      cyclomaticComplexityMax: Number(r[6] ?? 0),
      functionCount: Number(r[7] ?? 0),
      deadCodeScore: Number(r[8] ?? 0),
      signals: {
        orphan: Number(r[9] ?? 0) === 1,
        fanInZero: Number(r[10] ?? 0) === 1,
        noRecentChurn: Number(r[11] ?? 0) === 1,
        zeroCoverage: Number(r[12] ?? 0) === 1,
        isolatedCommunity: Number(r[13] ?? 0) === 1,
      },
      isIgnored: Number(r[14] ?? 0) === 1,
      ignoreReason: String(r[15] ?? ''),
      analyzedAt: String(r[16] ?? ''),
    }));
  }

  clearCurrentFileAnalysis(repoName: string): void {
    const db = this.ensureDb();
    db.run('DELETE FROM current_file_analysis WHERE repo_name = ?', [repoName]);
    this.save();
  }

  upsertReleaseFileAnalysis(releaseTag: string, rows: readonly FileAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO release_file_analysis (
          release_tag, repo_name, file_path,
          importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
          dead_code_score,
          signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
          signal_zero_coverage, signal_isolated_community,
          is_ignored, ignore_reason, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          releaseTag, r.repoName, r.filePath,
          r.importanceScore, r.fanInTotal, r.cognitiveComplexityMax, r.lineCount, r.cyclomaticComplexityMax, r.functionCount,
          r.deadCodeScore,
          r.signals.orphan ? 1 : 0,
          r.signals.fanInZero ? 1 : 0,
          r.signals.noRecentChurn ? 1 : 0,
          r.signals.zeroCoverage ? 1 : 0,
          r.signals.isolatedCommunity ? 1 : 0,
          r.isIgnored ? 1 : 0, r.ignoreReason, r.analyzedAt,
        ],
      );
    }
  }

  getReleaseFileAnalysis(releaseTag: string, repoName: string): FileAnalysisRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path,
              importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
              dead_code_score,
              signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
              signal_zero_coverage, signal_isolated_community,
              is_ignored, ignore_reason, analyzed_at
       FROM release_file_analysis WHERE release_tag = ? AND repo_name = ?`,
      [releaseTag, repoName],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: String(r[0] ?? ''),
      filePath: String(r[1] ?? ''),
      importanceScore: Number(r[2] ?? 0),
      fanInTotal: Number(r[3] ?? 0),
      cognitiveComplexityMax: Number(r[4] ?? 0),
      lineCount: Number(r[5] ?? 0),
      cyclomaticComplexityMax: Number(r[6] ?? 0),
      functionCount: Number(r[7] ?? 0),
      deadCodeScore: Number(r[8] ?? 0),
      signals: {
        orphan: Number(r[9] ?? 0) === 1,
        fanInZero: Number(r[10] ?? 0) === 1,
        noRecentChurn: Number(r[11] ?? 0) === 1,
        zeroCoverage: Number(r[12] ?? 0) === 1,
        isolatedCommunity: Number(r[13] ?? 0) === 1,
      },
      isIgnored: Number(r[14] ?? 0) === 1,
      ignoreReason: String(r[15] ?? ''),
      analyzedAt: String(r[16] ?? ''),
    }));
  }

  clearReleaseFileAnalysis(releaseTag: string, repoName: string): void {
    const db = this.ensureDb();
    db.run('DELETE FROM release_file_analysis WHERE release_tag = ? AND repo_name = ?', [releaseTag, repoName]);
    this.save();
  }

  // ---------------------------------------------------------------------------
  //  Function Analysis (Dead Code Detection)
  // ---------------------------------------------------------------------------

  upsertCurrentFunctionAnalysis(rows: readonly FunctionAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO current_function_analysis (
          repo_name, file_path, function_name, start_line,
          end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
          data_mutation_score, side_effect_score, line_count,
          importance_score, signal_fan_in_zero, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.repoName, r.filePath, r.functionName, r.startLine,
          r.endLine, r.language, r.fanIn, r.cognitiveComplexity, r.cyclomaticComplexity,
          r.dataMutationScore, r.sideEffectScore, r.lineCount,
          r.importanceScore, r.signalFanInZero ? 1 : 0, r.analyzedAt,
        ],
      );
    }
    this.save();
  }

  getCurrentFunctionAnalysis(repoName: string): FunctionAnalysisRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path, function_name, start_line,
              end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
              data_mutation_score, side_effect_score, line_count,
              importance_score, signal_fan_in_zero, analyzed_at
       FROM current_function_analysis WHERE repo_name = ?`,
      [repoName],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: String(r[0] ?? ''),
      filePath: String(r[1] ?? ''),
      functionName: String(r[2] ?? ''),
      startLine: Number(r[3] ?? 0),
      endLine: Number(r[4] ?? 0),
      language: String(r[5] ?? ''),
      fanIn: Number(r[6] ?? 0),
      cognitiveComplexity: Number(r[7] ?? 0),
      cyclomaticComplexity: Number(r[8] ?? 0),
      dataMutationScore: Number(r[9] ?? 0),
      sideEffectScore: Number(r[10] ?? 0),
      lineCount: Number(r[11] ?? 0),
      importanceScore: Number(r[12] ?? 0),
      signalFanInZero: Number(r[13] ?? 0) === 1,
      analyzedAt: String(r[14] ?? ''),
    }));
  }

  clearCurrentFunctionAnalysis(repoName: string): void {
    const db = this.ensureDb();
    db.run('DELETE FROM current_function_analysis WHERE repo_name = ?', [repoName]);
    this.save();
  }

  upsertReleaseFunctionAnalysis(releaseTag: string, rows: readonly FunctionAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO release_function_analysis (
          release_tag, repo_name, file_path, function_name, start_line,
          end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
          data_mutation_score, side_effect_score, line_count,
          importance_score, signal_fan_in_zero, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          releaseTag, r.repoName, r.filePath, r.functionName, r.startLine,
          r.endLine, r.language, r.fanIn, r.cognitiveComplexity, r.cyclomaticComplexity,
          r.dataMutationScore, r.sideEffectScore, r.lineCount,
          r.importanceScore, r.signalFanInZero ? 1 : 0, r.analyzedAt,
        ],
      );
    }
    this.save();
  }

  getReleaseFunctionAnalysis(releaseTag: string, repoName: string): FunctionAnalysisRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path, function_name, start_line,
              end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
              data_mutation_score, side_effect_score, line_count,
              importance_score, signal_fan_in_zero, analyzed_at
       FROM release_function_analysis WHERE release_tag = ? AND repo_name = ?`,
      [releaseTag, repoName],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: String(r[0] ?? ''),
      filePath: String(r[1] ?? ''),
      functionName: String(r[2] ?? ''),
      startLine: Number(r[3] ?? 0),
      endLine: Number(r[4] ?? 0),
      language: String(r[5] ?? ''),
      fanIn: Number(r[6] ?? 0),
      cognitiveComplexity: Number(r[7] ?? 0),
      cyclomaticComplexity: Number(r[8] ?? 0),
      dataMutationScore: Number(r[9] ?? 0),
      sideEffectScore: Number(r[10] ?? 0),
      lineCount: Number(r[11] ?? 0),
      importanceScore: Number(r[12] ?? 0),
      signalFanInZero: Number(r[13] ?? 0) === 1,
      analyzedAt: String(r[14] ?? ''),
    }));
  }

  clearReleaseFunctionAnalysis(releaseTag: string, repoName: string): void {
    const db = this.ensureDb();
    db.run('DELETE FROM release_function_analysis WHERE release_tag = ? AND repo_name = ?', [releaseTag, repoName]);
    this.save();
  }

  // -------------------------------------------------------------------------
  //  Releases
  // -------------------------------------------------------------------------

  resolveReleases(gitRoot: string): number {
    const db = this.ensureDb();
    const git = new ExecFileGitService(gitRoot);
    const tags = git.getVersionTags();
    let count = 0;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const existing = db.exec(`SELECT tag FROM releases WHERE tag = '${tag.replaceAll("'", "''")}'`);
      if (existing[0]?.values?.length) {
        // Release exists — backfill release_files if missing
        const prevTag = i + 1 < tags.length ? tags[i + 1] : null;
        const totalLinesResult = db.exec(`SELECT total_lines FROM releases WHERE tag = '${tag.replaceAll("'", "''")}'`);
        const existingTotalLines = Number(totalLinesResult[0]?.values?.[0]?.[0] ?? 0);
        if (existingTotalLines === 0) {
          const snapshotLines = git.getSnapshotLineCount(tag);
          if (snapshotLines > 0) {
            try {
              db.run(
                `UPDATE releases SET total_lines = ? WHERE tag = ?`,
                [snapshotLines, tag],
              );
              count++;
            } catch {
              // ignore backfill failures
            }
          }
        }
        if (prevTag) {
          const filesExist = db.exec(
            `SELECT COUNT(*) FROM release_files WHERE release_tag = '${tag.replaceAll("'", "''")}'`,
          );
          if (!((filesExist[0]?.values?.[0]?.[0] as number) > 0)) {
            const fileStats = git.getFileStatsByRange(prevTag, tag);
            for (const f of fileStats) {
              try {
                db.run(
                  `INSERT OR IGNORE INTO release_files (release_tag, file_path, lines_added, lines_deleted, change_type)
                   VALUES (?, ?, ?, ?, ?)`,
                  [tag, f.filePath, f.linesAdded, f.linesDeleted, f.changeType],
                );
              } catch { /* ignore */ }
            }
            if (fileStats.length > 0) count++;
          }
        }
        continue;
      }

      const prevTag = i + 1 < tags.length ? tags[i + 1] : null;
      const commitHash = git.getTagCommitHash(tag);
      const allTagsAtCommit = git.getTagsAtCommit(commitHash);
      const packageTags = allTagsAtCommit.filter((t) => t !== tag && !t.startsWith('v'));
      const releasedAt = git.getTagDate(tag);
      const prevReleasedAt = prevTag ? git.getTagDate(prevTag) : null;

      const commitSubjects = prevTag ? git.getCommitSubjects(prevTag, tag) : [];
      const stats = prevTag
        ? git.getDiffStats(prevTag, tag)
        : { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
      const packages = prevTag ? git.getChangedPackages(prevTag, tag) : [];
      const totalLines = git.getSnapshotLineCount(tag);

      const release = buildReleaseFromGitData({
        tag,
        prevTag,
        releasedAt,
        prevReleasedAt,
        repoName: path.basename(gitRoot),
        packageTags,
        commitSubjects,
        filesChanged: stats.filesChanged,
        linesAdded: stats.linesAdded,
        linesDeleted: stats.linesDeleted,
        totalLines,
        affectedPackages: packages,
      });

      db.run(
        `INSERT OR REPLACE INTO releases (
          tag, released_at, prev_tag, repo_name, package_tags,
          commit_count, files_changed, lines_added, lines_deleted,
          total_lines,
          feat_count, fix_count, refactor_count, test_count, other_count,
          affected_packages, duration_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          release.tag,
          release.releasedAt,
          release.prevTag,
          path.basename(gitRoot),
          JSON.stringify(release.packageTags),
          release.commitCount,
          release.filesChanged,
          release.linesAdded,
          release.linesDeleted,
          release.totalLines,
          release.featCount,
          release.fixCount,
          release.refactorCount,
          release.testCount,
          release.otherCount,
          JSON.stringify(release.affectedPackages),
          release.durationDays,
        ],
      );

      // Save release files
      if (prevTag) {
        const fileStats = git.getFileStatsByRange(prevTag, tag);
        for (const f of fileStats) {
          try {
            db.run(
              `INSERT OR IGNORE INTO release_files (release_tag, file_path, lines_added, lines_deleted, change_type)
               VALUES (?, ?, ?, ?, ?)`,
              [tag, f.filePath, f.linesAdded, f.linesDeleted, f.changeType],
            );
          } catch { /* ignore */ }
        }

      }

      count++;
    }

    if (count > 0) this.save();
    return count;
  }

  /**
   * releases テーブルの各リリースタグのソースコードを git worktree でチェックアウトして解析し、
   * release_graphs テーブルにタグ ID で保存する。
   * 既に release_graphs に同タグが存在する場合はスキップ。
   */
  analyzeReleases(
    gitRoot: string,
    analyzeFn: AnalyzeFunction,
    onProgress?: (message: string) => void,
    excludePatterns: readonly string[] = ['.worktrees', '.vscode-test', '__tests__', 'fixtures'],
  ): number {
    const db = this.ensureDb();
    const releases = this.getReleases();
    if (releases.length === 0) return 0;

    // 解析済みタグを取得
    const existingResult = db.exec('SELECT tag FROM release_graphs');
    const existingIds = new Set<string>(
      existingResult[0]?.values?.map((r) => r[0] as string) ?? [],
    );

    const git = new ExecFileGitService(gitRoot);
    const tsconfigPath = path.join(gitRoot, 'tsconfig.json');
    let count = 0;

    for (const release of releases) {
      const tag = release.tag;
      if (existingIds.has(tag)) continue;

      const tmpDir = path.join(os.tmpdir(), `trail-release-${tag.replaceAll('/', '-')}`);
      try {
        onProgress?.(`Analyzing release ${tag}...`);

        // 残存 worktree を事前クリーンアップ
        if (fs.existsSync(tmpDir)) {
          try {
            execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], {
              cwd: gitRoot,
              stdio: 'pipe',
            });
          } catch {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
          }
        }

        // 一時 worktree を作成
        const commitHash = git.getTagCommitHash(tag);
        execFileSync('git', ['worktree', 'add', '--detach', tmpDir, commitHash], {
          cwd: gitRoot,
          stdio: 'pipe',
        });

        // worktree 内に tsconfig.json がなければスキップ
        const worktreeTsconfig = path.join(tmpDir, 'tsconfig.json');
        if (!fs.existsSync(worktreeTsconfig)) {
          onProgress?.(`Skipping ${tag}: tsconfig.json not found`);
          continue;
        }

        // node_modules をシンボリックリンク（型解決のため）
        const worktreeNodeModules = path.join(tmpDir, 'node_modules');
        if (!fs.existsSync(worktreeNodeModules)) {
          fs.symlinkSync(
            path.join(gitRoot, 'node_modules'),
            worktreeNodeModules,
            'dir',
          );
        }

        // 解析実行（excludePatterns は legacy のディレクトリ名配列。.gitignore 互換に変換）
        const exclude = ignore();
        if (excludePatterns.length > 0) {
          exclude.add([...excludePatterns]);
        }
        const graph = analyzeFn({
          tsconfigPath: worktreeTsconfig,
          exclude,
        });

        // 保存（tsconfigPath は canonical パスを記録）
        this.saveReleaseGraph(graph, tsconfigPath, tag);
        // TODO(plan/2026-05-02-code-graph-tables): importAll 単体動作を別セッションで確認後にコメントアウト解除
        // this.analyzeReleaseCodeGraphsForce({ tag, worktreeTsconfig, codeGraphService, gitRoot });
        existingIds.add(tag);
        count++;
        onProgress?.(`Release ${tag} analyzed: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
      } catch (e) {
        onProgress?.(`Skipping ${tag}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        // worktree を必ず削除
        try {
          execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], {
            cwd: gitRoot,
            stdio: 'pipe',
          });
        } catch {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }
    }

    return count;
  }

  getReleases(): ReleaseRow[] {
    const db = this.ensureDb();
    const result = db.exec('SELECT * FROM releases ORDER BY released_at DESC');
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as ReleaseRow;
    });
  }

  /**
   * 指定リポジトリで指定日時以降にコミットされたファイル別の出現回数（churn）を返す。
   * 1 コミットで同ファイルが複数回現れることはないので、出現回数 = コミット数。
   *
   * @param repoName セッションの repo_name 一致条件（sessions.repo_name）
   * @param sinceIso UTC ISO 8601 文字列（この日時以降のコミットを対象とする）
   * @returns file_path → コミット出現回数のマップ。file_path は git 相対パス
   */
  getCommitFilesChurnSince(repoName: string, sinceIso: string): Map<string, number> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT cf.file_path, COUNT(DISTINCT cf.commit_hash) AS cnt
       FROM commit_files cf
       JOIN session_commits sc ON sc.commit_hash = cf.commit_hash
       JOIN sessions s ON s.id = sc.session_id
       WHERE sc.committed_at >= ? AND s.repo_name = ?
       GROUP BY cf.file_path`,
      [sinceIso, repoName],
    );
    const out = new Map<string, number>();
    const values = result[0]?.values ?? [];
    for (const r of values) {
      out.set(String(r[0] ?? ''), Number(r[1] ?? 0));
    }
    return out;
  }

  /**
   * 指定リポジトリで過去に 1 回でも commit に登場した file_path 集合を返す。
   * 期間制約なし。dead code 解析の `hasHistory` 判定で使う
   * (`getCommitFilesChurnSince` は recent 窓のみ返すため `hasHistory && churn===0` が常に false になる問題への対応)。
   */
  getCommitFilesEverChurned(repoName: string): Set<string> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT DISTINCT cf.file_path
       FROM commit_files cf
       JOIN session_commits sc ON sc.commit_hash = cf.commit_hash
       JOIN sessions s ON s.id = sc.session_id
       WHERE s.repo_name = ?`,
      [repoName],
    );
    const out = new Set<string>();
    const values = result[0]?.values ?? [];
    for (const r of values) out.add(String(r[0] ?? ''));
    return out;
  }

  getCommitFiles(commitHashes: string[]): Array<{ repo_name: string; commit_hash: string; file_path: string }> {
    if (commitHashes.length === 0) return [];
    const db = this.ensureDb();
    const placeholders = commitHashes.map(() => '?').join(',');
    const res = db.exec(
      `SELECT repo_name, commit_hash, file_path FROM commit_files WHERE commit_hash IN (${placeholders})`,
      commitHashes,
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      repo_name: row[0] as string,
      commit_hash: row[1] as string,
      file_path: row[2] as string,
    }));
  }

  getReleaseQualityInputs(from: string, to: string): {
    releases: Array<{ tag_date: string }>;
    commits: Array<{ hash: string; subject: string; committed_at: string; files: string[] }>;
  } {
    const db = this.ensureDb();

    const relRes = db.exec(
      `SELECT released_at FROM releases WHERE released_at >= ? AND released_at <= ? ORDER BY released_at`,
      [from, to],
    );
    const releases = (relRes[0]?.values ?? []).map((row) => ({ tag_date: row[0] as string }));
    if (releases.length === 0) return { releases: [], commits: [] };

    // コミット取得: range + 168h 拡張（post-deploy fix 検出ウィンドウ）
    const FIX_WINDOW_MS = 168 * 60 * 60 * 1000;
    const extTo = new Date(new Date(to).getTime() + FIX_WINDOW_MS).toISOString();

    const comRes = db.exec(
      `SELECT commit_hash, commit_message, committed_at
       FROM session_commits
       WHERE committed_at >= ? AND committed_at <= ?
       GROUP BY commit_hash`,
      [from, extTo],
    );
    const rows = (comRes[0]?.values ?? []).map((row) => ({
      hash: row[0] as string,
      subject: ((row[1] as string) ?? '').split('\n')[0],
      committed_at: row[2] as string,
      files: [] as string[],
    }));

    if (rows.length > 0) {
      const placeholders = rows.map(() => '?').join(',');
      const filesRes = db.exec(
        `SELECT commit_hash, file_path FROM commit_files WHERE commit_hash IN (${placeholders})`,
        rows.map((r) => r.hash),
      );
      if (filesRes[0]) {
        const fileMap = new Map<string, string[]>();
        for (const row of filesRes[0].values) {
          const hash = row[0] as string;
          const fp = row[1] as string;
          const arr = fileMap.get(hash);
          if (arr) arr.push(fp);
          else fileMap.set(hash, [fp]);
        }
        for (const row of rows) {
          row.files = fileMap.get(row.hash) ?? [];
        }
      }
    }

    return { releases, commits: rows };
  }

  getReleasesInRange(from: string, to: string): Array<{ tag: string; released_at: string }> {
    const db = this.ensureDb();
    const res = db.exec(
      `SELECT tag, released_at FROM releases WHERE released_at >= ? AND released_at <= ?`,
      [from, to],
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({ tag: row[0] as string, released_at: row[1] as string }));
  }

  getReleaseFiles(releaseTag: string): ReleaseFileRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM release_files WHERE release_tag = '${releaseTag.replaceAll("'", "''")}'`,
    );
    if (!result[0]?.values) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as unknown as ReleaseFileRow;
    });
  }

  getCoverageByTag(releaseTag: string): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM release_coverage WHERE release_tag = '${releaseTag.replaceAll("'", "''")}'`,
    );
    if (!result[0]?.values) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) =>
      Object.fromEntries(cols.map((col, i) => [col, row[i]])) as unknown as ReleaseCoverageRow,
    );
  }

  getAllReleaseCoverage(): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT release_tag, package, file_path,
              lines_total, lines_covered, lines_pct,
              statements_total, statements_covered, statements_pct,
              functions_total, functions_covered, functions_pct,
              branches_total, branches_covered, branches_pct
       FROM release_coverage`,
    );
    const values = result[0]?.values ?? [];
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return values.map((r) => ({
      release_tag: String(r[0] ?? ''),
      package: String(r[1] ?? ''),
      file_path: String(r[2] ?? ''),
      lines_total: toNum(r[3]),
      lines_covered: toNum(r[4]),
      lines_pct: toNum(r[5]),
      statements_total: toNum(r[6]),
      statements_covered: toNum(r[7]),
      statements_pct: toNum(r[8]),
      functions_total: toNum(r[9]),
      functions_covered: toNum(r[10]),
      functions_pct: toNum(r[11]),
      branches_total: toNum(r[12]),
      branches_covered: toNum(r[13]),
      branches_pct: toNum(r[14]),
    }));
  }

  // ---------------------------------------------------------------------------
  //  getAll* raw methods for Supabase sync (snake_case keys matching SQL columns)
  // ---------------------------------------------------------------------------

  getAllCurrentFileAnalysis(): Array<{
    repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string; analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path, importance_score, fan_in_total, cognitive_complexity_max, function_count,
              dead_code_score, signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
              signal_zero_coverage, signal_isolated_community, is_ignored, ignore_reason, analyzed_at,
              line_count, cyclomatic_complexity_max
       FROM current_file_analysis`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      file_path: String(r[1] ?? ''),
      importance_score: Number(r[2] ?? 0),
      fan_in_total: Number(r[3] ?? 0),
      cognitive_complexity_max: Number(r[4] ?? 0),
      function_count: Number(r[5] ?? 0),
      dead_code_score: Number(r[6] ?? 0),
      signal_orphan: Number(r[7] ?? 0),
      signal_fan_in_zero: Number(r[8] ?? 0),
      signal_no_recent_churn: Number(r[9] ?? 0),
      signal_zero_coverage: Number(r[10] ?? 0),
      signal_isolated_community: Number(r[11] ?? 0),
      is_ignored: Number(r[12] ?? 0),
      ignore_reason: String(r[13] ?? ''),
      analyzed_at: String(r[14] ?? ''),
      line_count: Number(r[15] ?? 0),
      cyclomatic_complexity_max: Number(r[16] ?? 0),
    }));
  }

  getAllReleaseFileAnalysis(): Array<{
    release_tag: string; repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string; analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT release_tag, repo_name, file_path, importance_score, fan_in_total, cognitive_complexity_max, function_count,
              dead_code_score, signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
              signal_zero_coverage, signal_isolated_community, is_ignored, ignore_reason, analyzed_at,
              line_count, cyclomatic_complexity_max
       FROM release_file_analysis`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: String(r[0] ?? ''),
      repo_name: String(r[1] ?? ''),
      file_path: String(r[2] ?? ''),
      importance_score: Number(r[3] ?? 0),
      fan_in_total: Number(r[4] ?? 0),
      cognitive_complexity_max: Number(r[5] ?? 0),
      function_count: Number(r[6] ?? 0),
      dead_code_score: Number(r[7] ?? 0),
      signal_orphan: Number(r[8] ?? 0),
      signal_fan_in_zero: Number(r[9] ?? 0),
      signal_no_recent_churn: Number(r[10] ?? 0),
      signal_zero_coverage: Number(r[11] ?? 0),
      signal_isolated_community: Number(r[12] ?? 0),
      is_ignored: Number(r[13] ?? 0),
      ignore_reason: String(r[14] ?? ''),
      analyzed_at: String(r[15] ?? ''),
      line_count: Number(r[16] ?? 0),
      cyclomatic_complexity_max: Number(r[17] ?? 0),
    }));
  }

  getAllCurrentFunctionAnalysis(): Array<{
    repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT repo_name, file_path, function_name, start_line,
              end_line, language, fan_in, cognitive_complexity,
              data_mutation_score, side_effect_score, line_count,
              importance_score, signal_fan_in_zero, analyzed_at,
              cyclomatic_complexity
       FROM current_function_analysis`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: String(r[0] ?? ''),
      file_path: String(r[1] ?? ''),
      function_name: String(r[2] ?? ''),
      start_line: Number(r[3] ?? 0),
      end_line: Number(r[4] ?? 0),
      language: String(r[5] ?? ''),
      fan_in: Number(r[6] ?? 0),
      cognitive_complexity: Number(r[7] ?? 0),
      data_mutation_score: Number(r[8] ?? 0),
      side_effect_score: Number(r[9] ?? 0),
      line_count: Number(r[10] ?? 0),
      importance_score: Number(r[11] ?? 0),
      signal_fan_in_zero: Number(r[12] ?? 0),
      analyzed_at: String(r[13] ?? ''),
      cyclomatic_complexity: Number(r[14] ?? 0),
    }));
  }

  getAllReleaseFunctionAnalysis(): Array<{
    release_tag: string; repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT release_tag, repo_name, file_path, function_name, start_line,
              end_line, language, fan_in, cognitive_complexity,
              data_mutation_score, side_effect_score, line_count,
              importance_score, signal_fan_in_zero, analyzed_at,
              cyclomatic_complexity
       FROM release_function_analysis`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: String(r[0] ?? ''),
      repo_name: String(r[1] ?? ''),
      file_path: String(r[2] ?? ''),
      function_name: String(r[3] ?? ''),
      start_line: Number(r[4] ?? 0),
      end_line: Number(r[5] ?? 0),
      language: String(r[6] ?? ''),
      fan_in: Number(r[7] ?? 0),
      cognitive_complexity: Number(r[8] ?? 0),
      data_mutation_score: Number(r[9] ?? 0),
      side_effect_score: Number(r[10] ?? 0),
      line_count: Number(r[11] ?? 0),
      importance_score: Number(r[12] ?? 0),
      signal_fan_in_zero: Number(r[13] ?? 0),
      analyzed_at: String(r[14] ?? ''),
      cyclomatic_complexity: Number(r[15] ?? 0),
    }));
  }

  getCoverageSummary(releaseTag: string): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM release_coverage WHERE release_tag = '${releaseTag.replaceAll("'", "''")}'
       AND file_path = '__total__'`,
    );
    if (!result[0]?.values) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) =>
      Object.fromEntries(cols.map((col, i) => [col, row[i]])) as unknown as ReleaseCoverageRow,
    );
  }

  // ---------------------------------------------------------------------------
  //  Quality Metrics
  // ---------------------------------------------------------------------------

  getQualityMetricsInputs(from: string, to: string, prevFrom: string, prevTo: string): {
    releases: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count: number }>;
    messages: Array<{ uuid: string; created_at: string; role: string; type: string; session_id: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost_usd: number }>;
    messageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
    commits: Array<{ hash: string; subject: string; committed_at: string; is_ai_assisted: boolean; files: string[]; lines_added: number; lines_deleted: number; session_id: string }>;
    previousReleases: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count: number }>;
    previousMessages: Array<{ uuid: string; created_at: string; role: string; type: string; session_id: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost_usd: number }>;
    previousMessageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
    previousCommits: Array<{ hash: string; subject: string; committed_at: string; is_ai_assisted: boolean; files: string[]; lines_added: number; lines_deleted: number }>;
  } {
    const db = this.ensureDb();

    const queryReleases = (f: string, t: string) => {
      const res = db.exec(
        `SELECT tag, released_at, fix_count FROM releases WHERE released_at >= ? AND released_at <= ?`,
        [f, t],
      );
      if (!res[0]) return [];
      return res[0].values.map((row) => ({
        id: row[0] as string,
        tag_date: row[1] as string,
        commit_hashes: [] as string[],
        fix_count: (row[2] as number) ?? 0,
      }));
    };

    const queryMessages = (f: string, t: string) => {
      // Two simple range scans + in-memory turn aggregation.
      // The previous CTE+LEAD+LEFT JOIN+GROUP BY took >1min on sql.js (WASM SQLite).
      const userRes = db.exec(
        `SELECT uuid, session_id, timestamp, type
         FROM messages
         WHERE type = 'user' AND timestamp >= ? AND timestamp <= ?`,
        [f, t],
      );
      if (!userRes[0]) return [];

      type UserRow = { uuid: string; session_id: string; timestamp: string; type: string };
      const userMessages: UserRow[] = userRes[0].values.map((row) => ({
        uuid: row[0] as string,
        session_id: row[1] as string,
        timestamp: row[2] as string,
        type: row[3] as string,
      }));

      const usersBySession = new Map<string, UserRow[]>();
      for (const u of userMessages) {
        const arr = usersBySession.get(u.session_id);
        if (arr) arr.push(u);
        else usersBySession.set(u.session_id, [u]);
      }
      for (const arr of usersBySession.values()) {
        arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }

      type Tokens = { input: number; output: number; cr: number; cc: number; cost: number };
      const tokensByUserUuid = new Map<string, Tokens>();
      for (const u of userMessages) {
        tokensByUserUuid.set(u.uuid, { input: 0, output: 0, cr: 0, cc: 0, cost: 0 });
      }

      const asstRes = db.exec(
        `SELECT m.session_id, s.source, m.timestamp, m.input_tokens, m.output_tokens, m.cache_read_tokens, m.cache_creation_tokens, m.model
         FROM messages m
         INNER JOIN sessions s ON s.id = m.session_id
         WHERE m.type = 'assistant' AND m.timestamp >= ? AND m.timestamp <= ?`,
        [f, t],
      );

      if (asstRes[0]) {
        for (const row of asstRes[0].values) {
          const sessionId = row[0] as string;
          const source = row[1] as string;
          const asstTs = row[2] as string;
          const sessionUsers = usersBySession.get(sessionId);
          if (!sessionUsers) continue;

          // Binary search: find the latest user message with timestamp <= asstTs.
          let lo = 0;
          let hi = sessionUsers.length - 1;
          let idx = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (sessionUsers[mid].timestamp <= asstTs) {
              idx = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          if (idx === -1) continue;

          const tokens = tokensByUserUuid.get(sessionUsers[idx].uuid);
          if (!tokens) continue;
          const inputToks = (row[3] as number) ?? 0;
          const outputToks = (row[4] as number) ?? 0;
          const crToks = (row[5] as number) ?? 0;
          const ccToks = (row[6] as number) ?? 0;
          const model = (row[7] as string | null) ?? '';
          tokens.input += inputToks;
          tokens.output += outputToks;
          tokens.cr += crToks;
          tokens.cc += ccToks;
          tokens.cost += calculateCost(model, {
            inputTokens: inputToks,
            outputTokens: outputToks,
            cacheReadTokens: crToks,
            cacheCreationTokens: ccToks,
          }, source as PricingSource);
        }
      }

      return userMessages.map((u) => {
        const tokens = tokensByUserUuid.get(u.uuid) ?? { input: 0, output: 0, cr: 0, cc: 0, cost: 0 };
        return {
          uuid: u.uuid,
          created_at: u.timestamp,
          role: u.type,
          type: 'text',
          session_id: u.session_id,
          input_tokens: tokens.input,
          output_tokens: tokens.output,
          cache_read_tokens: tokens.cr,
          cache_creation_tokens: tokens.cc,
          cost_usd: tokens.cost,
        };
      });
    };

    const queryMessageCommits = (f: string, t: string) => {
      const res = db.exec(
        `SELECT mc.message_uuid, mc.commit_hash, mc.detected_at, mc.match_confidence
         FROM message_commits mc
         INNER JOIN messages m ON mc.message_uuid = m.uuid
         WHERE m.timestamp >= ? AND m.timestamp <= ?
           AND mc.match_confidence IN ('realtime', 'high', 'medium')`,
        [f, t],
      );
      if (!res[0]) return [];
      return res[0].values.map((row) => ({
        message_uuid: row[0] as string,
        commit_hash: row[1] as string,
        detected_at: row[2] as string,
        match_confidence: row[3] as string,
      }));
    };

    // AI First-Try Success Rate は fix コミットを 168h 先まで見る必要があるため、
    // commits の取得範囲を fix 検出ウィンドウぶん拡張する。
    const FIX_WINDOW_MS = 168 * 60 * 60 * 1000;
    const extendedTo = new Date(new Date(to).getTime() + FIX_WINDOW_MS).toISOString();
    const extendedPrevTo = new Date(new Date(prevTo).getTime() + FIX_WINDOW_MS).toISOString();

    const queryCommits = (f: string, t: string) => {
      const res = db.exec(
        `SELECT commit_hash, commit_message, committed_at, is_ai_assisted,
                MAX(lines_added) as lines_added, MAX(lines_deleted) as lines_deleted,
                MIN(session_id) as session_id
         FROM session_commits
         WHERE committed_at >= ? AND committed_at <= ?
         GROUP BY commit_hash`,
        [f, t],
      );
      if (!res[0]) return [];
      const commits = res[0].values.map((row) => ({
        hash: row[0] as string,
        subject: (row[1] as string ?? '').split('\n')[0],
        committed_at: row[2] as string,
        is_ai_assisted: (row[3] as number) === 1,
        files: [] as string[],
        lines_added: (row[4] as number) ?? 0,
        lines_deleted: (row[5] as number) ?? 0,
        session_id: row[6] as string,
      }));
      if (commits.length === 0) return commits;

      const placeholders = commits.map(() => '?').join(',');
      const filesRes = db.exec(
        `SELECT commit_hash, file_path FROM commit_files WHERE commit_hash IN (${placeholders})`,
        commits.map((c) => c.hash),
      );
      if (filesRes[0]) {
        const byHash = new Map<string, string[]>();
        for (const row of filesRes[0].values) {
          const hash = row[0] as string;
          const path = row[1] as string;
          const list = byHash.get(hash);
          if (list) list.push(path);
          else byHash.set(hash, [path]);
        }
        for (const c of commits) {
          c.files = byHash.get(c.hash) ?? [];
        }
      }
      return commits;
    };

    return {
      releases: queryReleases(from, to),
      messages: queryMessages(from, to),
      messageCommits: queryMessageCommits(from, to),
      commits: queryCommits(from, extendedTo),
      previousReleases: queryReleases(prevFrom, prevTo),
      previousMessages: queryMessages(prevFrom, prevTo),
      previousMessageCommits: queryMessageCommits(prevFrom, prevTo),
      previousCommits: queryCommits(prevFrom, extendedPrevTo),
    };
  }

  getCurrentFeatureMatrix(): FeatureMatrix | null {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)');
    const colNames = (cols[0]?.values ?? []).map((r) => String(r[1]));
    if (!colNames.includes('mappings_json')) return null;

    const result = db.exec(
      "SELECT community_id, name, label, mappings_json FROM current_code_graph_communities WHERE name IS NOT NULL AND name != '' AND mappings_json IS NOT NULL ORDER BY community_id",
    );
    const rows = (result[0]?.values ?? []).map((row) => ({
      community_id: Number(row[0]),
      name: String(row[1]),
      label: String(row[2]),
      mappings_json: row[3] == null ? null : String(row[3]),
    }));

    return buildFeatureMatrixFromCommunities(rows);
  }

  // ---------------------------------------------------------------------------
  //  Hotspot / Activity Map (trail-time-axis-requirements 3.2)
  // ---------------------------------------------------------------------------

  fetchHotspotRows(params: {
    from: string;
    to: string;
    granularity: 'commit' | 'session';
    repo?: string;
  }): ReadonlyArray<{ readonly filePath: string; readonly churn: number }> {
    const db = this.ensureDb();
    const { from, to, granularity, repo } = params;

    const sql = repo
      ? HOTSPOT_SQL_BY_GRANULARITY_WITH_REPO[granularity]
      : HOTSPOT_SQL_BY_GRANULARITY[granularity];
    const args = repo ? [from, to, repo] : [from, to];
    const res = db.exec(sql, args);
    if (!res.length) return [];
    return res[0].values.map((row) => ({
      filePath: String(row[0]),
      churn: Number(row[1]),
    }));
  }

  fetchActivityHeatmapRows(params: {
    from: string;
    to: string;
    mode: 'session-file' | 'subagent-file';
    rowLimit?: number;
  }): ReadonlyArray<{
    readonly rowId: string;
    readonly rowLabel: string;
    readonly filePath: string;
    readonly count: number;
  }> {
    const db = this.ensureDb();
    const { from, to, mode, rowLimit = 200 } = params;
    if (mode === 'session-file') {
      const sql = `
        SELECT m.session_id AS rowId,
               COALESCE(MAX(s.slug), m.session_id) AS slug,
               COALESCE(MAX(DATE(m.timestamp)), '') AS sessionDate,
               mtc.file_path AS filePath,
               COUNT(*) AS cnt
        FROM message_tool_calls mtc
        INNER JOIN messages m ON mtc.message_uuid = m.uuid
        LEFT JOIN sessions s ON m.session_id = s.id
        WHERE m.timestamp >= ? AND m.timestamp <= ?
          AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
          AND mtc.file_path IS NOT NULL
        GROUP BY m.session_id, mtc.file_path
        ORDER BY cnt DESC
      `;
      const res = db.exec(sql, [from, to]);
      if (!res.length) return [];
      const rowsAll = res[0].values.map((row) => {
        const sessionId = String(row[0]);
        const slug = String(row[1] ?? sessionId);
        const date = String(row[2] ?? '');
        const shortHash = sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
        const label = date ? `${slug || shortHash} (${date})` : (slug || shortHash);
        return {
          rowId: sessionId,
          rowLabel: label,
          filePath: String(row[3]),
          count: Number(row[4]),
        };
      });
      return limitToTopRowKeys(rowsAll, rowLimit);
    }
    const activityRows = this.fetchSubagentActivityRows({
      from,
      to,
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });
    const counts = new Map<string, { rowId: string; filePath: string; count: number }>();
    for (const r of activityRows) {
      if (!r.subagentType || !r.filePath) continue;
      const key = `${r.subagentType} ${r.filePath}`;
      const cur = counts.get(key);
      if (cur) {
        cur.count++;
      } else {
        counts.set(key, { rowId: r.subagentType, filePath: r.filePath, count: 1 });
      }
    }
    const rowsAll = Array.from(counts.values())
      .map(({ rowId, filePath, count }) => ({ rowId, rowLabel: rowId, filePath, count }))
      .sort((a, b) => b.count - a.count);
    return limitToTopRowKeys(rowsAll, rowLimit);
  }

  fetchActivityTrendRows(params: {
    from: string;
    to: string;
    granularity: ActivityTrendGranularity;
    sessionMode?: 'read' | 'write';
    filePathsIn: ReadonlyArray<string>;
  }): ReadonlyArray<{
    readonly committedAt: string;
    readonly filePath: string;
    readonly subagentType?: string | null;
  }> {
    const db = this.ensureDb();
    const { from, to, granularity, filePathsIn, sessionMode = 'write' } = params;
    if (filePathsIn.length === 0) return [];

    const useTempTable = filePathsIn.length > 900;
    if (useTempTable) {
      db.run('DROP TABLE IF EXISTS _hotspot_paths');
      db.run('CREATE TEMP TABLE _hotspot_paths (file_path TEXT PRIMARY KEY)');
      const stmt = db.prepare('INSERT OR IGNORE INTO _hotspot_paths VALUES (?)');
      try {
        for (const p of filePathsIn) stmt.run([p]);
      } finally {
        stmt.free();
      }
    }

    const inClause = useTempTable
      ? `(SELECT file_path FROM _hotspot_paths)`
      : `(${filePathsIn.map(() => '?').join(',')})`;

    if (granularity === 'subagent') {
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      const allowed = new Set(filePathsIn);
      return this.fetchSubagentActivityRows({
        from,
        to,
        toolNames: SESSION_COUPLING_EDIT_TOOLS,
      })
        .filter((r) => allowed.has(r.filePath))
        .map((r) => ({
          committedAt: r.committedAt,
          filePath: r.filePath,
          subagentType: r.subagentType,
        }));
    }

    if (granularity === 'defect') {
      const sql = `
        SELECT sc.committed_at AS committedAt,
               MIN(cf.file_path) AS filePath,
               NULL AS subagentType
        FROM session_commits sc
        INNER JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
        WHERE sc.committed_at >= ? AND sc.committed_at <= ?
          AND LOWER(sc.commit_message) GLOB 'fix[:(]*'
          AND cf.file_path IN ${inClause}
        GROUP BY sc.commit_hash
        ORDER BY sc.committed_at
      `;
      const bindings = useTempTable ? [from, to] : [from, to, ...filePathsIn];
      const res = db.exec(sql, bindings);
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      if (!res.length) return [];
      return res[0].values.map((row) => {
        const subagentType = row[2];
        return {
          committedAt: String(row[0]),
          filePath: String(row[1]),
          subagentType: subagentType == null ? null : String(subagentType),
        };
      });
    }

    let sql: string;
    let bindings: Array<string | number | null>;
    if (granularity === 'commit') {
      sql = `
        SELECT sc.committed_at AS committedAt, cf.file_path AS filePath, NULL AS subagentType
        FROM commit_files cf
        INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
        WHERE sc.committed_at >= ? AND sc.committed_at <= ?
          AND cf.file_path IN ${inClause}
        ORDER BY sc.committed_at
      `;
      bindings = useTempTable ? [from, to] : [from, to, ...filePathsIn];
    } else {
      const toolNames = sessionMode === 'read'
        ? ACTIVITY_TREND_READ_TOOLS
        : SESSION_COUPLING_EDIT_TOOLS;
      const projectRootCandidates = Array.from(
        new Set(
          this.listCurrentGraphs()
            .map((g) => g.graph?.metadata?.projectRoot)
            .filter((p): p is string => typeof p === 'string' && p.length > 0),
        ),
      ).sort((a, b) => a.length - b.length);
      const normalize = (raw: string): string | null => {
        if (!raw) return null;
        if (!raw.startsWith('/')) return stripWorktreePrefix(raw);
        for (const root of projectRootCandidates) {
          if (raw === root) continue;
          const prefix = root.endsWith('/') ? root : `${root}/`;
          if (raw.startsWith(prefix)) return stripWorktreePrefix(raw.slice(prefix.length));
        }
        return null;
      };
      const allowed = new Set(filePathsIn);
      const toolPlaceholders = toolNames.map(() => '?').join(', ');
      sql = `
        SELECT m.timestamp AS committedAt,
               mtc.file_path AS filePath,
               m.subagent_type AS subagentType
        FROM message_tool_calls mtc
        INNER JOIN messages m ON mtc.message_uuid = m.uuid
        WHERE m.timestamp >= ? AND m.timestamp <= ?
          AND mtc.tool_name IN (${toolPlaceholders})
          AND mtc.file_path IS NOT NULL
          AND mtc.file_path != ''
        ORDER BY m.timestamp
      `;
      bindings = [from, to, ...toolNames];
      const res = db.exec(sql, bindings);
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      if (!res.length) return [];
      return res[0].values.flatMap((row) => {
        const normalized = normalize(String(row[1]));
        if (!normalized || !allowed.has(normalized)) return [];
        const subagentType = row[2];
        return [{
          committedAt: String(row[0]),
          filePath: normalized,
          subagentType: subagentType == null ? null : String(subagentType),
        }];
      });
    }
    const res = db.exec(sql, bindings);
    if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
    if (!res.length) return [];
    return res[0].values.map((row) => {
      const subagentType = row[2];
      return {
        committedAt: String(row[0]),
        filePath: String(row[1]),
        subagentType: subagentType == null ? null : String(subagentType),
      };
    });
  }
}

const HOTSPOT_SQL_BY_GRANULARITY: Record<'commit' | 'session', string> = {
  commit: `
    SELECT cf.file_path AS filePath, COUNT(DISTINCT cf.commit_hash) AS churn
    FROM commit_files cf
    INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
    WHERE sc.committed_at >= ? AND sc.committed_at <= ?
    GROUP BY cf.file_path
    ORDER BY churn DESC
  `,
  session: `
    SELECT mtc.file_path AS filePath, COUNT(*) AS churn
    FROM message_tool_calls mtc
    INNER JOIN messages m ON mtc.message_uuid = m.uuid
    WHERE m.timestamp >= ? AND m.timestamp <= ?
      AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
      AND mtc.file_path IS NOT NULL
    GROUP BY mtc.file_path
    ORDER BY churn DESC
  `,
};

// repo フィルタ付きの hotspot SQL（params: from, to, repo）
const HOTSPOT_SQL_BY_GRANULARITY_WITH_REPO: Record<'commit' | 'session', string> = {
  commit: `
    SELECT cf.file_path AS filePath, COUNT(DISTINCT cf.commit_hash) AS churn
    FROM commit_files cf
    INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
    INNER JOIN sessions s ON s.id = sc.session_id
    WHERE sc.committed_at >= ? AND sc.committed_at <= ?
      AND s.repo_name = ?
    GROUP BY cf.file_path
    ORDER BY churn DESC
  `,
  session: `
    SELECT mtc.file_path AS filePath, COUNT(*) AS churn
    FROM message_tool_calls mtc
    INNER JOIN messages m ON mtc.message_uuid = m.uuid
    INNER JOIN sessions s ON s.id = m.session_id
    WHERE m.timestamp >= ? AND m.timestamp <= ?
      AND s.repo_name = ?
      AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
      AND mtc.file_path IS NOT NULL
    GROUP BY mtc.file_path
    ORDER BY churn DESC
  `,
};

function matchCodexSessionByTime(
  delegationMs: number,
  candidates: ReadonlyArray<{ readonly id: string; readonly startMs: number; readonly endMs: number }>,
): string | null {
  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const s of candidates) {
    const inside = delegationMs >= s.startMs - 5 * 60_000 && delegationMs <= s.endMs + 5 * 60_000;
    const score = Math.abs(s.startMs - delegationMs);
    if (inside && score < bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  if (bestId) return bestId;
  for (const s of candidates) {
    const score = Math.abs(s.startMs - delegationMs);
    if (score <= 60 * 60_000 && score < bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  return bestId;
}

function limitToTopRowKeys<T extends { rowId: string; count: number }>(
  rows: ReadonlyArray<T>,
  rowLimit: number,
): T[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.rowId, (totals.get(r.rowId) ?? 0) + r.count);
  }
  const topKeys = new Set(
    Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, rowLimit)
      .map(([k]) => k),
  );
  return rows.filter((r) => topKeys.has(r.rowId));
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  source?: PricingSource,
): number {
  return calculateCost(
    model,
    {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    },
    source,
  );
}

// ---------------------------------------------------------------------------
//  File utilities
// ---------------------------------------------------------------------------

/** Recursively find all .jsonl files under a directory. */
function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.endsWith('.jsonl') && stat.isFile()) {
        results.push(fullPath);
      }
    } catch {
      // skip
    }
  }
  return results;
}
