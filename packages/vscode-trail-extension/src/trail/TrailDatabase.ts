import type { Database } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toUTC } from './dateUtils';

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
  readonly git_branch: string;
  readonly cwd: string;
  readonly model: string;
  readonly version: string;
  readonly entrypoint: string;
  readonly permission_mode: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly file_path: string;
  readonly file_size: number;
  readonly imported_at: string;
  readonly peak_context_tokens?: number;
  readonly initial_context_tokens?: number;
  readonly commits_resolved_at?: string;
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
  git_branch TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  entrypoint TEXT NOT NULL DEFAULT '',
  permission_mode TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT ''
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
  git_branch TEXT
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

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_session_commits_session ON session_commits(session_id)',
];

const INSERT_SESSION = `INSERT OR REPLACE INTO sessions
  (id, slug, project, git_branch, cwd, model, version, entrypoint,
   permission_mode, start_time, end_time, message_count,
   input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
   file_path, file_size, imported_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const INSERT_MESSAGE = `INSERT OR REPLACE INTO messages
  (uuid, session_id, parent_uuid, type, subtype, text_content,
   user_content, tool_calls, tool_use_result, model, request_id,
   stop_reason, input_tokens, output_tokens, cache_read_tokens,
   cache_creation_tokens, service_tier, speed, timestamp,
   is_sidechain, is_meta, cwd, git_branch,
   rule_recommended_model, feature_recommended_model, cost_category)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;


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
    db.run(CREATE_MESSAGES);
    db.run(CREATE_SESSION_COMMITS);
    for (const sql of CREATE_INDEXES) {
      db.run(sql);
    }

    // Add columns for existing DBs (may already exist)
    try {
      db.run('ALTER TABLE sessions ADD COLUMN commits_resolved_at TEXT');
    } catch {
      // Column already exists — ignore
    }
    try {
      db.run('ALTER TABLE messages ADD COLUMN rule_recommended_model TEXT');
    } catch { /* Column already exists */ }
    try {
      db.run('ALTER TABLE messages ADD COLUMN feature_recommended_model TEXT');
    } catch { /* Column already exists */ }
    try {
      db.run('ALTER TABLE messages ADD COLUMN cost_category TEXT');
    } catch { /* Column already exists */ }

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
    let gitBranch = '';
    let cwd = '';
    let model = '';
    let entrypoint = '';
    let permissionMode = '';
    let startTime = '';
    let endTime = '';
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;
    let messageCount = 0;

    // Collect messages to insert
    const messagesToInsert: RawLine[] = [];

    for (const raw of parsed) {
      if (!raw.type || SKIP_TYPES.has(raw.type)) continue;
      if (raw.isMeta === true) continue;
      if (raw.type === 'system' && raw.subtype === 'turn_duration') continue;

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId;
      if (!slug && raw.slug) slug = raw.slug;
      if (!version && raw.version) version = raw.version;
      if (!gitBranch && raw.gitBranch) gitBranch = raw.gitBranch;
      if (!cwd && raw.cwd) cwd = raw.cwd;
      if (!entrypoint && raw.entrypoint) entrypoint = raw.entrypoint;
      if (!permissionMode && raw.permissionMode) permissionMode = raw.permissionMode;
      if (!model && raw.message?.model) model = raw.message.model;
      if (!startTime && raw.timestamp) startTime = toUTC(raw.timestamp);
      if (raw.timestamp) endTime = toUTC(raw.timestamp);

      const usage = raw.message?.usage;
      if (usage) {
        totalInput += usage.input_tokens ?? 0;
        totalOutput += usage.output_tokens ?? 0;
        totalCacheRead += usage.cache_read_input_tokens ?? 0;
        totalCacheCreation += usage.cache_creation_input_tokens ?? 0;
      }

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
          sessionId, slug, projectName, gitBranch, cwd, model, version,
          entrypoint, permissionMode, startTime, endTime, messageCount,
          totalInput, totalOutput, totalCacheRead, totalCacheCreation,
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
        ]);
      }
      msgStmt.free();

      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  async importAll(
    onProgress?: (message: string, increment?: number) => void,
    gitRoot?: string,
  ): Promise<{ imported: number; skipped: number; commitsResolved: number }> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    let imported = 0;
    let skipped = 0;
    let commitsResolved = 0;

    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return { imported, skipped, commitsResolved };
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

    for (let i = 0; i < allFiles.length; i++) {
      const { filePath, projectName } = allFiles[i];
      const increment = totalFiles > 0 ? 100 / totalFiles : 0;
      onProgress?.(`(${i + 1}/${totalFiles}) Importing...`, increment);

      // Extract sessionId — try filename first, then parse file content
        let sid = '';
        const basename = path.basename(filePath, '.jsonl');
        const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
        if (UUID_RE.test(basename)) {
          sid = basename;
        } else {
          try {
            const head = fs.readFileSync(filePath, 'utf-8').slice(0, 65536);
            const headLines = head.split('\n').filter((l) => l.trim() !== '');
            for (const line of headLines.slice(0, 20)) {
              try {
                const obj = JSON.parse(line) as { sessionId?: string };
                if (obj.sessionId) {
                  sid = obj.sessionId;
                  break;
                }
              } catch {
                // skip
              }
            }
          } catch {
            continue;
          }
        }

        if (!sid) continue;

        // Subagent files share the parent sessionId — import messages only
        const isSubagent = path.basename(filePath).startsWith('agent-')
          || filePath.includes(`${path.sep}subagents${path.sep}`);

        if (this.isImported(sid)) {
          // Re-import if the main file has grown (new messages appended)
          if (!isSubagent) {
            let currentFileSize = 0;
            try {
              currentFileSize = fs.statSync(filePath).size;
            } catch {
              // skip
            }
            const importedSize = this.getImportedFileSize(sid);
            if (currentFileSize > importedSize) {
              try {
                this.importSession(filePath, projectName);
                imported++;
              } catch {
                // skip
              }
            } else {
              skipped++;
            }
          }
          // Always import subagent messages (messages use INSERT OR REPLACE)
          if (isSubagent) {
            try {
              this.importSession(filePath, projectName, true);
              imported++;
            } catch {
              // skip
            }
          }
          if (gitRoot && !this.isCommitsResolved(sid)) {
            try {
              commitsResolved += this.resolveCommits(sid, gitRoot);
            } catch {
              // skip
            }
          }
          continue;
        }

        try {
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

    this.save();
    return { imported, skipped, commitsResolved };
  }

  // -------------------------------------------------------------------------
  //  Queries
  // -------------------------------------------------------------------------

  getSessions(filters?: SessionFilters): SessionRow[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters?.branch) {
      conditions.push('s.git_branch = ?');
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
    const sql = `SELECT s.* FROM sessions s ${where} ORDER BY s.start_time DESC`;

    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: SessionRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRow);
    }
    stmt.free();
    return rows;
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

    // Token totals
    const totals = db.exec(
      `SELECT COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0),
        COALESCE(SUM(cache_read_tokens),0),
        COALESCE(SUM(cache_creation_tokens),0),
        COUNT(*)
      FROM sessions`,
    );
    const tr = totals[0]?.values[0] ?? [0, 0, 0, 0, 0];
    const totalInput = Number(tr[0]);
    const totalOutput = Number(tr[1]);
    const totalCacheRead = Number(tr[2]);
    const totalCacheCreation = Number(tr[3]);
    const totalSessions = Number(tr[4]);

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

    // Model breakdown with tokens
    const modelResult = db.exec(
      `SELECT model, COUNT(*),
        COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0),
        COALESCE(SUM(cache_read_tokens),0)
      FROM sessions WHERE model != ''
      GROUP BY model ORDER BY COUNT(*) DESC`,
    );
    const modelBreakdown = (modelResult[0]?.values ?? []).map((r) => {
      const model = String(r[0]);
      const inp = Number(r[2]);
      const out = Number(r[3]);
      const cacheRead = Number(r[4]);
      return {
        model,
        sessions: Number(r[1]),
        inputTokens: inp,
        outputTokens: out,
        cacheReadTokens: cacheRead,
        estimatedCostUsd: estimateCost(model, inp, out, cacheRead),
      };
    });

    // Daily activity (last 90 days — frontend filters to 7/30/90)
    const tzOffset = this.getLocalTzOffset();
    const dailyResult = db.exec(
      `SELECT DATE(start_time, '${tzOffset}') as d, COUNT(*),
        COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0),
        COALESCE(SUM(cache_read_tokens),0),
        COALESCE(SUM(cache_creation_tokens),0)
      FROM sessions
      WHERE start_time >= DATE('now', '${tzOffset}', '-90 days')
      GROUP BY d ORDER BY d`,
    );
    const dailyActivity = (dailyResult[0]?.values ?? []).map((r) => ({
      date: String(r[0]),
      sessions: Number(r[1]),
      inputTokens: Number(r[2]),
      outputTokens: Number(r[3]),
      cacheReadTokens: Number(r[4]),
      cacheCreationTokens: Number(r[5]),
    }));

    // Branch breakdown
    const branchResult = db.exec(
      `SELECT git_branch, COUNT(*),
        COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0)
      FROM sessions WHERE git_branch != ''
      GROUP BY git_branch ORDER BY COUNT(*) DESC LIMIT 10`,
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

    // Estimate total cost
    const totalEstimatedCost = modelBreakdown.reduce(
      (sum, m) => sum + m.estimatedCostUsd, 0,
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

    // Helper: compute cost for a model + tokens
    const cost = (model: string, input: number, output: number, cacheRead: number): number =>
      estimateCost(model, input, output, cacheRead);

    // 1. Actual cost by model (from messages)
    const actualResult = db.exec(
      `SELECT COALESCE(model,''), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens)
       FROM messages WHERE type = 'assistant' AND model IS NOT NULL
       GROUP BY model`,
    );
    const actualByModel: Record<string, number> = {};
    let actualTotal = 0;
    for (const row of actualResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = cost(m, Number(row[1]), Number(row[2]), Number(row[3]));
      actualByModel[m] = (actualByModel[m] ?? 0) + c;
      actualTotal += c;
    }

    // 2. Rule-based estimate: re-price assistant messages using the rule_recommended_model
    //    from their preceding user message (joined via parent_uuid or session ordering)
    const ruleResult = db.exec(
      `SELECT COALESCE(u.rule_recommended_model, 'sonnet') AS rec_model,
              SUM(a.input_tokens), SUM(a.output_tokens), SUM(a.cache_read_tokens)
       FROM messages a
       JOIN messages u ON a.parent_uuid = u.uuid
       WHERE a.type = 'assistant' AND u.type = 'user'
       GROUP BY rec_model`,
    );
    const ruleByModel: Record<string, number> = {};
    let ruleTotal = 0;
    for (const row of ruleResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = cost(m, Number(row[1]), Number(row[2]), Number(row[3]));
      ruleByModel[m] = (ruleByModel[m] ?? 0) + c;
      ruleTotal += c;
    }

    // 3. Feature-based estimate: use feature_recommended_model from assistant messages
    const featureResult = db.exec(
      `SELECT COALESCE(feature_recommended_model, 'sonnet') AS rec_model,
              SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens)
       FROM messages WHERE type = 'assistant'
       GROUP BY rec_model`,
    );
    const featureByModel: Record<string, number> = {};
    let featureTotal = 0;
    for (const row of featureResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = cost(m, Number(row[1]), Number(row[2]), Number(row[3]));
      featureByModel[m] = (featureByModel[m] ?? 0) + c;
      featureTotal += c;
    }

    // 4. Daily breakdown (last 90 days)
    const tzOffset = this.getLocalTzOffset();
    const dailyResult = db.exec(
      `SELECT DATE(m.timestamp, '${tzOffset}') AS d,
              SUM(m.input_tokens) AS inp, SUM(m.output_tokens) AS outp,
              SUM(m.cache_read_tokens) AS cr, COALESCE(m.model,'') AS mdl
       FROM messages m
       WHERE m.type = 'assistant' AND m.timestamp >= DATE('now', '${tzOffset}', '-90 days')
       GROUP BY d, mdl ORDER BY d`,
    );
    const dailyMap = new Map<string, { actual: number; rule: number; feature: number }>();
    for (const row of dailyResult[0]?.values ?? []) {
      const d = String(row[0]);
      const inp = Number(row[1]);
      const outp = Number(row[2]);
      const cr = Number(row[3]);
      const mdl = String(row[4]);
      const entry = dailyMap.get(d) ?? { actual: 0, rule: 0, feature: 0 };
      entry.actual += cost(mdl, inp, outp, cr);
      // For daily, use sonnet as default estimate (detailed per-message would be too slow)
      entry.rule += cost('sonnet', inp, outp, cr);
      entry.feature += cost('sonnet', inp, outp, cr);
      dailyMap.set(d, entry);
    }

    // Refine daily with per-message classification
    const dailyDetailResult = db.exec(
      `SELECT DATE(a.timestamp, '${tzOffset}') AS d,
              COALESCE(u.rule_recommended_model, 'sonnet') AS rule_rec,
              COALESCE(a.feature_recommended_model, 'sonnet') AS feat_rec,
              a.input_tokens, a.output_tokens, a.cache_read_tokens
       FROM messages a
       LEFT JOIN messages u ON a.parent_uuid = u.uuid AND u.type = 'user'
       WHERE a.type = 'assistant' AND a.timestamp >= DATE('now', '${tzOffset}', '-90 days')`,
    );
    const dailyRefined = new Map<string, { actual: number; rule: number; feature: number }>();
    for (const row of dailyDetailResult[0]?.values ?? []) {
      const d = String(row[0]);
      const ruleRec = String(row[1]);
      const featRec = String(row[2]);
      const inp = Number(row[3]);
      const outp = Number(row[4]);
      const cr = Number(row[5]);
      const entry = dailyRefined.get(d) ?? { actual: 0, rule: 0, feature: 0 };
      entry.rule += cost(ruleRec, inp, outp, cr);
      entry.feature += cost(featRec, inp, outp, cr);
      dailyRefined.set(d, entry);
    }

    // Merge actual costs from dailyMap with refined rule/feature costs
    const daily: Array<{ date: string; actualCost: number; ruleCost: number; featureCost: number }> = [];
    for (const [d, entry] of dailyMap) {
      const refined = dailyRefined.get(d);
      daily.push({
        date: d,
        actualCost: entry.actual,
        ruleCost: refined?.rule ?? entry.rule,
        featureCost: refined?.feature ?? entry.feature,
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

interface ModelRates {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
}

/** Per-1M-token rates in USD. */
const MODEL_RATES: Record<string, ModelRates> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08 },
};

const DEFAULT_RATES: ModelRates = { input: 3, output: 15, cacheRead: 0.3 };

function getModelRates(model: string): ModelRates {
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.includes(key)) return rates;
  }
  // Fallback heuristics
  if (model.includes('opus')) return MODEL_RATES['claude-opus-4-6'];
  if (model.includes('haiku')) return MODEL_RATES['claude-haiku-4-5'];
  return DEFAULT_RATES;
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
): number {
  const rates = getModelRates(model);
  return (
    (inputTokens * rates.input +
      outputTokens * rates.output +
      cacheReadTokens * rates.cacheRead) /
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
