import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { TrailLogger } from '../utils/TrailLogger';
import type { PipelineStatusFile, PipelineStatusEntry, PipelineState } from '@anytime-markdown/memory-core';
import type { ImportAllPhase } from '@anytime-markdown/trail-db';

/**
 * importAll 内部の job (phase) 単位の表示順。OLLAMA panel ではこの順序で並ぶ。
 */
export const IMPORT_ALL_PHASE_ORDER: readonly ImportAllPhase[] = [
  'import_sessions',
  'resolve_releases',
  'analyze_releases',
  'import_coverage',
  'rebuild_costs',
  'analyze_behavior',
  'rebuild_counts',
  'backfill',
];

/**
 * importAll 内 1 phase の追跡状態。OllamaProvider 内のメモリに保持される。
 */
interface ImportAllPhaseState {
  state: PipelineState;
  startedAt?: string;
  finishedAt?: string;
  count?: number;
  message?: string;
}

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
  /**
   * trail.db の絶対パス。指定時、Pipelines セクションの先頭に backup ジョブを表示し、
   * `${dbFilePath}.bak.1.gz` の存在/mtime/サイズから状態を導出する。
   */
  dbFilePath?: string;
}

interface BackupPipelineDisplay {
  scope: string;
  state: PipelineState;
  description: string;
}

/**
 * trailDb.importAll() の最新実行状態 (in-process)。
 * 外部デーモン経由の importAll は本拡張からは追跡できないため反映されない。
 *
 * 単一エントリ表示は廃止し、各 phase を個別エントリとして表示する設計に
 * 移行した ({@link IMPORT_ALL_PHASE_ORDER}, {@link ImportAllPhaseState})。
 * 本型は後方互換目的で残してあるが、現在は内部参照されない。
 */
export interface ImportAllRunInfo {
  state: PipelineState;
  startedAt?: string;
  finishedAt?: string;
  imported?: number;
  skipped?: number;
  message?: string;
}

/**
 * importAll の単一 phase から表示用エントリを組み立てる。
 * - 未追跡 (null): state='pending', "未実行"
 * - running: 経過時間
 * - success/partial: "{count} done in {duration}" (count なら "done in {duration}")
 * - skip: "skipped: {message}"
 * - error: "error: {message}"
 *
 * scope はそのまま phase 名 (e.g. 'import_sessions') を返すため、UI 側で
 * label に使える。
 */
export function buildImportAllPhaseDisplay(
  phase: ImportAllPhase,
  state: ImportAllPhaseState | null,
  now: number = Date.now(),
): BackupPipelineDisplay {
  if (!state) {
    return { scope: phase, state: 'pending', description: '未実行' };
  }
  if (state.state === 'running') {
    const startedMs = state.startedAt ? new Date(state.startedAt).getTime() : NaN;
    const elapsed = Number.isFinite(startedMs)
      ? Math.max(0, (now - startedMs) / 1000)
      : null;
    return {
      scope: phase,
      state: 'running',
      description: elapsed !== null ? `running (${formatDuration(elapsed)})` : 'running',
    };
  }
  if (state.state === 'success' || state.state === 'partial') {
    const startedMs = state.startedAt ? new Date(state.startedAt).getTime() : NaN;
    const finishedMs = state.finishedAt ? new Date(state.finishedAt).getTime() : NaN;
    const dur =
      Number.isFinite(startedMs) && Number.isFinite(finishedMs)
        ? Math.max(0, (finishedMs - startedMs) / 1000)
        : null;
    const durStr = dur !== null ? ` in ${formatDuration(dur)}` : '';
    if (state.count !== undefined) {
      return { scope: phase, state: state.state, description: `${state.count} done${durStr}` };
    }
    return { scope: phase, state: state.state, description: `done${durStr}` };
  }
  if (state.state === 'skipped') {
    return {
      scope: phase,
      state: 'skipped',
      description: state.message ? `skipped: ${state.message.slice(0, 60)}` : 'skipped',
    };
  }
  if (state.state === 'error') {
    return {
      scope: phase,
      state: 'error',
      description: state.message ? `error: ${state.message.slice(0, 60)}` : 'error',
    };
  }
  return { scope: phase, state: state.state, description: '' };
}

/**
 * バックアップ世代ファイル (.bak.1.gz) の存在から表示用エントリを組み立てる。
 * - 存在しない: state='pending', "未作成"
 * - 存在する: state='success', "${size}MB · ${mtime}"
 * - I/O エラー: state='error'
 */
