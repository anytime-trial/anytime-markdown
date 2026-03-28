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

export class ClaudeStatusWatcher implements vscode.Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private lastEditing: boolean | null = null;
  private lastFile = '';

  constructor() {
    this.statusFilePath = getStatusFilePath();
    this.startWatching();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  private startWatching(): void {
    // fs.watchFile: ファイル単位の stat ポーリング（WSL2/Docker でも確実に動作）
    fs.watchFile(this.statusFilePath, { interval: 1000 }, () => {
      this.handleChange();
    });
  }

  private handleChange(): void {
    try {
      const raw = fs.readFileSync(this.statusFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidStatus(parsed)) {
        return;
      }
      const isStale = Date.now() - parsed.timestamp > STALE_THRESHOLD_MS;
      const editing = isStale ? false : parsed.editing;

      // 状態が変化した場合のみコールバックを発火
      if (editing === this.lastEditing && parsed.file === this.lastFile) {
        return;
      }
      this.lastEditing = editing;
      this.lastFile = parsed.file;

      for (const cb of this.callbacks) {
        cb(editing, parsed.file);
      }
    } catch {
      // JSON パース失敗やファイル読み取り失敗は無視
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
    fs.unwatchFile(this.statusFilePath);
  }
}
