import type { Database, Statement as SqlJsStatement } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toUTC, getSqliteTzOffset } from './dateUtils';
import {
  CREATE_SESSIONS,
  CREATE_SESSION_COSTS,
  CREATE_DAILY_COSTS,
  CREATE_MESSAGES,
  CREATE_SESSION_COMMITS,
  CREATE_IMPORTED_FILES,
  CREATE_C4_MODELS,
  CREATE_CURRENT_GRAPHS,
  CREATE_RELEASE_GRAPHS,
  CREATE_SKILL_MODELS as CREATE_SKILL_MODELS_TABLE,
  CREATE_SKILL_MODELS_RESOLVED_VIEW,
  CREATE_INDEXES,
  CREATE_RELEASES,
  CREATE_RELEASE_FILES,
  CREATE_RELEASE_FEATURES,
  CREATE_RELEASE_COVERAGE,
  CREATE_RELEASE_INDEXES,
  CREATE_MESSAGE_TOOL_CALLS,
  CREATE_MESSAGE_TOOL_CALLS_INDEXES,
  DEFAULT_SKILL_MODELS,
  extractSkillName,
  buildReleaseFromGitData,
  analyze,
  trailToC4,
} from '@anytime-markdown/trail-core';
import type { TrailGraph, IC4ModelStore, C4ModelEntry, C4ModelResult } from '@anytime-markdown/trail-core';
import { ExecFileGitService } from './ExecFileGitService';
import { TrailLogger } from '../utils/TrailLogger';
import { ClaudeCodeBehaviorAnalyzer } from './ClaudeCodeBehaviorAnalyzer';
import type { ReleaseFileRow, ReleaseFeatureRow, ReleaseCoverageRow, ReleaseRow } from '@anytime-markdown/trail-core';
export type { ReleaseFileRow, ReleaseFeatureRow, ReleaseCoverageRow, ReleaseRow } from '@anytime-markdown/trail-core';

declare const __non_webpack_require__: (id: string) => unknown;

const DEFAULT_DB_DIR = path.join(os.homedir(), '.claude', 'trail');

const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

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
  readonly project: string;
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
}

interface SessionFilters {
  readonly branch?: string;
  readonly model?: string;
  readonly project?: string;
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
  };
  readonly toolUsage: readonly { name: string; count: number }[];
  readonly modelBreakdown: readonly {
    readonly model: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly estimatedCostUsd: number;
  }[];
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

interface BehaviorData {
  readonly toolSequences: readonly { period: string; sequence: string; count: number }[];
  readonly repeatOps: readonly { period: string; count: number }[];
  readonly avgToolsPerTurn: readonly { period: string; avg: number }[];
  readonly subagentRate: readonly { period: string; rate: number; byType: Readonly<Record<string, number>> }[];
  readonly errorRate: readonly { period: string; rate: number; byTool: Readonly<Record<string, number>> }[];
  readonly skillStats: readonly { period: string; skill: string; count: number; costUsd: number }[];
  readonly cacheEfficiency: readonly { period: string; hitRate: number; isAnomaly: boolean }[];
  readonly corrections: readonly { period: string; count: number; preTool: Readonly<Record<string, number>> }[];
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
  (id, slug, project, repo_name, version, entrypoint, model,
   start_time, end_time, message_count,
   file_path, file_size, imported_at)
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
   permission_mode, skill, agent_id, system_command)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;


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

/**
 * Extract Agent tool call description and model from tool_calls JSON.
 * Returns the first Agent call found (most messages have at most one).
 */
