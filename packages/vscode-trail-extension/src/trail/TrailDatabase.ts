import type { Database } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toUTC } from './dateUtils';
import {
  CREATE_TASKS,
  CREATE_TASK_FILES,
  CREATE_TASK_C4_ELEMENTS,
  CREATE_TASK_FEATURES,
  CREATE_TASK_INDEXES,
  resolveTasks as resolveTasksImpl,
} from './TaskResolver';
import type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from './TaskResolver';
export type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from './TaskResolver';

declare const __non_webpack_require__: (id: string) => unknown;

const DB_DIR = path.join(os.homedir(), '.claude', 'trail');
const DB_PATH = path.join(DB_DIR, 'trail.db');

const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

// ---------------------------------------------------------------------------
//  Type definitions
// ---------------------------------------------------------------------------

export interface SessionRow {
  readonly id: string;
  readonly slug: string;
  readonly project: string;
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
  readonly branchBreakdown: readonly {
    readonly branch: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
  }[];
}

export interface CostOptimizationData {
  readonly actual: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly ruleEstimate: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly featureEstimate: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly daily: readonly {
    readonly date: string;
    readonly actualCost: number;
    readonly ruleCost: number;
    readonly featureCost: number;
  }[];
  readonly modelDistribution: {
    readonly actual: Readonly<Record<string, number>>;
    readonly ruleRecommended: Readonly<Record<string, number>>;
    readonly featureRecommended: Readonly<Record<string, number>>;
  };
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

const CREATE_SESSIONS = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  entrypoint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT '',
  commits_resolved_at TEXT
)`;

const CREATE_SESSION_COSTS = `CREATE TABLE IF NOT EXISTS session_costs (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, model)
)`;

const CREATE_DAILY_COSTS = `CREATE TABLE IF NOT EXISTS daily_costs (
  date TEXT NOT NULL,
  model TEXT NOT NULL,
  cost_type TEXT NOT NULL DEFAULT 'actual',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model, cost_type)
)`;

const CREATE_MESSAGES = `CREATE TABLE IF NOT EXISTS messages (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  parent_uuid TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  text_content TEXT,
  user_content TEXT,
  tool_calls TEXT,
  tool_use_result TEXT,
  model TEXT,
  request_id TEXT,
  stop_reason TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  service_tier TEXT,
  speed TEXT,
  timestamp TEXT NOT NULL DEFAULT '',
  is_sidechain INTEGER NOT NULL DEFAULT 0,
  is_meta INTEGER NOT NULL DEFAULT 0,
  cwd TEXT,
  git_branch TEXT,
  permission_mode TEXT,
  skill TEXT,
  agent_id TEXT,
  system_command TEXT,
  duration_ms INTEGER,
  tool_result_size INTEGER,
  agent_description TEXT,
  agent_model TEXT
)`;

const CREATE_SESSION_COMMITS = `CREATE TABLE IF NOT EXISTS session_commits (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  commit_hash TEXT NOT NULL,
  commit_message TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  committed_at TEXT NOT NULL DEFAULT '',
  is_ai_assisted INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, commit_hash)
)`;

const CREATE_C4_MODELS = `CREATE TABLE IF NOT EXISTS c4_models (
  id TEXT PRIMARY KEY DEFAULT 'current',
  model_json TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
)`;

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_messages_parent_uuid ON messages(parent_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON session_commits(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs(date)',
  'CREATE INDEX IF NOT EXISTS idx_daily_costs_type ON daily_costs(cost_type)',
];

const INSERT_SESSION = `INSERT OR REPLACE INTO sessions
  (id, slug, project, version, entrypoint, model,
   start_time, end_time, message_count,
   file_path, file_size, imported_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

const INSERT_SESSION_COST = `INSERT OR REPLACE INTO session_costs
  (session_id, model, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
  VALUES (?,?,?,?,?,?,?)`;

const UPSERT_DAILY_COST = `INSERT INTO daily_costs
  (date, model, cost_type, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
  VALUES (?,?,?,?,?,?,?,?)
  ON CONFLICT(date, model, cost_type) DO UPDATE SET
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens,
    cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
    cache_creation_tokens = cache_creation_tokens + excluded.cache_creation_tokens,
    estimated_cost_usd = estimated_cost_usd + excluded.estimated_cost_usd`;

const INSERT_MESSAGE = `INSERT OR REPLACE INTO messages
  (uuid, session_id, parent_uuid, type, subtype, text_content,
   user_content, tool_calls, tool_use_result, model, request_id,
   stop_reason, input_tokens, output_tokens, cache_read_tokens,
   cache_creation_tokens, service_tier, speed, timestamp,
   is_sidechain, is_meta, cwd, git_branch,
   rule_recommended_model, feature_recommended_model, cost_category,
   duration_ms, tool_result_size, agent_description, agent_model,
   permission_mode, skill, agent_id, system_command)
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

function extractSkillName(toolCallsJson: string | null): string | null {
  if (!toolCallsJson) return null;
  try {
    const calls = JSON.parse(toolCallsJson) as Array<{ name?: string; input?: Record<string, unknown> }>;
    for (const call of calls) {
      if (call.name === 'Skill' && typeof call.input?.skill === 'string') {
        return call.input.skill;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Estimate token count from a string.
 * Uses a rough heuristic of 1 token per 4 characters.
 */
function estimateTokenCount(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
//  Cost classification helpers (inlined from trail-viewer/engine)
// ---------------------------------------------------------------------------

const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read', 'WebSearch', 'WebFetch']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

interface CostRuleEntry {
  pattern: string;
  model: string;
  label: string;
}

let costRulesCache: { rules: CostRuleEntry[]; default: string } | null = null;

function loadCostRules(): { rules: CostRuleEntry[]; default: string } {
  if (costRulesCache) return costRulesCache;
  try {
    const rulesPath = path.join(os.homedir(), '.claude', 'trail', 'costRules.json');
    if (fs.existsSync(rulesPath)) {
      costRulesCache = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
      return costRulesCache!;
    }
  } catch { /* ignore */ }
  // Default rules
  costRulesCache = {
    rules: [
      { pattern: '^(ok|yes|はい|続けて|1|2|3|a|b|c|d)$', model: 'haiku', label: '確認・承認' },
      { pattern: 'コミットして|コミットのみ', model: 'haiku', label: 'Git操作' },
      { pattern: 'バグ|エラー|原因|デバッグ|表示されない|動かない|壊れ|崩れ|不具合', model: 'opus', label: 'デバッグ' },
      { pattern: 'レビュー|品質|sonar|lint|脆弱性|セキュリティ', model: 'opus', label: 'レビュー・品質' },
      { pattern: '設計|アーキテクチャ|リファクタ', model: 'opus', label: '設計・リファクタ' },
      { pattern: '色|幅|余白|アイコン|フォント|サイズ|配置|レイアウト|ホバー|ツールバー|パネル|ダーク|スクロール', model: 'sonnet', label: 'UI調整' },
      { pattern: '追加して|作成して|実装して|削除して|変更して|更新して|非表示にして', model: 'sonnet', label: '機能変更' },
      { pattern: 'おしえて|教えて|ですか|でしょうか|どう|なぜ|確認して|調べて', model: 'sonnet', label: '質問・調査' },
      { pattern: 'ドキュメント|設計書|マニュアル|レポート|記事', model: 'sonnet', label: 'ドキュメント' },
      { pattern: 'リリース|デプロイ|publish', model: 'sonnet', label: 'リリース' },
    ],
    default: 'sonnet',
  };
  return costRulesCache;
}

function classifyMessageByRules(userContent: string): { model: string; label?: string } {
  const config = loadCostRules();
  const text = userContent.trim();
  for (const rule of config.rules) {
    if (new RegExp(rule.pattern, 'i').test(text)) {
      return { model: rule.model, label: rule.label };
    }
  }
  return { model: config.default };
}

function extractToolCallNames(toolCallsJson: string | null): string[] {
  if (!toolCallsJson) return [];
  try {
    const calls = JSON.parse(toolCallsJson) as Array<{ name?: string }>;
    return calls.map(c => c.name ?? '').filter(Boolean);
  } catch { return []; }
}

function countUniqueFiles(toolCallsJson: string | null): number {
  if (!toolCallsJson) return 0;
  try {
    const calls = JSON.parse(toolCallsJson) as Array<{ input?: Record<string, unknown> }>;
    const files = new Set<string>();
    for (const call of calls) {
      if (!call.input || typeof call.input !== 'object') continue;
      if (typeof call.input.file_path === 'string') files.add(call.input.file_path);
      if (typeof call.input.path === 'string') files.add(call.input.path);
    }
    return files.size;
  } catch { return 0; }
}

function classifyMessageByFeatures(
  outputTokens: number,
  toolCallNames: string[],
  uniqueFileCount: number,
): string {
  if (outputTokens < 500 && toolCallNames.length === 0) return 'haiku';
  if (toolCallNames.length > 0 && toolCallNames.every(n => SEARCH_TOOLS.has(n))) return 'sonnet';
  if (toolCallNames.some(n => EDIT_TOOLS.has(n)) && uniqueFileCount >= 3) return 'opus';
  const uniqueToolTypes = new Set(toolCallNames).size;
  if (outputTokens > 3000 && uniqueToolTypes >= 3) return 'opus';
  return 'sonnet';
}

// ---------------------------------------------------------------------------
//  TrailDatabase
// ---------------------------------------------------------------------------

export class TrailDatabase {
  private db: Database | null = null;

  constructor(private readonly distPath: string) {}

  async init(): Promise<void> {
    // Load sql-asm.js from dist/ directory using __non_webpack_require__
    // to bypass webpack bundling (bundling breaks sql.js module system)
    const sqlAsmPath = path.join(this.distPath, 'sql-asm.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const initSqlJs = __non_webpack_require__(sqlAsmPath) as typeof import('sql.js').default;
    const SQL = await initSqlJs();
    console.log('[TrailDatabase] sql.js initialized, DB_PATH =', DB_PATH);

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
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
    db.run(CREATE_SESSIONS);
    db.run(CREATE_SESSION_COSTS);
    db.run(CREATE_DAILY_COSTS);
    db.run(CREATE_MESSAGES);
    db.run(CREATE_SESSION_COMMITS);
    db.run(CREATE_TASKS);
    db.run(CREATE_TASK_FILES);
    db.run(CREATE_TASK_C4_ELEMENTS);
    db.run(CREATE_TASK_FEATURES);
    db.run(CREATE_C4_MODELS);
    for (const sql of [...CREATE_INDEXES, ...CREATE_TASK_INDEXES]) {
      db.run(sql);
    }

    // Add columns for existing DBs (may already exist)
    try {
      db.run('ALTER TABLE sessions ADD COLUMN commits_resolved_at TEXT');
    } catch {
      // Column already exists — ignore
    }
    // Task table migrations for existing DBs
    const taskAlters = [
      'ALTER TABLE tasks ADD COLUMN session_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN total_cache_read_tokens INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN total_duration_ms INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE task_files ADD COLUMN change_type TEXT NOT NULL DEFAULT \'modified\'',
      'ALTER TABLE task_c4_elements ADD COLUMN element_name TEXT NOT NULL DEFAULT \'\'',
    ];
    for (const sql of taskAlters) {
      try { db.run(sql); } catch { /* Column already exists */ }
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

  /** SQLiteのDATE()に渡すローカルTZオフセット文字列を返す */
  private getLocalTzOffset(): string {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    return `${sign}${Math.abs(offsetMin)} minutes`;
  }

  save(): void {
    const db = this.ensureDb();
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  // -------------------------------------------------------------------------
  //  Import
  // -------------------------------------------------------------------------

  /** Load all imported sessions into memory for fast lookup during importAll. */
  private getImportedSessionMap(): Map<string, { fileSize: number; commitsResolved: boolean }> {
    const db = this.ensureDb();
    const result = db.exec('SELECT id, file_size, commits_resolved_at FROM sessions');
    const map = new Map<string, { fileSize: number; commitsResolved: boolean }>();
    for (const row of result[0]?.values ?? []) {
      map.set(String(row[0]), {
        fileSize: Number(row[1]),
        commitsResolved: row[2] != null,
      });
    }
    return map;
  }

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
      'SELECT start_time, end_time, git_branch FROM sessions WHERE id = ? LIMIT 1',
    );
    stmt.bind([sessionId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as {
      start_time: string; end_time: string; git_branch: string;
    };
    stmt.free();
    return {
      startTime: row.start_time,
      endTime: row.end_time,
      gitBranch: row.git_branch,
    };
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

    let logOutput = '';
    const useBranch = gitBranch && gitBranch.trim() !== '';
    try {
      // Try branch-specific log first (or --all if no branch)
      logOutput = execFileSync('git', [
        'log', useBranch ? gitBranch : '--all',
        `--after=${startTime}`,
        `--before=${bufferedEnd}`,
        `--format=${logFormat}`,
        '--no-merges',
      ], { ...execOpts, cwd: gitRoot });
    } catch {
      // Fallback to --all if branch not found
      try {
        logOutput = execFileSync('git', [
          'log', '--all',
          `--after=${startTime}`,
          `--before=${bufferedEnd}`,
          `--format=${logFormat}`,
          '--no-merges',
        ], { ...execOpts, cwd: gitRoot });
      } catch {
        // On any git error, mark as resolved and return 0
        db.run(
          "UPDATE sessions SET commits_resolved_at = datetime('now') WHERE id = ?",
          [sessionId],
        );
        return 0;
      }
    }

    const commits = logOutput
      .split('\x1e')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let count = 0;
    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO session_commits
        (session_id, commit_hash, commit_message, author, committed_at,
         is_ai_assisted, files_changed, lines_added, lines_deleted)
        VALUES (?,?,?,?,?,?,?,?,?)`,
    );

    for (const entry of commits) {
      const parts = entry.split('\x00');
      if (parts.length < 4) continue;

      const hash = parts[0];
      const subject = parts[1];
      const author = parts[2];
      const committedAt = toUTC(parts[3]);
      const body = parts[4] ?? '';

      // Check for AI co-authoring
      const isAiAssisted = /Co-Authored-By:.*Claude/i.test(body) ? 1 : 0;

      // Get file stats via numstat
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
          // Binary files show as "-"
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

    insertStmt.free();

    db.run(
      "UPDATE sessions SET commits_resolved_at = datetime('now') WHERE id = ?",
      [sessionId],
    );

    return count;
  }

  importSession(filePath: string, projectName: string, isSubagent = false): void {
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

    if (parsed.length === 0) return;

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

    if (!sessionId) return;

    const fileSize = fs.statSync(filePath).size;
    const importedAt = new Date().toISOString();

    db.run('BEGIN TRANSACTION');
    try {
      // Insert/update session metadata only for main session files
      if (!isSubagent) {
        db.run(INSERT_SESSION, [
          sessionId, slug, projectName, version,
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

        // --- Cost classification ---
        let ruleRecommendedModel: string | null = null;
        let featureRecommendedModel: string | null = null;
        let costCategory: string | null = null;

        // Rule-based: classify user messages
        if (raw.type === 'user' && userContent) {
          const ruleResult = classifyMessageByRules(userContent);
          ruleRecommendedModel = ruleResult.model;
          costCategory = ruleResult.label ?? null;
        }

        // Feature-based: classify assistant messages
        if (raw.type === 'assistant') {
          const outputTokens = raw.message?.usage?.output_tokens ?? 0;
          const toolCallNames = extractToolCallNames(toolCalls);
          const uniqueFileCount = countUniqueFiles(toolCalls);
          featureRecommendedModel = classifyMessageByFeatures(outputTokens, toolCallNames, uniqueFileCount);
        }

        // --- New analytics fields ---
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
          ruleRecommendedModel,
          featureRecommendedModel,
          costCategory,
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

      // --- Populate session_costs (session × model) ---
      const scResult = db.exec(
        `SELECT COALESCE(model,''), SUM(input_tokens), SUM(output_tokens),
          SUM(cache_read_tokens), SUM(cache_creation_tokens)
         FROM messages WHERE session_id = ? AND type = 'assistant'
         GROUP BY model`,
        [sessionId],
      );
      const scStmt = db.prepare(INSERT_SESSION_COST);
      for (const row of scResult[0]?.values ?? []) {
        const m = String(row[0]);
        const inp = Number(row[1]);
        const outp = Number(row[2]);
        const cr = Number(row[3]);
        const cc = Number(row[4]);
        scStmt.run([sessionId, m, inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
      }
      scStmt.free();

      // --- Populate daily_costs (date × model) via additive UPSERT ---
      const tzOffset = this.getLocalTzOffset();

      // actual costs
      const dcActualResult = db.exec(
        `SELECT DATE(timestamp, '${tzOffset}'), COALESCE(model,''),
          SUM(input_tokens), SUM(output_tokens),
          SUM(cache_read_tokens), SUM(cache_creation_tokens)
         FROM messages WHERE session_id = ? AND type = 'assistant'
         GROUP BY DATE(timestamp, '${tzOffset}'), model`,
        [sessionId],
      );
      const dcStmt = db.prepare(UPSERT_DAILY_COST);
      for (const row of dcActualResult[0]?.values ?? []) {
        const d = String(row[0]); const m = String(row[1]);
        const inp = Number(row[2]); const outp = Number(row[3]);
        const cr = Number(row[4]); const cc = Number(row[5]);
        dcStmt.run([d, m, 'actual', inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
      }

      // rule-based estimated costs
      const dcRuleResult = db.exec(
        `SELECT DATE(a.timestamp, '${tzOffset}'),
          COALESCE(u.rule_recommended_model, 'sonnet'),
          SUM(a.input_tokens), SUM(a.output_tokens),
          SUM(a.cache_read_tokens), SUM(a.cache_creation_tokens)
         FROM messages a
         LEFT JOIN messages u ON a.parent_uuid = u.uuid AND u.type = 'user'
         WHERE a.session_id = ? AND a.type = 'assistant'
         GROUP BY DATE(a.timestamp, '${tzOffset}'), COALESCE(u.rule_recommended_model, 'sonnet')`,
        [sessionId],
      );
      for (const row of dcRuleResult[0]?.values ?? []) {
        const d = String(row[0]); const m = String(row[1]);
        const inp = Number(row[2]); const outp = Number(row[3]);
        const cr = Number(row[4]); const cc = Number(row[5]);
        dcStmt.run([d, m, 'rule', inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
      }

      // feature-based estimated costs
      const dcFeatureResult = db.exec(
        `SELECT DATE(a.timestamp, '${tzOffset}'),
          COALESCE(a.feature_recommended_model, 'sonnet'),
          SUM(a.input_tokens), SUM(a.output_tokens),
          SUM(a.cache_read_tokens), SUM(a.cache_creation_tokens)
         FROM messages a
         WHERE a.session_id = ? AND a.type = 'assistant'
         GROUP BY DATE(a.timestamp, '${tzOffset}'), COALESCE(a.feature_recommended_model, 'sonnet')`,
        [sessionId],
      );
      for (const row of dcFeatureResult[0]?.values ?? []) {
        const d = String(row[0]); const m = String(row[1]);
        const inp = Number(row[2]); const outp = Number(row[3]);
        const cr = Number(row[4]); const cc = Number(row[5]);
        dcStmt.run([d, m, 'feature', inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc)]);
      }
      dcStmt.free();

      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  async importAll(
    onProgress?: (message: string, increment?: number) => void,
    gitRoot?: string,
    c4ModelPath?: string,
  ): Promise<{ imported: number; skipped: number; commitsResolved: number; tasksResolved: number }> {
    // Clear daily_costs before import to avoid double-counting from additive UPSERT
    this.ensureDb().run('DELETE FROM daily_costs');

    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    let imported = 0;
    let skipped = 0;
    let commitsResolved = 0;

    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return { imported, skipped, commitsResolved, tasksResolved: 0 };
    }

    const allFiles: { filePath: string; projectName: string }[] = [];
    for (const projectName of projectDirs) {
      const projectPath = path.join(projectsDir, projectName);
      try {
        const stat = fs.statSync(projectPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }
      const jsonlFiles = findJsonlFiles(projectPath);
      allFiles.push(...jsonlFiles.map((f) => ({ filePath: f, projectName })));
    }

    const totalFiles = allFiles.length;
    onProgress?.(`Found ${totalFiles} JSONL files`, 0);

    // Pre-load imported sessions into memory for fast lookup
    const importedSessions = this.getImportedSessionMap();
    const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

    let sinceLastYield = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const { filePath, projectName } = allFiles[i];
      const increment = totalFiles > 0 ? 100 / totalFiles : 0;

      const isSubagent = path.basename(filePath).startsWith('agent-')
        || filePath.includes(`${path.sep}subagents${path.sep}`);

      // Extract sessionId — try filename first, then parse file content
      let sid = '';
      const basename = path.basename(filePath, '.jsonl');
      if (UUID_RE.test(basename)) {
        sid = basename;
      } else if (isSubagent) {
        // Subagent files: extract parent sessionId from directory name
        const parentDir = path.basename(path.dirname(filePath));
        if (UUID_RE.test(parentDir)) {
          sid = parentDir;
        }
      }
      // Fallback: read file head only if filename/dirname didn't work
      if (!sid) {
        try {
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(4096);
          const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
          fs.closeSync(fd);
          const head = buf.toString('utf-8', 0, bytesRead);
          for (const line of head.split('\n').slice(0, 5)) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line) as { sessionId?: string };
              if (obj.sessionId) { sid = obj.sessionId; break; }
            } catch { /* skip */ }
          }
        } catch {
          continue;
        }
      }

      if (!sid) continue;

      // Fast skip: check in-memory map instead of per-file SQL query
      const existing = importedSessions.get(sid);
      if (existing) {
        let currentFileSize = 0;
        try {
          currentFileSize = fs.statSync(filePath).size;
        } catch {
          skipped++;
          continue;
        }
        // Skip if file hasn't grown since last import
        if (currentFileSize <= existing.fileSize) {
          skipped++;
          // Check commits only if not yet resolved
          if (gitRoot && !existing.commitsResolved) {
            try {
              commitsResolved += this.resolveCommits(sid, gitRoot);
            } catch { /* skip */ }
          }
          continue;
        }
      }

      try {
        // Yield before heavy import to prevent Extension Host timeout
        sinceLastYield++;
        if (sinceLastYield >= 10) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          sinceLastYield = 0;
        }
        onProgress?.(`(${i + 1}/${totalFiles}) ${path.basename(filePath)}`, increment);
        this.importSession(filePath, projectName, isSubagent);
        imported++;
          if (gitRoot) {
            try {
              commitsResolved += this.resolveCommits(sid, gitRoot);
            } catch {
              // skip
            }
          }
        } catch {
          // Skip files that fail to import
        }
      }

    // Resolve tasks (PRs) from merge commits
    let tasksResolved = 0;
    if (gitRoot) {
      try {
        onProgress?.('Resolving tasks from merge commits...', 0);
        tasksResolved = this.resolveTasks(gitRoot, c4ModelPath);
      } catch {
        // Skip task resolution errors
      }
    }

    this.save();
    return { imported, skipped, commitsResolved, tasksResolved };
  }

  /**
   * git log のマージコミットからタスク（PR）を解決し、DBに保存する。
   */
  resolveTasks(gitRoot: string, c4ModelPath?: string): number {
    const db = this.ensureDb();
    const count = resolveTasksImpl(db, gitRoot, c4ModelPath);
    if (count > 0) {
      this.save();
    }
    return count;
  }

  // -------------------------------------------------------------------------
  //  C4 model storage
  // -------------------------------------------------------------------------

  saveC4Model(json: string, revision = ''): void {
    const db = this.ensureDb();
    db.run(
      `INSERT OR REPLACE INTO c4_models (id, model_json, revision, updated_at)
       VALUES ('current', ?, ?, datetime('now'))`,
      [json, revision],
    );
    this.save();
  }

  getC4Model(): { modelJson: string; revision: string; updatedAt: string } | null {
    const db = this.ensureDb();
    const result = db.exec("SELECT model_json, revision, updated_at FROM c4_models WHERE id = 'current'");
    if (!result[0]?.values?.[0]) return null;
    const [modelJson, revision, updatedAt] = result[0].values[0];
    return {
      modelJson: modelJson as string,
      revision: revision as string,
      updatedAt: updatedAt as string,
    };
  }

  // -------------------------------------------------------------------------
  //  Task queries
  // -------------------------------------------------------------------------

  getTasks(): TaskRow[] {
    const db = this.ensureDb();
    const result = db.exec('SELECT * FROM tasks ORDER BY merged_at DESC');
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as TaskRow;
    });
  }

  getTaskFiles(taskId: string): TaskFileRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM task_files WHERE task_id = '${taskId.replaceAll("'", "''")}'`,
    );
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as TaskFileRow;
    });
  }

  getTaskC4Elements(taskId: string): TaskC4ElementRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM task_c4_elements WHERE task_id = '${taskId.replaceAll("'", "''")}'`,
    );
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as TaskC4ElementRow;
    });
  }

  getTaskFeatures(taskId: string): TaskFeatureRow[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT * FROM task_features WHERE task_id = '${taskId.replaceAll("'", "''")}'`,
    );
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as TaskFeatureRow;
    });
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

    // Branch breakdown from messages
    const branchResult = db.exec(
      `SELECT git_branch, COUNT(DISTINCT session_id),
        SUM(input_tokens), SUM(output_tokens)
       FROM messages WHERE git_branch != '' AND type = 'assistant'
       GROUP BY git_branch ORDER BY COUNT(DISTINCT session_id) DESC LIMIT 10`,
    );
    const branchBreakdown = (branchResult[0]?.values ?? []).map((r) => ({
      branch: String(r[0]),
      sessions: Number(r[1]),
      inputTokens: Number(r[2]),
      outputTokens: Number(r[3]),
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
      branchBreakdown,
    };
  }

  public reclassifyAllMessages(): void {
    const db = this.ensureDb();
    costRulesCache = null; // Force reload of rules

    const results = db.exec(
      'SELECT uuid, type, user_content, tool_calls, output_tokens FROM messages',
    );
    if (results.length === 0) return;

    db.run('BEGIN TRANSACTION');
    try {
      const stmt = db.prepare(
        'UPDATE messages SET rule_recommended_model = ?, feature_recommended_model = ?, cost_category = ? WHERE uuid = ?',
      );

      const rows = results[0].values;
      for (const row of rows) {
        const [uuid, type, userContentVal, toolCallsVal, outputTokensVal] = row as [string, string, string | null, string | null, number];

        let ruleModel: string | null = null;
        let featureModel: string | null = null;
        let category: string | null = null;

        if (type === 'user' && userContentVal) {
          const result = classifyMessageByRules(userContentVal);
          ruleModel = result.model;
          category = result.label ?? null;
        }

        if (type === 'assistant') {
          const toolNames = extractToolCallNames(toolCallsVal);
          const fileCount = countUniqueFiles(toolCallsVal);
          featureModel = classifyMessageByFeatures(outputTokensVal ?? 0, toolNames, fileCount);
        }

        stmt.run([ruleModel, featureModel, category, uuid]);
      }

      stmt.free();
      db.run('COMMIT');
      this.save();
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
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

    // 2. Rule-based estimate from daily_costs
    const ruleResult = db.exec(
      `SELECT model, SUM(estimated_cost_usd)
       FROM daily_costs WHERE cost_type = 'rule'
       GROUP BY model`,
    );
    const ruleByModel: Record<string, number> = {};
    let ruleTotal = 0;
    for (const row of ruleResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      ruleByModel[m] = (ruleByModel[m] ?? 0) + c;
      ruleTotal += c;
    }

    // 3. Feature-based estimate from daily_costs
    const featureResult = db.exec(
      `SELECT model, SUM(estimated_cost_usd)
       FROM daily_costs WHERE cost_type = 'feature'
       GROUP BY model`,
    );
    const featureByModel: Record<string, number> = {};
    let featureTotal = 0;
    for (const row of featureResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      featureByModel[m] = (featureByModel[m] ?? 0) + c;
      featureTotal += c;
    }

    // 4. Daily breakdown from daily_costs (last 90 days)
    const dailyResult = db.exec(
      `SELECT date, cost_type, SUM(estimated_cost_usd)
       FROM daily_costs
       WHERE date >= DATE('now', '${tzOffset}', '-90 days')
       GROUP BY date, cost_type ORDER BY date`,
    );
    const dailyMap = new Map<string, { actual: number; rule: number; feature: number }>();
    for (const row of dailyResult[0]?.values ?? []) {
      const d = String(row[0]);
      const ct = String(row[1]);
      const c = Number(row[2]);
      const entry = dailyMap.get(d) ?? { actual: 0, rule: 0, feature: 0 };
      if (ct === 'actual') entry.actual += c;
      else if (ct === 'rule') entry.rule += c;
      else if (ct === 'feature') entry.feature += c;
      dailyMap.set(d, entry);
    }
    const daily: Array<{ date: string; actualCost: number; ruleCost: number; featureCost: number }> = [];
    for (const [d, entry] of dailyMap) {
      daily.push({
        date: d,
        actualCost: entry.actual,
        ruleCost: entry.rule,
        featureCost: entry.feature,
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

    const distRule = db.exec(
      `SELECT COALESCE(u.rule_recommended_model,'sonnet'), COUNT(*)
       FROM messages a JOIN messages u ON a.parent_uuid = u.uuid
       WHERE a.type = 'assistant' AND u.type = 'user'
       GROUP BY u.rule_recommended_model`,
    );
    const ruleDist: Record<string, number> = {};
    for (const row of distRule[0]?.values ?? []) {
      ruleDist[String(row[0])] = Number(row[1]);
    }

    const distFeature = db.exec(
      `SELECT COALESCE(feature_recommended_model,'sonnet'), COUNT(*)
       FROM messages WHERE type = 'assistant'
       GROUP BY feature_recommended_model`,
    );
    const featureDist: Record<string, number> = {};
    for (const row of distFeature[0]?.values ?? []) {
      featureDist[String(row[0])] = Number(row[1]);
    }

    return {
      actual: { totalCost: actualTotal, byModel: actualByModel },
      ruleEstimate: { totalCost: ruleTotal, byModel: ruleByModel },
      featureEstimate: { totalCost: featureTotal, byModel: featureByModel },
      daily,
      modelDistribution: {
        actual: actualDist,
        ruleRecommended: ruleDist,
        featureRecommended: featureDist,
      },
    };
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
