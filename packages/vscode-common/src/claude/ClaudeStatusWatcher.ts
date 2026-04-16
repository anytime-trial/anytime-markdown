import * as fs from 'node:fs';
import { getStatusFilePath } from './claudeHookSetup';
import type { Disposable, ClaudeStatus, SessionEdit, StatusChangeCallback } from './types';

const STALE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 3000;

export class ClaudeStatusWatcher implements Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private fsWatcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = '';

  constructor(workspaceRoot?: string, statusDir?: string) {
    this.statusFilePath = getStatusFilePath(workspaceRoot, statusDir);
    this.ensureFileAndWatch();
    this.startPolling();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  private ensureFileAndWatch(): void {
    try {
      fs.writeFileSync(this.statusFilePath, '{}', { flag: 'wx', mode: 0o600 });
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
        // ファイル作成失敗時はポーリングで対応
      }
    }
    this.attachFileWatch();
  }

  private attachFileWatch(): void {
    this.fsWatcher?.close();
    try {
      this.fsWatcher = fs.watch(this.statusFilePath, () => {
        this.handleChange();
      });
      this.fsWatcher.on('error', () => {
        this.fsWatcher?.close();
        this.fsWatcher = null;
      });
    } catch {
      // fs.watch 失敗時はポーリングで対応
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.handleChange();
    }, POLL_INTERVAL_MS);
  }

  /** 現在のステータスファイルに記録されたセッション編集履歴を返す */
  getSessionEdits(): readonly SessionEdit[] {
    return this.readStatus()?.sessionEdits ?? [];
  }

  private handleChange(): void {
    const status = this.readStatus();
    if (!status) return;

    if (status.timestamp === this.lastTimestamp) return;
    this.lastTimestamp = status.timestamp;

    const isStale = Date.now() - new Date(status.timestamp).getTime() > STALE_THRESHOLD_MS;
    const editing = isStale ? false : status.editing;

    // PreToolUse と PostToolUse が連続して同一の fs.watch イベントに合流した場合、
    // editing=false しか観測できない。非 stale な editing=false は直前に editing=true が
    // あったことを示すため、synthetic な true イベントを先に発火してから false を発火する。
    // stale（30秒超）の場合は前セッションの残存データなので synthetic を発火しない。
    if (!editing && !isStale && this.lastEditing !== true) {
      this.lastEditing = true;
      for (const cb of this.callbacks) {
        cb(true, status.file);
      }
    }

    if (editing === this.lastEditing) return;
    this.lastEditing = editing;

    for (const cb of this.callbacks) {
      cb(editing, status.file);
    }
  }

  private readStatus(): ClaudeStatus | null {
    try {
      const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidStatus(parsed)) return null;
      // 旧形式（number の Unix ms タイムスタンプ）を UTC ISO 8601 文字列に正規化する
      const record = parsed as Record<string, unknown>;
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

  dispose(): void {
    this.fsWatcher?.close();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