function extractAgentInfo(
  toolCallsJson: string | null,
): { description: string | null; model: string | null } {
  if (!toolCallsJson) return { description: null, model: null };
  try {
    const calls = JSON.parse(toolCallsJson) as { name?: string; input?: Record<string, unknown> }[];
    const agentCall = calls.find((c) => c.name === 'Agent');
    if (!agentCall?.input) return { description: null, model: null };
    return {
      description: (agentCall.input.description as string) ?? null,
      model: (agentCall.input.model as string) ?? null,
    };
  } catch {
    return { description: null, model: null };
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
  private readonly dbDir: string;
  private readonly dbPath: string;

  constructor(private readonly distPath: string, storageDir?: string) {
    this.dbDir = storageDir ?? DEFAULT_DB_DIR;
    this.dbPath = path.join(this.dbDir, 'trail.db');
  }

  async init(): Promise<void> {
    // Load sql-asm.js from dist/ directory using __non_webpack_require__
    // to bypass webpack bundling (bundling breaks sql.js module system)
    const sqlAsmPath = path.join(this.distPath, 'sql-asm.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const initSqlJs = __non_webpack_require__(sqlAsmPath) as typeof import('sql.js').default;
    const SQL = await initSqlJs();
    console.log('[TrailDatabase] sql.js initialized, DB_PATH =', this.dbPath);

    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

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
    db.run(CREATE_DAILY_COSTS);
    db.run(CREATE_MESSAGES);
    db.run(CREATE_SESSION_COMMITS);
    db.run(CREATE_RELEASES);
    db.run(CREATE_RELEASE_FILES);
    db.run(CREATE_RELEASE_FEATURES);
    db.run(CREATE_RELEASE_COVERAGE);
    db.run(CREATE_C4_MODELS);
    this.migrateCurrentGraphsSchema(db);
    db.run(CREATE_CURRENT_GRAPHS);
    db.run(CREATE_RELEASE_GRAPHS);
    this.migrateTrailGraphsTable(db);
    db.run(CREATE_SKILL_MODELS_TABLE);
    db.run(CREATE_SKILL_MODELS_RESOLVED_VIEW);
    for (const sql of [...CREATE_INDEXES, ...CREATE_RELEASE_INDEXES]) {
      db.run(sql);
    }
    db.run(CREATE_MESSAGE_TOOL_CALLS);
    for (const sql of CREATE_MESSAGE_TOOL_CALLS_INDEXES) {
      db.run(sql);
    }

    // Add columns for existing DBs (may already exist)
    try {
      db.run('ALTER TABLE sessions ADD COLUMN commits_resolved_at TEXT');
    } catch {
      // Column already exists — ignore
    }
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
      'ALTER TABLE messages ADD COLUMN system_command TEXT',
    ];
    for (const sql of messageAlters) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }

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
        TrailLogger.warn(
          `migrateTrailGraphsTable: dropped ${orphans.length} orphan tag(s) not present in releases: ${orphans.join(', ')}`,
        );
      }

      db.run('DROP TABLE trail_graphs');
      TrailLogger.info(
        `migrateTrailGraphsTable: migrated trail_graphs → release_graphs (releases=${(othersRes[0]?.values?.length ?? 0) - orphans.length}, dropped_current=${droppedCurrent})`,
      );
      // sql.js はインメモリなので、マイグレーション結果をディスクに即時永続化する
      this.save();
    } catch (e) {
      TrailLogger.error('migrateTrailGraphsTable failed', e);
    }
  }

  /**
   * current_graphs のスキーマが旧版（id 列 PK）だった場合、テーブルを破棄して新版で作り直す。
   * データは空のため内容移行は行わない（ユーザー指示で事前クリア済み）。
   */
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
      TrailLogger.info('migrateCurrentGraphsSchema: dropped legacy current_graphs (id PK) for recreation with repo_name PK');
      this.save();
    } catch (e) {
      TrailLogger.error('migrateCurrentGraphsSchema failed', e);
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
      TrailLogger.warn(`getAllAssistantMessages failed: ${(err as Error).message}`);
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

  getAllDailyCosts(): readonly {
    date: string;
    model: string;
    cost_type: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT date, model, cost_type, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd
       FROM daily_costs`,
    );
    if (!result[0]) return [];
    return result[0].values.map((r) => ({
      date: r[0] as string,
      model: r[1] as string,
      cost_type: r[2] as string,
      input_tokens: r[3] as number,
      output_tokens: r[4] as number,
      cache_read_tokens: r[5] as number,
      cache_creation_tokens: r[6] as number,
      estimated_cost_usd: r[7] as number,
    }));
  }

  getAllMessageToolCalls(): readonly {
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
    const result = db.exec('SELECT * FROM message_tool_calls ORDER BY id ASC');
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]]))) as ReturnType<TrailDatabase['getAllMessageToolCalls']>;
  }

  /** Delete and rebuild session_costs from all messages. */
  private rebuildSessionCosts(): void {
    const db = this.ensureDb();
    db.run('DELETE FROM session_costs');

    const result = db.exec(
      `SELECT session_id, COALESCE(model,''),
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages WHERE type = 'assistant'
       GROUP BY session_id, model`,
    );
    const stmt = db.prepare(INSERT_SESSION_COST);
    for (const row of result[0]?.values ?? []) {
      const sid = String(row[0]); const m = String(row[1]);
      const inp = Number(row[2]); const outp = Number(row[3]);
      const cr = Number(row[4]); const cc = Number(row[5]);
      stmt.run([sid, m, inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
    }
    stmt.free();
  }

  /** Delete and rebuild daily_costs from all messages in a single pass. */
  private rebuildDailyCosts(): void {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();

    db.run('DELETE FROM daily_costs');

    const INSERT_DC = `INSERT INTO daily_costs
      (date, model, cost_type, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
      VALUES (?,?,?,?,?,?,?,?)`;
    const stmt = db.prepare(INSERT_DC);

    // actual
    const actual = db.exec(
      `SELECT DATE(timestamp, '${tzOffset}'), COALESCE(model,''),
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages WHERE type = 'assistant'
       GROUP BY DATE(timestamp, '${tzOffset}'), model`,
    );
    for (const row of actual[0]?.values ?? []) {
      const d = String(row[0]); const m = String(row[1]);
      const inp = Number(row[2]); const outp = Number(row[3]);
      const cr = Number(row[4]); const cc = Number(row[5]);
      stmt.run([d, m, 'actual', inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
    }

    // Auto-register new skills that are not yet in skill_models
    db.run(
      `INSERT OR IGNORE INTO skill_models (skill, recommended_model)
       SELECT DISTINCT m.skill, 'sonnet'
       FROM messages m
       WHERE m.skill IS NOT NULL
         AND m.skill NOT IN (SELECT skill FROM skill_models)`,
    );

    // skill (uses skill_models_resolved view, defaults to 'sonnet' for unmatched)
    const skill = db.exec(
      `SELECT DATE(a.timestamp, '${tzOffset}'),
        COALESCE(sm.recommended_model, 'sonnet'),
        SUM(a.input_tokens), SUM(a.output_tokens),
        SUM(a.cache_read_tokens), SUM(a.cache_creation_tokens)
       FROM messages a
       LEFT JOIN skill_models_resolved sm ON a.skill = sm.skill
       WHERE a.type = 'assistant'
       GROUP BY DATE(a.timestamp, '${tzOffset}'),
         COALESCE(sm.recommended_model, 'sonnet')`,
    );
    for (const row of skill[0]?.values ?? []) {
      const d = String(row[0]); const m = String(row[1]);
      const inp = Number(row[2]); const outp = Number(row[3]);
      const cr = Number(row[4]); const cc = Number(row[5]);
      stmt.run([d, m, 'skill', inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
    }

    stmt.free();
  }

  save(): void {
    const db = this.ensureDb();
    const data = db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
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
  private getImportedFileMap(): Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT s.id, s.file_path, s.file_size, s.commits_resolved_at,
        CASE WHEN s.message_count = 0 THEN 1
             WHEN EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id) THEN 1
             ELSE 0 END AS has_messages
       FROM sessions s`,
    );
    const map = new Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean }>();
    for (const row of result[0]?.values ?? []) {
      map.set(String(row[1]), {
        sessionId: String(row[0]),
        fileSize: Number(row[2]),
        commitsResolved: row[3] != null,
        hasMessages: Number(row[4]) === 1,
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

  resolveCommits(sessionId: string, gitRoot: string): number {
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
         is_ai_assisted, files_changed, lines_added, lines_deleted)
        VALUES (?,?,?,?,?,?,?,?,?)`,
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

      count += this.processCommitEntries(phaseAOutput, sessionId, insertStmt, execOpts, gitRoot);
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
        db.run(
          "UPDATE sessions SET commits_resolved_at = datetime('now') WHERE id = ?",
          [sessionId],
        );
        return count;
      }
    }

    count += this.processCommitEntries(logOutput, sessionId, insertStmt, execOpts, gitRoot, true);

    insertStmt.free();

    db.run(
      "UPDATE sessions SET commits_resolved_at = datetime('now') WHERE id = ?",
      [sessionId],
    );

    return count;
  }

  /** Parse git log output and insert commits into session_commits table.
   *  @param filterBySessionId If true, skip commits whose Session-Id trailer belongs to another session */
  private processCommitEntries(
    logOutput: string,
    sessionId: string,
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
      try {
        const numstat = execFileSync('git', [
          'diff', '--numstat', `${hash}^..${hash}`,
        ], { ...execOpts, cwd: gitRoot });

        for (const line of numstat.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const [added, deleted] = trimmed.split('\t');
          filesChanged++;
          if (added !== '-') linesAdded += Number.parseInt(added, 10) || 0;
          if (deleted !== '-') linesDeleted += Number.parseInt(deleted, 10) || 0;
        }
      } catch {
        // Initial commit or other error — skip numstat
      }

      insertStmt.run([
        sessionId, hash, subject, author, committedAt,
        isAiAssisted, filesChanged, linesAdded, linesDeleted,
      ]);
      count++;
    }

    return count;
  }

  /** @returns number of messages imported */
  importSession(filePath: string, projectName: string, isSubagent = false, externalTransaction = false, repoName = ''): number {
    const db = this.ensureDb();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');

    const parsed: RawLine[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as RawLine);
      } catch {
        // Skip malformed lines
      }
    }

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

    if (!sessionId) return 0;

    const fileSize = fs.statSync(filePath).size;
    const importedAt = new Date().toISOString();

    if (!externalTransaction) db.run('BEGIN TRANSACTION');
    try {
      // Insert/update session metadata only for main session files
      if (!isSubagent) {
        db.run(INSERT_SESSION, [
          sessionId, slug, projectName, repoName, version,
          entrypoint, model, startTime, endTime, messageCount,
          filePath, fileSize, importedAt,
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
        const toolUseResult = raw.toolUseResult != null
          ? (typeof raw.toolUseResult === 'string'
            ? raw.toolUseResult
            : JSON.stringify(raw.toolUseResult))
          : null;

        // --- Analytics fields ---
        const durationMs = raw.durationMs ?? null;
        const toolResultSize = estimateTokenCount(toolUseResult);
        const agentInfo = extractAgentInfo(toolCalls);

        // --- New metadata fields ---
        const permMode = raw.permissionMode ?? null;
        const skill = extractSkillName(toolCalls);
        const agentId = raw.agentId ?? null;
        const systemCommand = raw.subtype === 'compact_boundary' ? '/compact'
          : raw.subtype === 'local_command' ? '/clear'
          : null;

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
          systemCommand,
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
    gitRoot?: string,
  ): Promise<{ imported: number; skipped: number; commitsResolved: number; releasesResolved: number; releasesAnalyzed: number; coverageImported: number }> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const repoName = gitRoot ? path.basename(gitRoot) : '';
    let imported = 0;
    let skipped = 0;
    let commitsResolved = 0;


    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return { imported, skipped, commitsResolved, releasesResolved: 0, releasesAnalyzed: 0, coverageImported: 0 };
    }

    // Pre-load imported file paths + sizes for fast skip
    const importedFiles = this.getImportedFileMap();
    const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

    // Collect files per session directory (main + subagents grouped)
    type SessionDir = { sid: string; mainFile: string; subagentFiles: string[]; projectName: string };
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

        sessionDirs.push({ sid, mainFile, subagentFiles, projectName });
      }
    }

    const totalSessions = sessionDirs.length;
    const totalFiles = sessionDirs.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    onProgress?.(`Found ${totalSessions} sessions (${totalFiles} files)`, 0);

    const BATCH_MESSAGE_LIMIT = 20_000;
    const BATCH_FILE_LIMIT = 100;
    let batchMessageCount = 0;
    let batchFileCount = 0;
    let inTransaction = false;
    let processedFiles = 0;

    for (const dir of sessionDirs) {
      // Skip entire session (main + all subagents) if main file size unchanged
      // and the existing row actually has messages. A session row with zero messages
      // is a leftover from a previously-failed import and must be re-processed.
      const existing = importedFiles.get(dir.mainFile);
      if (existing && existing.hasMessages) {
        let currentFileSize = 0;
        try { currentFileSize = fs.statSync(dir.mainFile).size; } catch (e) { TrailLogger.error(`statSync failed: ${dir.mainFile}`, e); skipped++; continue; }
        if (currentFileSize <= existing.fileSize) {
          skipped += 1 + dir.subagentFiles.length;
          processedFiles += 1 + dir.subagentFiles.length;
          if (gitRoot && !existing.commitsResolved) {
            try { commitsResolved += this.resolveCommits(dir.sid, gitRoot); } catch (e) { TrailLogger.error(`resolveCommits failed (skipped session): ${dir.sid}`, e); }
          }
          continue;
        }
      }

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
          const msgCount = this.importSession(file.filePath, dir.projectName, file.isSubagent, true, repoName);
          imported++;
          batchMessageCount += msgCount;
          batchFileCount++;
        } catch (e) {
          TrailLogger.error(`importSession failed: ${file.filePath}`, e);
        }
        processedFiles++;
      }

      // Resolve commits after all files for this session
      if (gitRoot) {
        try { commitsResolved += this.resolveCommits(dir.sid, gitRoot); } catch (e) { TrailLogger.error(`resolveCommits failed: ${dir.sid}`, e); }
      }

      // Commit at session boundary when limits exceeded
      if (batchMessageCount >= BATCH_MESSAGE_LIMIT || batchFileCount >= BATCH_FILE_LIMIT) {
        if (inTransaction) {
          try { db.run('COMMIT'); } catch (e) { TrailLogger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (re) { TrailLogger.error('ROLLBACK also failed', re); } }
          inTransaction = false;
        }
        onProgress?.(`${batchMessageCount} messages (${processedFiles}/${totalFiles}, skipped ${skipped})`, 0);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // Commit remaining batch
    if (inTransaction) {
      const db = this.ensureDb();
      try { db.run('COMMIT'); } catch (e) { TrailLogger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (re) { TrailLogger.error('ROLLBACK also failed', re); } }
      inTransaction = false;
      onProgress?.(`${batchMessageCount} messages (${processedFiles}/${totalFiles}, skipped ${skipped})`, 0);
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
    if (gitRoot) {
      try {
        onProgress?.('Analyzing releases...', 0);
        releasesAnalyzed = this.analyzeReleases(gitRoot, (msg) => onProgress?.(msg, 0));
        onProgress?.(`Releases analyzed: ${releasesAnalyzed}`, 0);
      } catch {
        // Skip analysis errors
      }
    }

    // Import coverage data from packages/*/coverage/coverage-summary.json
    let coverageImported = 0;
    if (gitRoot) {
      try {
        onProgress?.('Importing coverage data...', 0);
        coverageImported = this.importCoverage(gitRoot);
        onProgress?.(`Coverage imported: ${coverageImported} entries`, 0);
      } catch {
        // Skip coverage import errors
      }
    }

    // Rebuild session_costs and daily_costs from all messages
    onProgress?.('Rebuilding session costs...', 0);
    this.rebuildSessionCosts();
    onProgress?.('Session costs rebuilt', 0);
    onProgress?.('Rebuilding daily costs...', 0);
    this.rebuildDailyCosts();
    onProgress?.('Daily costs rebuilt', 0);

    // Analyze Claude Code behavior for all sessions (INSERT OR IGNORE ensures idempotency)
    const db = this.ensureDb();
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    onProgress?.('Analyzing Claude Code behavior...', 0);
    for (const dir of sessionDirs) {
      try {
        analyzer.analyze(dir.sid, db);
      } catch (e) {
        TrailLogger.error(`ClaudeCodeBehaviorAnalyzer failed for session ${dir.sid}`, e);
      }
    }

    this.save();
    return { imported, skipped, commitsResolved, releasesResolved, releasesAnalyzed, coverageImported };
  }

  saveCurrentGraph(graph: TrailGraph, tsconfigPath: string, commitId: string, repoName: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO current_graphs
         (repo_name, commit_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
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

  saveReleaseGraph(graph: TrailGraph, tsconfigPath: string, tag: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO release_graphs
         (tag, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
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
        TrailLogger.warn(`listCurrentGraphs: failed to parse graph_json for repo=${repoName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
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
    if (filters?.project) {
      conditions.push('s.project = ?');
      params.push(filters.project);
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
  } {
    const zero = {
      totalRetries: 0, totalEdits: 0,
      totalBuildRuns: 0, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
    };
    try {
      const db = this.ensureDb();

      // Fetch assistant messages with tool_calls, joined with their
      // child tool-result messages to get tool_use_result.
      const whereClause = sessionId
        ? 'WHERE m1.session_id = ? AND m1.tool_calls IS NOT NULL'
        : 'WHERE m1.tool_calls IS NOT NULL';
      const sql = `SELECT m1.session_id, m1.tool_calls, m2.tool_use_result
        FROM messages m1
        LEFT JOIN messages m2
          ON m2.parent_uuid = m1.uuid AND m2.tool_use_result IS NOT NULL
        ${whereClause}`;
      const params = sessionId ? [sessionId] : [];
      const result = db.exec(sql, params);
      if (!result[0]) return zero;

      const BUILD_RE = /\b(npm run build|npx tsc|tsc\b|webpack|vite build|esbuild|rollup)\b/;
      const TEST_RE = /\b(jest|vitest|npm run test|npm test|npx jest)\b/;
      const FAIL_RE = /error|FAIL|ERR!|exit code [1-9]|non-zero exit|Command failed/i;

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

      return {
        totalRetries, totalEdits,
        totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
      };
    } catch {
      return zero;
    }
  }

  getAnalytics(): AnalyticsData {
    const db = this.ensureDb();

    // Token totals from session_costs
    const totals = db.exec(
      `SELECT COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0),
        COALESCE(SUM(cache_read_tokens),0),
        COALESCE(SUM(cache_creation_tokens),0),
        COALESCE(SUM(estimated_cost_usd),0),
        (SELECT COUNT(*) FROM sessions)
      FROM session_costs`,
    );
    const tr = totals[0]?.values[0] ?? [0, 0, 0, 0, 0, 0];
    const totalInput = Number(tr[0]);
    const totalOutput = Number(tr[1]);
    const totalCacheRead = Number(tr[2]);
    const totalCacheCreation = Number(tr[3]);
    const totalEstimatedCost = Number(tr[4]);
    const totalSessions = Number(tr[5]);

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

    // Model breakdown from session_costs
    const modelResult = db.exec(
      `SELECT model, COUNT(DISTINCT session_id),
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(estimated_cost_usd)
       FROM session_costs WHERE model != ''
       GROUP BY model ORDER BY SUM(estimated_cost_usd) DESC`,
    );
    const modelBreakdown = (modelResult[0]?.values ?? []).map((r) => ({
      model: String(r[0]),
      sessions: Number(r[1]),
      inputTokens: Number(r[2]),
      outputTokens: Number(r[3]),
      cacheReadTokens: Number(r[4]),
      estimatedCostUsd: Number(r[5]),
    }));

    // Daily activity from daily_costs (last 90 days — frontend filters to 7/30/90)
    const tzOffset = this.getLocalTzOffset();
    const dailyResult = db.exec(
      `SELECT date,
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens),
        SUM(estimated_cost_usd),
        0 AS sessions
       FROM daily_costs
       WHERE cost_type = 'actual' AND date >= DATE('now', '${tzOffset}', '-90 days')
       GROUP BY date ORDER BY date`,
    );
    const dailyActivity = (dailyResult[0]?.values ?? []).map((r) => ({
      date: String(r[0]),
      sessions: Number(r[6]),
      inputTokens: Number(r[1]),
      outputTokens: Number(r[2]),
      cacheReadTokens: Number(r[3]),
      cacheCreationTokens: Number(r[4]),
      estimatedCostUsd: Number(r[5]),
    }));

    // Commit totals
    const commitTotals = db.exec(
      `SELECT COUNT(*) AS total_commits,
        COALESCE(SUM(lines_added), 0) AS total_lines_added,
        COALESCE(SUM(lines_deleted), 0) AS total_lines_deleted
      FROM session_commits`,
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
        ...toolMetrics,
      },
      toolUsage,
      modelBreakdown,
      dailyActivity,
    };
  }

  getBehaviorData(period: 'day' | 'week' | 'session', rangeDays: 30 | 90 | 180): BehaviorData {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();
    const periodExpr =
      period === 'day' ? `DATE(timestamp, '${tzOffset}')`
      : period === 'week' ? `strftime('%Y-W%W', timestamp, '${tzOffset}')`
      : 'session_id';

    const toRows = (result: ReturnType<typeof db.exec>): Record<string, unknown>[] => {
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    };

    // ③ avgToolsPerTurn
    const avgResult = db.exec(
      `SELECT ${periodExpr} AS period, AVG(tools_per_turn) AS avg
       FROM (
         SELECT ${periodExpr} AS period, session_id, turn_index, COUNT(*) AS tools_per_turn
         FROM message_tool_calls
         WHERE timestamp >= datetime('now', '-${rangeDays} days')
         GROUP BY period, session_id, turn_index
       )
       GROUP BY period ORDER BY period`,
    );
    const avgToolsPerTurn = toRows(avgResult).map(r => ({
      period: String(r['period'] ?? ''),
      avg: Number(r['avg'] ?? 0),
    }));

    // ④ subagentRate
    const subResult = db.exec(
      `SELECT ${periodExpr} AS period,
              CAST(SUM(CASE WHEN tool_name = 'Agent' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS rate,
              SUM(CASE WHEN tool_name = 'Agent' THEN 1 ELSE 0 END) AS agent_count,
              COUNT(*) AS total
       FROM message_tool_calls
       WHERE timestamp >= datetime('now', '-${rangeDays} days')
       GROUP BY period ORDER BY period`,
    );
    const subagentRate = toRows(subResult).map(r => ({
      period: String(r['period'] ?? ''),
      rate: Number(r['rate'] ?? 0),
      byType: { Agent: Number(r['agent_count'] ?? 0) },
    }));

    // ⑤ errorRate
    const errResult = db.exec(
      `SELECT ${periodExpr} AS period,
              CAST(SUM(is_error) AS REAL) / COUNT(*) AS rate,
              tool_name,
              SUM(is_error) AS err_count
       FROM message_tool_calls
       WHERE timestamp >= datetime('now', '-${rangeDays} days')
       GROUP BY period, tool_name ORDER BY period`,
    );
    const errByPeriod: Record<string, { rate: number; byTool: Record<string, number> }> = {};
    for (const r of toRows(errResult)) {
      const p = String(r['period'] ?? '');
      if (!errByPeriod[p]) errByPeriod[p] = { rate: Number(r['rate'] ?? 0), byTool: {} };
      const tool = String(r['tool_name'] ?? '');
      errByPeriod[p].byTool[tool] = Number(r['err_count'] ?? 0);
    }
    const errorRate = Object.entries(errByPeriod).map(([period, v]) => ({
      period, rate: v.rate, byTool: v.byTool,
    }));

    // ⑥ skillStats
    const skillResult = db.exec(
      `SELECT ${periodExpr} AS period, skill_name AS skill, COUNT(*) AS count
       FROM message_tool_calls
       WHERE timestamp >= datetime('now', '-${rangeDays} days') AND skill_name IS NOT NULL
       GROUP BY period, skill_name ORDER BY period, count DESC`,
    );
    const skillStats = toRows(skillResult).map(r => ({
      period: String(r['period'] ?? ''),
      skill: String(r['skill'] ?? ''),
      count: Number(r['count'] ?? 0),
      costUsd: 0, // cost join not yet implemented
    }));

    // ② repeatOps: turns where 3+ consecutive same-tool calls
    const repeatResult = db.exec(
      `SELECT ${periodExpr} AS period, COUNT(*) AS count
       FROM (
         SELECT ${periodExpr} AS period, session_id, turn_index
         FROM message_tool_calls
         WHERE timestamp >= datetime('now', '-${rangeDays} days')
         GROUP BY period, session_id, turn_index
         HAVING COUNT(*) >= 3
       )
       GROUP BY period ORDER BY period`,
    );
    const repeatOps = toRows(repeatResult).map(r => ({
      period: String(r['period'] ?? ''),
      count: Number(r['count'] ?? 0),
    }));

    // ① toolSequences: top-10 tool name per turn grouped by period
    const seqResult = db.exec(
      `SELECT ${periodExpr} AS period, tool_name AS sequence, COUNT(*) AS count
       FROM message_tool_calls
       WHERE timestamp >= datetime('now', '-${rangeDays} days')
       GROUP BY period, tool_name
       ORDER BY count DESC
       LIMIT 10`,
    );
    const toolSequences = toRows(seqResult).map(r => ({
      period: String(r['period'] ?? ''),
      sequence: String(r['sequence'] ?? ''),
      count: Number(r['count'] ?? 0),
    }));

    return {
      toolSequences,
      repeatOps,
      avgToolsPerTurn,
      subagentRate,
      errorRate,
      skillStats,
      cacheEfficiency: [], // future: requires session_costs join
      corrections: [],     // future: requires user message analysis
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

    // 2. Skill-based estimate from daily_costs
    const skillResult = db.exec(
      `SELECT model, SUM(estimated_cost_usd)
       FROM daily_costs WHERE cost_type = 'skill'
       GROUP BY model`,
    );
    const skillByModel: Record<string, number> = {};
    let skillTotal = 0;
    for (const row of skillResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      skillByModel[m] = (skillByModel[m] ?? 0) + c;
      skillTotal += c;
    }

    // 4. Daily breakdown from daily_costs (last 90 days)
    const dailyResult = db.exec(
      `SELECT date, cost_type, SUM(estimated_cost_usd)
       FROM daily_costs
       WHERE date >= DATE('now', '${tzOffset}', '-90 days')
       GROUP BY date, cost_type ORDER BY date`,
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

    // 5. Model distribution (message count)
    const distActual = db.exec(
      `SELECT COALESCE(model,'unknown'), COUNT(*) FROM messages WHERE type = 'assistant' GROUP BY model`,
    );
    const actualDist: Record<string, number> = {};
    for (const row of distActual[0]?.values ?? []) {
      actualDist[String(row[0])] = Number(row[1]);
    }

    const distSkill = db.exec(
      `SELECT COALESCE(sm.recommended_model, 'sonnet'), COUNT(*)
       FROM messages a
       LEFT JOIN skill_models_resolved sm ON a.skill = sm.skill
       WHERE a.type = 'assistant'
       GROUP BY COALESCE(sm.recommended_model, 'sonnet')`,
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
        affectedPackages: packages,
      });

      db.run(
        `INSERT OR REPLACE INTO releases (
          tag, released_at, prev_tag, repo_name, package_tags,
          commit_count, files_changed, lines_added, lines_deleted,
          feat_count, fix_count, refactor_count, test_count, other_count,
          affected_packages, duration_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    onProgress?: (message: string) => void,
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

        // 解析実行
        const graph = analyze({
          tsconfigPath: worktreeTsconfig,
          exclude: ['.worktrees', '.vscode-test', '__tests__', 'fixtures'],
        });

        // 保存（tsconfigPath は canonical パスを記録）
        this.saveReleaseGraph(graph, tsconfigPath, tag);
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

  getReleaseFeatures(releaseTag: string): ReleaseFeatureRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM release_features WHERE release_tag = '${releaseTag.replaceAll("'", "''")}'`,
    );
    if (!result[0]?.values) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as unknown as ReleaseFeatureRow;
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
  //  C4 Model
  // ---------------------------------------------------------------------------

  private saveC4Model(json: string, revision: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO c4_models (id, model_json, revision, updated_at)
       VALUES ('current', ?, ?, ?)`,
      [json, revision, new Date().toISOString()],
    );
    this.save();
  }

  getC4Model(): { json: string; revision: string } | null {
    const db = this.ensureDb();
    const res = db.exec(
      "SELECT model_json, revision FROM c4_models WHERE id = 'current'",
    );
    if (!res.length || !res[0].values.length) return null;
    const [json, revision] = res[0].values[0] as [string, string];
    return { json, revision };
  }
}

// ---------------------------------------------------------------------------
//  Cost estimation
// ---------------------------------------------------------------------------

export interface ModelRates {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

/** Per-1M-token rates in USD. */
const MODEL_RATES: Record<string, ModelRates> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheCreation: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreation: 1.0 },
};

const DEFAULT_RATES: ModelRates = { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 };

function getModelRates(model: string): ModelRates {
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.includes(key)) return rates;
  }
  // Fallback heuristics
  if (model.includes('opus')) return MODEL_RATES['claude-opus-4-6'];
  if (model.includes('haiku')) return MODEL_RATES['claude-haiku-4-5'];
  return DEFAULT_RATES;
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
): number {
  const rates = getModelRates(model);
  return (
    (inputTokens * rates.input +
      outputTokens * rates.output +
      cacheReadTokens * rates.cacheRead +
      cacheCreationTokens * rates.cacheCreation) /
    1_000_000
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
