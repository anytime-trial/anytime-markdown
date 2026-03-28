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
const POLL_INTERVAL_MS = 3000;

export class ClaudeStatusWatcher implements vscode.Disposable {
  private readonly callbacks: StatusChangeCallback[] = [];
  private readonly statusFilePath: string;
  private fsWatcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEditing: boolean | null = null;
  private lastTimestamp = 0;

  constructor() {
    this.statusFilePath = getStatusFilePath();
    this.ensureFileAndWatch();
    this.startPolling();
  }

  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  /** ステータスファイルが存在しなければ作成し、ファイル単位で fs.watch する */
  private ensureFileAndWatch(): void {
    if (!fs.existsSync(this.statusFilePath)) {
      fs.writeFileSync(this.statusFilePath, '{}');
    }
    this.attachFileWatch();
  }

  private attachFileWatch(): void {
    this.fsWatcher?.close();
    try {
      // ファイル単位の fs.watch（ディレクトリ監視ではないため VS Code と競合しない）
      this.fsWatcher = fs.watch(this.statusFilePath, () => {
        this.handleChange();
      });
      this.fsWatcher.on('error', () => {
        // エラー時はポーリングにフォールバック
        this.fsWatcher?.close();
        this.fsWatcher = null;
      });
    } catch {
      // fs.watch 失敗時は無視（ポーリングで対応）
    }
  }

  /** フォールバック: fs.watch がイベントを取りこぼす環境向け */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.handleChange();
    }, POLL_INTERVAL_MS);
  }

  private handleChange(): void {
    const status = this.readStatus();
    if (!status) return;

    // タイムスタンプが変わっていなければスキップ
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
    this.fsWatcher?.close();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
