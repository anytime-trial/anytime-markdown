import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { AgentLogger } from '../utils/AgentLogger';

const OLLAMA_PORT = 11434;
const OLLAMA_PATH = '/api/tags';
const FETCH_TIMEOUT_MS = 2000;
const POLL_NORMAL_MS = 10_000;
const POLL_FAST_MS = 3_000;
const FAST_POLL_DURATION_MS = 30_000;

function isInsideContainer(): boolean {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

export type OllamaItemKind = 'header' | 'model' | 'throttle';

interface OllamaItemOptions {
  running?: boolean;
  description?: string;
  iconId?: string;
  color?: vscode.ThemeColor;
}

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
    } else if (kind === 'throttle') {
      this.iconPath = new vscode.ThemeIcon(options.iconId ?? 'pulse', options.color);
      this.description = options.description;
      this.contextValue = 'ollamaThrottle';
    } else {
      this.iconPath = new vscode.ThemeIcon('package');
      this.contextValue = 'ollamaModel';
    }
  }
}

const THROTTLE_STALE_MS = 60_000;

interface ThrottleStatusFile {
  enabled: boolean;
  state: 'NORMAL' | 'COOLING';
  entries: { op: string; model: string; lastLatencyMs: number; ewmaMs: number; count: number }[];
  updatedAt: string;
}

/** throttle-status.json を読む。不在/stale/disabled/parse 失敗時は null。 */
function readThrottleStatus(filePath: string | undefined, nowMs: number): ThrottleStatusFile | null {
  if (!filePath) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8') as string;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      AgentLogger.error(
        `[OllamaProvider] throttle-status read failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
    return null; // 不在は throttle 無効時の正常系
  }
  try {
    const parsed = JSON.parse(raw) as ThrottleStatusFile;
    if (!parsed.enabled) return null;
    const updated = Date.parse(parsed.updatedAt);
    if (Number.isNaN(updated) || nowMs - updated > THROTTLE_STALE_MS) return null;
    return parsed;
  } catch (err) {
    AgentLogger.error(
      `[OllamaProvider] throttle-status parse failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    return null;
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
  private _throttle: ThrottleStatusFile | null = null;
  private readonly _throttleStatusPath: string | undefined;

  constructor(throttleStatusPath?: string) {
    this._throttleStatusPath = throttleStatusPath;
    this._startPolling(POLL_NORMAL_MS);
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
    const throttle = readThrottleStatus(this._throttleStatusPath, Date.now());
    const runningChanged = status.running !== this._status.running;
    const treeChanged =
      runningChanged ||
      JSON.stringify(status.models) !== JSON.stringify(this._status.models) ||
      JSON.stringify(throttle) !== JSON.stringify(this._throttle);
    this._status = status;
    this._throttle = throttle;
    if (runningChanged) {
      await vscode.commands.executeCommand(
        'setContext',
        'anytime-agent.ollamaRunning',
        status.running,
      );
    }
    if (treeChanged) {
      this._onDidChangeTreeData.fire();
    }
  }

  async getChildren(): Promise<OllamaItem[]> {
    const status = this._status;
    const headerLabel = status.running ? '起動中' : '停止中';
    const items: OllamaItem[] = [
      new OllamaItem('header', headerLabel, { running: status.running }),
    ];
    const throttle = this._throttle;
    if (throttle) {
      const cooling = throttle.state === 'COOLING';
      items.push(
        new OllamaItem('throttle', 'throttle', {
          description: throttle.state,
          iconId: 'thermometer',
          color: cooling ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : undefined,
        }),
      );
      for (const e of throttle.entries) {
        if (e.op !== 'embeddings') continue;
        const ratio = e.ewmaMs > 0 ? (e.lastLatencyMs / e.ewmaMs).toFixed(2) : '—';
        const provisional = e.count < 5 ? ' (測定中)' : '';
        items.push(
          new OllamaItem('throttle', 'embeddings', {
            description: `直近 ${Math.round(e.lastLatencyMs)}ms · 基準 ${Math.round(e.ewmaMs)}ms (×${ratio})${provisional}`,
            iconId: 'pulse',
          }),
        );
      }
    }
    for (const model of status.models) {
      items.push(new OllamaItem('model', model));
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
        AgentLogger.error(`[OllamaProvider] spawn error: ${err.stack ?? String(err)}`);
      }
    });
    child.unref();
    AgentLogger.info('[OllamaProvider] ollama serve spawned');

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
