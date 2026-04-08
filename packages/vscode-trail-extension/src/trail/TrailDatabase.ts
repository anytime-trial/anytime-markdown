import type { Database } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

interface SessionFilters {
  readonly branch?: string;
  readonly model?: string;
  readonly project?: string;
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

const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)',
  'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
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
   is_sidechain, is_meta, cwd, git_branch)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;


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
    for (const sql of CREATE_INDEXES) {
      db.run(sql);
    }
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

  importSession(filePath: string, projectName: string): void {
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
      if (!startTime && raw.timestamp) startTime = raw.timestamp;
      if (raw.timestamp) endTime = raw.timestamp;

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
      // Insert session
      db.run(INSERT_SESSION, [
        sessionId, slug, projectName, gitBranch, cwd, model, version,
        entrypoint, permissionMode, startTime, endTime, messageCount,
        totalInput, totalOutput, totalCacheRead, totalCacheCreation,
        filePath, fileSize, importedAt,
      ]);

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
          raw.timestamp ?? '',
          raw.isSidechain ? 1 : 0,
          raw.isMeta ? 1 : 0,
          raw.cwd ?? null,
          raw.gitBranch ?? null,
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
  ): Promise<{ imported: number; skipped: number }> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    let imported = 0;
    let skipped = 0;

    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      return { imported, skipped };
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

      // Extract sessionId from first few lines
        let sid = '';
        try {
          const head = fs.readFileSync(filePath, 'utf-8').slice(0, 8192);
          const headLines = head.split('\n').filter((l) => l.trim() !== '');
          for (const line of headLines.slice(0, 10)) {
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

        if (!sid) continue;

        if (this.isImported(sid)) {
          skipped++;
          continue;
        }

        try {
          this.importSession(filePath, projectName);
          imported++;
        } catch {
          // Skip files that fail to import
        }
      }

    this.save();
    return { imported, skipped };
  }

  // -------------------------------------------------------------------------
  //  Queries
  // -------------------------------------------------------------------------

  getSessions(filters?: SessionFilters): SessionRow[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: string[] = [];

    if (filters?.branch) {
      conditions.push('git_branch = ?');
      params.push(filters.branch);
    }
    if (filters?.model) {
      conditions.push('model = ?');
      params.push(filters.model);
    }
    if (filters?.project) {
      conditions.push('project = ?');
      params.push(filters.project);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    const sql = `SELECT * FROM sessions ${where} ORDER BY start_time DESC`;

    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: SessionRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRow);
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

    // Daily activity (last 30 days)
    const dailyResult = db.exec(
      `SELECT DATE(start_time) as d, COUNT(*),
        COALESCE(SUM(input_tokens),0),
        COALESCE(SUM(output_tokens),0)
      FROM sessions
      WHERE start_time >= DATE('now', '-30 days')
      GROUP BY d ORDER BY d`,
    );
    const dailyActivity = (dailyResult[0]?.values ?? []).map((r) => ({
      date: String(r[0]),
      sessions: Number(r[1]),
      inputTokens: Number(r[2]),
      outputTokens: Number(r[3]),
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

    // Estimate total cost
    const totalEstimatedCost = modelBreakdown.reduce(
      (sum, m) => sum + m.estimatedCostUsd, 0,
    );

    return {
      totals: {
        sessions: totalSessions,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreation,
        estimatedCostUsd: totalEstimatedCost,
      },
      toolUsage,
      modelBreakdown,
      dailyActivity,
      branchBreakdown,
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
