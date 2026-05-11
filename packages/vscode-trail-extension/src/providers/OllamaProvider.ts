import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { TrailLogger } from '../utils/TrailLogger';

const OLLAMA_PORT = 11434;
const OLLAMA_PATH = '/api/tags';
const FETCH_TIMEOUT_MS = 2000;

function isInsideContainer(): boolean {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}
const POLL_NORMAL_MS = 10_000;
const POLL_FAST_MS = 3_000;
const FAST_POLL_DURATION_MS = 30_000;

export type OllamaItemKind = 'header' | 'model';

export class OllamaItem extends vscode.TreeItem {
  constructor(
    public readonly kind: OllamaItemKind,
    label: string,
    running: boolean,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (kind === 'header') {
      this.iconPath = new vscode.ThemeIcon(running ? 'pass' : 'circle-slash');
      this.contextValue = 'ollamaHeader';
    } else {
      this.iconPath = new vscode.ThemeIcon('package');
      this.contextValue = 'ollamaModel';
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

export class OllamaProvider
  implements vscode.TreeDataProvider<OllamaItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _status: OllamaStatus = { running: false, models: [] };
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _fastPollTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this._startPolling(POLL_NORMAL_MS);
    // 初回即時確認 (fire-and-forget)
    void this._poll();
  }

  private _startPolling(intervalMs: number): void {
    if (this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
    }
    this._pollTimer = setInterval(() => {
      void this._poll();
    }, intervalMs);
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
      new OllamaItem('header', headerLabel, status.running),
    ];
    for (const model of status.models) {
      items.push(new OllamaItem('model', model, true));
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
    this._onDidChangeTreeData.dispose();
  }
}
