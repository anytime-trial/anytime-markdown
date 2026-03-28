import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { getStatusFilePath } from './claudeHookSetup';

interface ClaudeStatus {
  editing: boolean;
  file: string;
  timestamp: number;
}

type StatusChangeCallback = (editing: boolean, filePath: string) => void;

const STALE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export class ClaudeStatusWatcher implements vscode.Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = 0;

  constructor() {
    this.statusFilePath = getStatusFilePath();
    this.startPolling();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, POLL_INTERVAL_MS);
  }

  private checkStatus(): void {
    const status = this.readStatus();
    if (!status) return;

    // タイムスタンプが変わっていない場合はスキップ（ファイル未更新）
    if (status.timestamp === this.lastTimestamp) return;
    this.lastTimestamp = status.timestamp;

    const isStale = Date.now() - status.timestamp > STALE_THRESHOLD_MS;
    const editing = isStale ? false : status.editing;

    // 状態が変化した場合のみコールバック発火
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
      if (!this.isValidStatus(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
