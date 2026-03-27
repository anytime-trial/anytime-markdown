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

export class ClaudeStatusWatcher implements vscode.Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private fsWatcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastMtime = 0;

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

    // fs.watch でステータスファイルのディレクトリを監視
    try {
      this.fsWatcher = fs.watch(dir, (eventType, changedFile) => {
        if (changedFile === fileName) {
          this.handleChange();
        }
      });
      this.fsWatcher.on('error', () => {
        // エラー時は無視（ポーリングにフォールバック）
      });
    } catch {
      // fs.watch が利用できない場合は無視
    }

    // フォールバック: mtime ベースのポーリング（WSL2 等の環境向け）
    this.pollTimer = setInterval(() => {
      try {
        const stat = fs.statSync(this.statusFilePath);
        const mtime = stat.mtimeMs;
        if (mtime !== this.lastMtime) {
          this.lastMtime = mtime;
          this.handleChange();
        }
      } catch {
        // ファイルが存在しない場合は無視
      }
    }, 2000);
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
    this.fsWatcher?.close();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
