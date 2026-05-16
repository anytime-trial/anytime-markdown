import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getStatusFilePath } from './claudeHookSetup';
import type { Disposable, ClaudeStatus, SessionEdit, StatusChangeCallback, AgentInfo, MultiStatusChangeCallback, TodayStats } from './types';

const STALE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 3000;

const _jstFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
/** YYYY-MM-DD 形式の JST 日付文字列を返す */
export function jstDateString(date: Date = new Date()): string {
  return _jstFmt.format(date);
}

export class ClaudeStatusWatcher implements Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly multiCallbacks: MultiStatusChangeCallback[] = [];
  private readonly statusDir: string;
  private readonly statusFilePrefix: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = '';
  private lastAgentMapJson = '';
  private readonly _titleCache = new Map<string, string>();
  private readonly _tokenCache = new Map<string, { tokens: number; expiry: number }>();
  private _todayStatsCache: { stats: TodayStats; expiry: number } | null = null;

  constructor(workspaceRoot?: string, statusDir?: string) {
    const filePath = getStatusFilePath(workspaceRoot, statusDir);
    this.statusDir = path.dirname(filePath);
    this.statusFilePrefix = 'claude-code-status';
    this.startPolling();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  onMultiStatusChange(callback: MultiStatusChangeCallback): void {
    this.multiCallbacks.push(callback);
  }

  /** 現在の全エージェントのセッション編集履歴を統合して返す */
  getSessionEdits(): readonly SessionEdit[] {
    const agents = this.readAllAgents();
    const edits: SessionEdit[] = [];
    for (const agent of agents.values()) {
      edits.push(...agent.sessionEdits);
    }
    return edits;
  }

  /** 現在の全エージェントの計画対象ファイルを統合して返す */
  getPlannedEdits(): readonly string[] {
    const agents = this.readAllAgents();
    const set = new Set<string>();
    for (const agent of agents.values()) {
      for (const p of agent.plannedEdits) set.add(p);
    }
    return [...set];
  }

  /** 全ステータスファイルの sessionEdits と plannedEdits をクリアする */
  clearEdits(): void {
    try {
      const files = this.listStatusFiles();
      for (const filePath of files) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null) {
            const record = parsed as Record<string, unknown>;
            record.sessionEdits = [];
            record.plannedEdits = [];
            fs.writeFileSync(filePath, JSON.stringify(record));
          }
        } catch {
          // 個別ファイルのパース失敗は無視
        }
      }
    } catch {
      // ディレクトリ読み取り失敗は無視
    }
  }

  /** アクティブなエージェント情報マップを返す */
  getAgents(): ReadonlyMap<string, AgentInfo> {
    return this.readAllAgents();
  }

  /** ステール済みを含む全エージェント情報マップを返す（Agent Mapping ビュー用） */
  getAllAgents(): ReadonlyMap<string, AgentInfo> {
    return this.readAllAgents(true);
  }

  /** ステータスファイルの格納ディレクトリを返す */
  getStatusDir(): string {
    return this.statusDir;
  }

  /** 今日（JST）のセッション数・合計トークン数を返す（60s キャッシュ） */
  getTodayStats(): TodayStats {
    if (this._todayStatsCache && Date.now() < this._todayStatsCache.expiry) {
      return this._todayStatsCache.stats;
    }
    const stats = this._computeTodayStats();
    this._todayStatsCache = { stats, expiry: Date.now() + 60_000 };
    return stats;
  }

  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  // ---------------------------------------------------------------------------
  //  Private
  // ---------------------------------------------------------------------------

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.handlePoll();
    }, POLL_INTERVAL_MS);
  }

  private handlePoll(): void {
    const agents = this.readAllAgents();

    // マルチエージェントコールバック
    const json = JSON.stringify([...agents.entries()]);
    if (json !== this.lastAgentMapJson) {
      this.lastAgentMapJson = json;
      for (const cb of this.multiCallbacks) {
        cb(agents);
      }
    }

    // 互換コールバック: 最後に更新されたアクティブエージェントの状態を通知
    let latest: AgentInfo | null = null;
    for (const agent of agents.values()) {
      if (!latest || agent.timestamp > latest.timestamp) {
        latest = agent;
      }
    }
    if (!latest) return;

    if (latest.timestamp === this.lastTimestamp) return;
    this.lastTimestamp = latest.timestamp;

    const isStale = Date.now() - new Date(latest.timestamp).getTime() > STALE_THRESHOLD_MS;
    const editing = isStale ? false : latest.editing;

    // PreToolUse と PostToolUse が連続して同一のポーリングサイクルに合流した場合、
    // editing=false しか観測できない。非 stale な editing=false は直前に editing=true が
    // あったことを示すため、synthetic な true イベントを先に発火してから false を発火する。
    if (!editing && !isStale && this.lastEditing !== true) {
      this.lastEditing = true;
      for (const cb of this.callbacks) {
        cb(true, latest.file);
      }
    }

    if (editing === this.lastEditing) return;
    this.lastEditing = editing;

    for (const cb of this.callbacks) {
      cb(editing, latest.file);
    }
  }

  private readAllAgents(includeStale = false): Map<string, AgentInfo> {
    const agents = new Map<string, AgentInfo>();
    const now = Date.now();
    const files = this.listStatusFiles();

    for (const filePath of files) {
      const status = this.readStatusFile(filePath);
      if (!status) continue;

      const elapsed = now - new Date(status.timestamp).getTime();
      if (!includeStale && elapsed > STALE_THRESHOLD_MS) continue;

      const sessionId = status.sessionId ?? this.extractSessionId(filePath);
      if (!sessionId) continue;

      agents.set(sessionId, {
        sessionId,
        editing: status.editing,
        file: status.file,
        timestamp: status.timestamp,
        branch: status.branch ?? '',
        sessionEdits: status.sessionEdits ?? [],
        plannedEdits: status.plannedEdits ?? [],
        sessionTitle: this._readSessionTitle(sessionId),
        workspacePath: status.workspacePath,
        contextTokens: this._readContextTokens(sessionId),
      });
    }
    return agents;
  }

  private listStatusFiles(): string[] {
    try {
      const entries = fs.readdirSync(this.statusDir);
      return entries
        .filter((e) => e.startsWith(this.statusFilePrefix) && e.endsWith('.json'))
        .map((e) => path.join(this.statusDir, e));
    } catch {
      return [];
    }
  }

  private extractSessionId(filePath: string): string {
    const base = path.basename(filePath, '.json');
    const prefix = 'claude-code-status-';
    if (base.startsWith(prefix)) {
      return base.slice(prefix.length);
    }
    return '';
  }

  private readStatusFile(filePath: string): ClaudeStatus | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidStatus(parsed)) return null;
      // 旧形式（number の Unix ms タイムスタンプ）を UTC ISO 8601 文字列に正規化する
      const record = parsed as unknown as Record<string, unknown>;
      if (typeof record.timestamp === 'number') {
        return { ...parsed, timestamp: new Date(record.timestamp).toISOString() } as ClaudeStatus;
      }
      return parsed as ClaudeStatus;
    } catch {
      return null;
    }
  }

  private _readSessionTitle(sessionId: string): string {
    const cached = this._titleCache.get(sessionId);
    if (cached !== undefined) return cached;

    try {
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');
      const dirs = fs.readdirSync(projectsDir);
      for (const dir of dirs) {
        const filePath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          const title = this._extractLastAiTitle(filePath);
          this._titleCache.set(sessionId, title);
          return title;
        } catch {
          // not in this project dir
        }
      }
    } catch {
      // ignore
    }

    this._titleCache.set(sessionId, '');
    return '';
  }

  private _readContextTokens(sessionId: string): number {
    const cached = this._tokenCache.get(sessionId);
    if (cached !== undefined && Date.now() < cached.expiry) return cached.tokens;

    let tokens = 0;
    try {
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');
      for (const dir of fs.readdirSync(projectsDir)) {
        const filePath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          tokens = this._extractContextTokens(filePath);
          break;
        } catch {
          // not in this project dir
        }
      }
    } catch {
      // ignore
    }

    this._tokenCache.set(sessionId, { tokens, expiry: Date.now() + 15_000 });
    return tokens;
  }

  private _computeTodayStats(): TodayStats {
    const todayJst = jstDateString();
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    let sessionCount = 0;
    let totalTokens = 0;
    try {
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(projectsDir, entry.name);
        try {
          for (const file of fs.readdirSync(dirPath)) {
            if (!file.endsWith('.jsonl')) continue;
            const filePath = path.join(dirPath, file);
            if (jstDateString(new Date(fs.statSync(filePath).mtimeMs)) === todayJst) {
              sessionCount++;
              totalTokens += this._extractContextTokens(filePath);
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return { sessionCount, totalTokens };
  }

  private _extractContextTokens(filePath: string): number {
    try {
      // TOCTOU 競合を避けるため、open 後の fstat でサイズを取得する。
      const fd = fs.openSync(filePath, 'r');
      const stats = fs.fstatSync(fd);
      const readSize = Math.min(stats.size, 16384);
      const buffer = Buffer.alloc(readSize);
      fs.readSync(fd, buffer, 0, readSize, Math.max(0, stats.size - readSize));
      fs.closeSync(fd);
      let lastTokens = 0;
      for (const line of buffer.toString('utf-8').split('\n')) {
        if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
        try {
          const obj = JSON.parse(line) as {
            type?: string;
            message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
          };
          if (obj.type === 'assistant' && obj.message?.usage) {
            const u = obj.message.usage;
            lastTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
          }
        } catch {
          // skip malformed line
        }
      }
      return lastTokens;
    } catch {
      return 0;
    }
  }

  private _extractLastAiTitle(filePath: string): string {
    try {
      // TOCTOU 競合を避けるため、open 後の fstat でサイズを取得する。
      const fd = fs.openSync(filePath, 'r');
      const stats = fs.fstatSync(fd);
      const readSize = Math.min(stats.size, 8192);
      const buffer = Buffer.alloc(readSize);
      fs.readSync(fd, buffer, 0, readSize, Math.max(0, stats.size - readSize));
      fs.closeSync(fd);
      let lastTitle = '';
      for (const line of buffer.toString('utf-8').split('\n')) {
        if (!line.includes('"ai-title"')) continue;
        try {
          const obj = JSON.parse(line) as { type?: string; aiTitle?: string };
          if (obj.type === 'ai-title' && obj.aiTitle) {
            lastTitle = obj.aiTitle;
          }
        } catch {
          // skip malformed line
        }
      }
      return lastTitle;
    } catch {
      return '';
    }
  }

  private isValidStatus(obj: unknown): obj is ClaudeStatus {
    if (typeof obj !== 'object' || obj === null) return false;
    const record = obj as Record<string, unknown>;
    return (
      typeof record.editing === 'boolean' &&
      typeof record.file === 'string' &&
      // timestamp は UTC ISO 8601 文字列。旧形式（number）との後方互換のため number も許容する。
      (typeof record.timestamp === 'string' || typeof record.timestamp === 'number')
    );
  }
}
