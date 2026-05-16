import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { TrailLogger } from '../utils/TrailLogger';
import type { PipelineStatusFile, PipelineStatusEntry, PipelineState } from '@anytime-markdown/memory-core';

const OLLAMA_PORT = 11434;
const OLLAMA_PATH = '/api/tags';
const FETCH_TIMEOUT_MS = 2000;
const POLL_NORMAL_MS = 10_000;
const POLL_FAST_MS = 3_000;
const FAST_POLL_DURATION_MS = 30_000;
const POLL_STATUS_FILE_MS = 2_000;

function isInsideContainer(): boolean {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

export type OllamaItemKind = 'header' | 'model' | 'pipeline-separator' | 'pipeline';

interface OllamaItemOptions {
  running?: boolean;
  state?: PipelineState;
  description?: string;
}

const PIPELINE_ICON: Record<PipelineState, string> = {
  pending: 'circle-large-outline',
  running: 'sync~spin',
  success: 'check',
  partial: 'warning',
  error: 'error',
  skipped: 'dash',
};

export class OllamaItem extends vscode.TreeItem {
  constructor(
    public readonly kind: OllamaItemKind,
    label: string,
    options: OllamaItemOptions = {},
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (kind === 'header') {
      this.iconPath = new vscode.ThemeIcon(options.running ? 'pass' : 'circle-slash');
      this.contextValue = 'ollamaHeader';
    } else if (kind === 'model') {
      this.iconPath = new vscode.ThemeIcon('package');
      this.contextValue = 'ollamaModel';
    } else if (kind === 'pipeline-separator') {
      this.contextValue = 'ollamaPipelineSeparator';
    } else {
      this.iconPath = new vscode.ThemeIcon(PIPELINE_ICON[options.state ?? 'pending']);
      this.description = options.description;
      this.contextValue = 'ollamaPipeline';
    }
  }
}

interface OllamaStatus {
  running: boolean;
  models: string[];
}

async function trySingleHost(host: string): Promise<OllamaStatus | null> {
  const url = `http://${host}:${OLLAMA_PORT}${OLLAMA_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      return { running: true, models: [] };
    }
    const data = (await resp.json()) as { models?: { name: string }[] };
    return { running: true, models: data.models?.map((m) => m.name) ?? [] };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOllamaStatus(): Promise<OllamaStatus> {
  // Dev Container 内では localhost がコンテナ自身を指すため host.docker.internal にもフォールバック
  const hosts = isInsideContainer()
    ? ['localhost', 'host.docker.internal']
    : ['localhost'];

  for (const host of hosts) {
    const result = await trySingleHost(host);
    if (result !== null) { return result; }
  }
  return { running: false, models: [] };
}

function readPipelineStatus(filePath: string | undefined): PipelineStatusFile | null {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as PipelineStatusFile;
  } catch {
    return null;
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s === 0 ? `${m}m` : `${m}m${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h${mm}m`;
}

function elapsedSeconds(p: PipelineStatusEntry, now: number): number | null {
  if (!p.started_at) return null;
  const startedMs = new Date(p.started_at).getTime();
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, (now - startedMs) / 1000);
}

function totalDurationSeconds(p: PipelineStatusEntry): number | null {
  if (!p.started_at || !p.finished_at) return null;
  const startedMs = new Date(p.started_at).getTime();
  const finishedMs = new Date(p.finished_at).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) return null;
  return Math.max(0, (finishedMs - startedMs) / 1000);
}

export function formatPipelineDescription(
  p: PipelineStatusEntry,
  now: number = Date.now(),
): string {
  if (p.state === 'running') {
    const elapsed = elapsedSeconds(p, now);
    const elapsedStr = elapsed !== null ? formatDuration(elapsed) : '';
    if (p.items_total && p.items_processed !== undefined && p.items_processed > 0 && elapsed) {
      const remaining = ((p.items_total - p.items_processed) / p.items_processed) * elapsed;
      const eta = remaining > 0 ? `, ~${formatDuration(remaining)} left` : '';
      const failed = p.items_failed ? ` (failed=${p.items_failed})` : '';
      return `${p.items_processed}/${p.items_total} (${elapsedStr}${eta})${failed}`;
    }
    if (p.items_total && p.items_processed !== undefined) {
      return `${p.items_processed}/${p.items_total} (${elapsedStr})`;
    }
    if (p.items_processed !== undefined && p.items_processed > 0) {
      return `${p.items_processed} processed (${elapsedStr})`;
    }
    return elapsedStr ? `running (${elapsedStr})` : 'running';
  }
  if (p.state === 'success' || p.state === 'partial') {
    const dur = totalDurationSeconds(p);
    const durStr = dur !== null ? ` in ${formatDuration(dur)}` : '';
    if (p.items_processed !== undefined && p.items_processed > 0) {
      const failed = p.items_failed ? ` (failed=${p.items_failed})` : '';
      return `${p.items_processed} done${durStr}${failed}`;
    }
    return `done${durStr}`;
  }
  if (p.state === 'error') {
    return p.message ? `error: ${p.message.slice(0, 60)}` : 'error';
  }
  if (p.state === 'skipped') return 'skipped';
  return '';
}

export interface OllamaProviderOptions {
  statusFilePath?: string;
}

export class OllamaProvider
  implements vscode.TreeDataProvider<OllamaItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _status: OllamaStatus = { running: false, models: [] };
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _fastPollTimer: ReturnType<typeof setTimeout> | undefined;
  private _statusFileTimer: ReturnType<typeof setInterval> | undefined;
  private _lastStatusFileMtime = 0;
  private readonly _statusFilePath: string | undefined;

  constructor(options: OllamaProviderOptions = {}) {
    this._statusFilePath = options.statusFilePath;
    this._startPolling(POLL_NORMAL_MS);
    void this._poll();
    if (this._statusFilePath) {
      this._startStatusFilePolling();
    }
  }

  private _startPolling(intervalMs: number): void {
    if (this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
    }
    this._pollTimer = setInterval(() => {
      void this._poll();
    }, intervalMs);
  }

  private _startStatusFilePolling(): void {
    this._statusFileTimer = setInterval(() => {
      this._checkStatusFile();
    }, POLL_STATUS_FILE_MS);
  }

  private _checkStatusFile(): void {
    if (!this._statusFilePath) return;
    try {
      if (!fs.existsSync(this._statusFilePath)) return;
      const stat = fs.statSync(this._statusFilePath);
      const mtime = stat.mtimeMs;
      const mtimeChanged = mtime !== this._lastStatusFileMtime;

      // 経過時間の表示を tick させるため、running pipeline があれば mtime 変化なしでも refresh する。
      const status = readPipelineStatus(this._statusFilePath);
      const hasRunning =
        status?.pipelines.some((p) => p.state === 'running') ?? false;

      if (mtimeChanged) {
        this._lastStatusFileMtime = mtime;
      }
      if (mtimeChanged || hasRunning) {
        this._onDidChangeTreeData.fire();
      }
    } catch {
      // ignore
    }
  }

  private async _poll(): Promise<void> {
    const status = await fetchOllamaStatus();
    const changed =
      status.running !== this._status.running ||
      JSON.stringify(status.models) !== JSON.stringify(this._status.models);
    this._status = status;
    await vscode.commands.executeCommand(
      'setContext',
      'anytime-trail.ollamaRunning',
      status.running,
    );
    if (changed) {
      this._onDidChangeTreeData.fire();
    }
  }

  async getChildren(): Promise<OllamaItem[]> {
    const status = await fetchOllamaStatus();
    this._status = status;
    const headerLabel = status.running ? '起動中' : '停止中';
    const items: OllamaItem[] = [
      new OllamaItem('header', headerLabel, { running: status.running }),
    ];
    for (const model of status.models) {
      items.push(new OllamaItem('model', model));
    }

    const pipelineStatus = readPipelineStatus(this._statusFilePath);
    if (pipelineStatus && pipelineStatus.pipelines.length > 0) {
      items.push(new OllamaItem('pipeline-separator', '── Pipelines ──'));
      for (const p of pipelineStatus.pipelines) {
        items.push(
          new OllamaItem('pipeline', p.scope, {
            state: p.state,
            description: formatPipelineDescription(p),
          }),
        );
      }
    }
    return items;
  }

  getTreeItem(element: OllamaItem): vscode.TreeItem {
    return element;
  }

  async startOllama(): Promise<void> {
    const status = await fetchOllamaStatus();
    if (status.running) {
      vscode.window.showInformationMessage('Ollama は既に起動しています。');
      return;
    }

    // spawn() は ENOENT を同期 throw せず 'error' イベントで通知する
    const child = cp.spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const msg = isInsideContainer()
          ? 'Dev Container 内では ollama を直接起動できません。WSL ターミナルで `ollama serve` を実行してください。'
          : 'ollama コマンドが見つかりません。インストールを確認してください。';
        vscode.window.showErrorMessage(msg);
      } else {
        TrailLogger.error(`[OllamaProvider] spawn error: ${err.stack ?? String(err)}`);
      }
    });
    child.unref();
    TrailLogger.info('[OllamaProvider] ollama serve spawned');

    // 起動後 30 秒間はショートポーリング
    this._startPolling(POLL_FAST_MS);
    if (this._fastPollTimer !== undefined) {
      clearTimeout(this._fastPollTimer);
    }
    this._fastPollTimer = setTimeout(() => {
      this._startPolling(POLL_NORMAL_MS);
    }, FAST_POLL_DURATION_MS);
  }

  dispose(): void {
    if (this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
    }
    if (this._fastPollTimer !== undefined) {
      clearTimeout(this._fastPollTimer);
    }
    if (this._statusFileTimer !== undefined) {
      clearInterval(this._statusFileTimer);
    }
    this._onDidChangeTreeData.dispose();
  }
}
