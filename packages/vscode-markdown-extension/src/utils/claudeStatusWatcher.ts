import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getStatusFilePath } from './claudeHookSetup';

interface ClaudeStatus {
  editing: boolean;
  file: string;
  timestamp: number;
}

type StatusChangeCallback = (editing: boolean, filePath: string) => void;

const STALE_THRESHOLD_MS = 30_000;
const UNLOCK_POLL_INTERVAL_MS = 1000;

export class ClaudeStatusWatcher implements vscode.Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private fsWatcher: fs.FSWatcher | null = null;
  private unlockTimer: ReturnType<typeof setInterval> | null = null;
  private isLocked = false;

  constructor() {
    this.statusFilePath = getStatusFilePath();
    this.startWatching();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  private startWatching(): void {
    const dir = path.dirname(this.statusFilePath);
    const fileName = path.basename(this.statusFilePath);

    // fs.watch: イベント駆動（PreToolUse の即時検知に必要）
    try {
      this.fsWatcher = fs.watch(dir, (_, changedFile) => {
        if (changedFile === fileName) {
          this.handleChange();
        }
      });
      this.fsWatcher.on('error', () => {
        // エラー時は無視
      });
    } catch {
      // fs.watch が利用できない場合は無視
    }
  }

  private handleChange(): void {
    const status = this.readStatus();
    if (!status) return;

    if (status.editing && !this.isLocked) {
      // ロック: editing: true を検知
      this.isLocked = true;
      this.emit(true, status.file);
      // ロック解除ポーリングを開始
      this.startUnlockPolling(status.file);
    }
  }

  /** ロック中、定期的にステータスファイルを読み取り editing: false を検知したら解除 */
  private startUnlockPolling(lockedFile: string): void {
    this.stopUnlockPolling();
    this.unlockTimer = setInterval(() => {
      const status = this.readStatus();
      if (!status) return;

      const isStale = Date.now() - status.timestamp > STALE_THRESHOLD_MS;
      if (!status.editing || isStale) {
        // アンロック: editing: false またはタイムスタンプが古い
        this.isLocked = false;
        this.emit(false, lockedFile);
        this.stopUnlockPolling();
      }
    }, UNLOCK_POLL_INTERVAL_MS);
  }

  private stopUnlockPolling(): void {
    if (this.unlockTimer) {
      clearInterval(this.unlockTimer);
      this.unlockTimer = null;
    }
  }

  private readStatus(): ClaudeStatus | null {
    try {
      const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidStatus(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private emit(editing: boolean, filePath: string): void {
    for (const cb of this.callbacks) {
      cb(editing, filePath);
    }
  }

  private isValidStatus(obj: unknown): obj is ClaudeStatus {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }
    const record = obj as Record<string, unknown>;
    return (
      typeof record.editing === 'boolean' &&
      typeof record.file === 'string' &&
      typeof record.timestamp === 'number'
    );
  }

  dispose(): void {
    this.fsWatcher?.close();
    this.stopUnlockPolling();
  }
}
