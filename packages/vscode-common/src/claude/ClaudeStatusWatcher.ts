import * as fs from 'node:fs';
import * as path from 'node:path';
import { getStatusFilePath } from './claudeHookSetup';
import type { Disposable, ClaudeStatus, SessionEdit, StatusChangeCallback, AgentInfo, MultiStatusChangeCallback } from './types';

const STALE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 3000;

export class ClaudeStatusWatcher implements Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly multiCallbacks: MultiStatusChangeCallback[] = [];
  private readonly statusDir: string;
  private readonly statusFilePrefix: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = '';
  private lastAgentMapJson = '';

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

  private readAllAgents(): Map<string, AgentInfo> {
    const agents = new Map<string, AgentInfo>();
    const now = Date.now();
    const files = this.listStatusFiles();

    for (const filePath of files) {
      const status = this.readStatusFile(filePath);
      if (!status) continue;

      const elapsed = now - new Date(status.timestamp).getTime();
      if (elapsed > STALE_THRESHOLD_MS) continue;

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
