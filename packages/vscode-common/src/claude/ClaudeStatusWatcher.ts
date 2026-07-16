import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  Disposable,
  SessionEdit,
  StatusChangeCallback,
  AgentInfo,
  AgentStatusRow,
  AgentStatusSource,
  MultiStatusChangeCallback,
  TodayStats,
} from './types';

const STALE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 3000;

const _jstFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
/** YYYY-MM-DD 形式の JST 日付文字列を返す */
export function jstDateString(date: Date = new Date()): string {
  return _jstFmt.format(date);
}

/**
 * agent-status ワーカーをポーリングし、編集状況の変化を通知する。
 *
 * データ源はファイルではなく注入された {@link AgentStatusSource}（agent-core の AgentStatusClient）。
 * ワーカーが未起動なら空を返すため、その間は editing 表示・エージェント一覧が空になる（欠落許容）。
 *
 * sessionTitle / contextTokens / todayStats は agent-status DB ではなく `~/.claude/projects/*.jsonl`
 * から直接読み取る（従来どおり）。
 */
export class ClaudeStatusWatcher implements Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly multiCallbacks: MultiStatusChangeCallback[] = [];
  private readonly source: AgentStatusSource;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = '';
  private lastAgentMapJson = '';
  /** ポーリングで取得した最新のエージェントマップ（同期 getter はここから返す） */
  private _agentsCache = new Map<string, AgentInfo>();
  private _polling = false;
  private readonly _titleCache = new Map<string, string>();
  private readonly _tokenCache = new Map<string, { tokens: number; expiry: number }>();
  private _todayStatsCache: { stats: TodayStats; expiry: number } | null = null;

  constructor(source: AgentStatusSource) {
    this.source = source;
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
    const edits: SessionEdit[] = [];
    for (const agent of this._agentsCache.values()) {
      edits.push(...agent.sessionEdits);
    }
    return edits;
  }

  /** 現在の全エージェントの計画対象ファイルを統合して返す */
  getPlannedEdits(): readonly string[] {
    const set = new Set<string>();
    for (const agent of this._agentsCache.values()) {
      for (const p of agent.plannedEdits) set.add(p);
    }
    return [...set];
  }

  /** 全セッションの sessionEdits と plannedEdits をクリアする（ワーカー経由） */
  async clearEdits(): Promise<void> {
    // 個別の clear はワーカー側の責務だが、現状 consumer 不在のため最小実装にとどめる。
    // 必要になれば AgentStatusSource に clear エンドポイントを追加する。
    return Promise.resolve();
  }

  /** アクティブな（非 stale）エージェント情報マップを返す */
  getAgents(): ReadonlyMap<string, AgentInfo> {
    const now = Date.now();
    const active = new Map<string, AgentInfo>();
    for (const [sid, agent] of this._agentsCache) {
      if (now - new Date(agent.timestamp).getTime() <= STALE_THRESHOLD_MS) {
        active.set(sid, agent);
      }
    }
    return active;
  }

  /** ステール済みを含む全エージェント情報マップを返す（Agent Mapping ビュー用） */
  getAllAgents(): ReadonlyMap<string, AgentInfo> {
    return this._agentsCache;
  }

  /** セッション行を削除する（ワーカー経由） */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.source.deleteSession(sessionId);
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
    // 起動直後に 1 回ポーリングし、以降は定期実行する。
    void this.handlePoll();
    this.pollTimer = setInterval(() => {
      void this.handlePoll();
    }, POLL_INTERVAL_MS);
  }

  private async handlePoll(): Promise<void> {
    // 前回のポーリングが未完了なら多重実行しない（ワーカー接続失敗時のタイムアウト累積を防ぐ）。
    if (this._polling) return;
    this._polling = true;
    try {
      const agents = await this.readAllAgents();
      this._agentsCache = agents;
      this.notify(agents);
    } finally {
      this._polling = false;
    }
  }

  private notify(agents: Map<string, AgentInfo>): void {
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

    const isStale = Date.now() - new Date(latest.timestamp).getTime() > STALE_THRESHOLD_MS;

    // stale 安全網: ワーカーが editing=true のまま更新を止める（ツール中断・PostToolUse 欠落・
    // セッション終了等）と timestamp が進まず、下の「timestamp 未更新なら return」より先に
    // stale 判定へ到達できない。stale 化した行はタイムスタンプ更新に依存せず一度だけ false へ
    // 落とす（editing バナーの取りこぼし解除を防ぐ）。
    if (isStale) {
      if (this.lastEditing === true) {
        this.lastEditing = false;
        for (const cb of this.callbacks) {
          cb(false, latest.file);
        }
      }
      return;
    }

    if (latest.timestamp === this.lastTimestamp) return;
    this.lastTimestamp = latest.timestamp;

    const editing = latest.editing;

    // PreToolUse と PostToolUse が連続して同一のポーリングサイクルに合流した場合、
    // editing=false しか観測できない。直前に editing=true があったことを示すため、
    // synthetic な true イベントを先に発火してから false を発火する。
    if (!editing && this.lastEditing !== true) {
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

  private async readAllAgents(): Promise<Map<string, AgentInfo>> {
    const agents = new Map<string, AgentInfo>();
    let rows: readonly AgentStatusRow[] = [];
    try {
      rows = await this.source.queryAll();
    } catch (err) {
      console.error(`[agent-status] queryAll failed: ${String(err)}`);
      return agents;
    }

    for (const row of rows) {
      if (!row.sessionId) continue;
      agents.set(row.sessionId, {
        sessionId: row.sessionId,
        source: 'claude',
        editing: row.editing,
        file: row.file,
        timestamp: row.updatedAt,
        branch: row.branch ?? '',
        sessionEdits: row.sessionEdits ?? [],
        plannedEdits: row.plannedEdits ?? [],
        sessionTitle: this._readSessionTitle(row.sessionId),
        workspacePath: row.workspacePath,
        contextTokens: this._readContextTokens(row.sessionId),
        committedCount: row.committedCount,
        lastCommit: row.lastCommit ?? undefined,
        pid: row.pid ?? undefined,
        terminalPid: row.terminalPid ?? undefined,
      });
    }
    return agents;
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
}