export function buildBackupDisplay(dbFilePath: string): BackupPipelineDisplay {
  const bakPath = `${dbFilePath}.bak.1.gz`;
  try {
    if (!fs.existsSync(bakPath)) {
      return { scope: 'backup', state: 'pending', description: '未作成' };
    }
    const stat = fs.statSync(bakPath);
    const mb = (stat.size / 1024 / 1024).toFixed(1);
    return {
      scope: 'backup',
      state: 'success',
      description: `${mb} MB · ${stat.mtime.toLocaleString()}`,
    };
  } catch (err) {
    return {
      scope: 'backup',
      state: 'error',
      description: err instanceof Error ? err.message.slice(0, 60) : 'fs error',
    };
  }
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
  private readonly _dbFilePath: string | undefined;
  private readonly _importAllPhases = new Map<ImportAllPhase, ImportAllPhaseState>();

  constructor(options: OllamaProviderOptions = {}) {
    this._statusFilePath = options.statusFilePath;
    this._dbFilePath = options.dbFilePath;
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
      let mtimeChanged = false;
      if (fs.existsSync(this._statusFilePath)) {
        const stat = fs.statSync(this._statusFilePath);
        const mtime = stat.mtimeMs;
        mtimeChanged = mtime !== this._lastStatusFileMtime;
        if (mtimeChanged) {
          this._lastStatusFileMtime = mtime;
        }
      }

      // 経過時間の表示を tick させるため、running phase (memory-core / importAll) が
      // あれば mtime 変化なしでも refresh する。
      const status = readPipelineStatus(this._statusFilePath);
      const hasRunningPipeline =
        status?.pipelines.some((p) => p.state === 'running') ?? false;
      const importAllPhaseRunning = Array.from(this._importAllPhases.values()).some(
        (s) => s.state === 'running',
      );

      if (mtimeChanged || hasRunningPipeline || importAllPhaseRunning) {
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
    // Ollama 状態は _pollTimer (POLL_NORMAL_MS) が定期更新する _status を参照する。
    // ここで fetchOllamaStatus() を呼ぶと FETCH_TIMEOUT_MS まで毎回ブロックして
    // importAll の rapid な phase event firing 時に tree refresh が連鎖的に遅延する
    // (重要: phase の per-phase 進捗が UI に反映されなくなる)。
    const status = this._status;
    const headerLabel = status.running ? '起動中' : '停止中';
    const items: OllamaItem[] = [
      new OllamaItem('header', headerLabel, { running: status.running }),
    ];
    for (const model of status.models) {
      items.push(new OllamaItem('model', model));
    }

    // Pipelines セクション: backup → importAll の 8 phases → memory-core pipelines の順。
    // backup / importAll phases は dbFilePath が指定されていれば常時 (pending 含む) 表示。
    const backup = this._dbFilePath ? buildBackupDisplay(this._dbFilePath) : null;
    const importAllPhases = this._dbFilePath
      ? IMPORT_ALL_PHASE_ORDER.map((phase) =>
          buildImportAllPhaseDisplay(phase, this._importAllPhases.get(phase) ?? null),
        )
      : [];
    const pipelineStatus = readPipelineStatus(this._statusFilePath);
    const memoryPipelines = pipelineStatus?.pipelines ?? [];

    if (backup || importAllPhases.length > 0 || memoryPipelines.length > 0) {
      items.push(new OllamaItem('pipeline-separator', '── Pipelines ──'));
      if (backup) {
        items.push(
          new OllamaItem('pipeline', backup.scope, {
            state: backup.state,
            description: backup.description,
          }),
        );
      }
      for (const ph of importAllPhases) {
        items.push(
          new OllamaItem('pipeline', ph.scope, {
            state: ph.state,
            description: ph.description,
          }),
        );
      }
      for (const p of memoryPipelines) {
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

  /**
   * importAll の単一 phase 状態を更新する。
   * action: 'start' | 'finish' | 'skip' | 'error' で state が決まる。
   *
   * 連続呼び出し:
   * - 'start' → 'finish'/'skip'/'error' で startedAt → finishedAt を保持
   * - 重複 'start' は startedAt を更新 (再実行の意味)
   */
  setImportAllPhase(
    phase: ImportAllPhase,
    action: 'start' | 'finish' | 'skip' | 'error',
    info: { count?: number; message?: string } = {},
  ): void {
    const now = new Date().toISOString();
    const previous = this._importAllPhases.get(phase);
    if (action === 'start') {
      this._importAllPhases.set(phase, {
        state: 'running',
        startedAt: now,
      });
    } else if (action === 'finish') {
      this._importAllPhases.set(phase, {
        state: 'success',
        startedAt: previous?.startedAt,
        finishedAt: now,
        count: info.count,
      });
    } else if (action === 'skip') {
      this._importAllPhases.set(phase, {
        state: 'skipped',
        startedAt: previous?.startedAt,
        finishedAt: now,
        message: info.message,
      });
    } else {
      // error
      this._importAllPhases.set(phase, {
        state: 'error',
        startedAt: previous?.startedAt,
        finishedAt: now,
        message: info.message,
      });
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * importAll 全体を未実行状態に戻す (新しい実行サイクルの開始前に呼び、
   * 前回 success/error の表示を消す)。
   */
  resetImportAllPhases(): void {
    this._importAllPhases.clear();
    this._onDidChangeTreeData.fire();
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
