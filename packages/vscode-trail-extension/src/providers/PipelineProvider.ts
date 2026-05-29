import * as fs from 'node:fs';
import * as vscode from 'vscode';
import type { PipelineStatusFile, PipelineStatusEntry, PipelineState } from '@anytime-markdown/memory-core';
import type { ImportAllPhase } from '@anytime-markdown/trail-db';
import { readImportAllPhaseStatus } from '@anytime-markdown/trail-server/jobs';

const POLL_STATUS_FILE_MS = 2_000;

export type PipelineItemKind = 'group' | 'pipeline';

interface PipelineItemOptions {
  state?: PipelineState;
  description?: string;
  /** group ノードの場合の子要素 (各 Wave に属する pipeline)。pipeline ノードでは未使用。 */
  children?: PipelineItem[];
  /**
   * ライブ状態を持たない静的エントリ (Wave 1 sources / Wave 4 derived)。
   * 状態アイコンを中立表示にし、description はデフォルトで `—`。
   */
  staticEntry?: boolean;
}

const PIPELINE_ICON: Record<PipelineState, string> = {
  pending: 'circle-large-outline',
  running: 'sync~spin',
  success: 'check',
  partial: 'warning',
  error: 'error',
  skipped: 'dash',
};

/** ライブ状態を持たない静的エントリ (Wave 1/4) の中立アイコンと description。 */
const STATIC_ENTRY_ICON = 'circle-outline';
const STATIC_ENTRY_DESCRIPTION = '—';

/**
 * 折りたたみ可能な Wave グループ (親ノード) のラベル。LEP の tier (Wave) モデルに対応する:
 * - `Wave 1 · sources`: ingester 群 (tier=1)。ライブ状態は持たず名称のみ静的表示
 * - `Wave 2 · primary`: trail.db 世代バックアップ + importAll 8 phases (tier=2, 旧 importAll 相当)
 * - `Wave 3 · memory` : memory backup + memory-core pipelines (tier=3)
 * - `Wave 4 · derived`: aggregator 群 (tier=4)。ライブ状態は持たず名称のみ静的表示
 *
 * trail.db / memory-core.db の世代バックアップは、それぞれを書き込む Wave (2 / 3) の
 * 先頭に置く (書き込み直前の世代を論理的に対応させる)。
 * Wave 1 / Wave 4 は本パネルが読む status ファイルに状態を書かないため、
 * 構造を示す目的で名称のみを静的エントリ (state `—`) として並べる。
 */
export const WAVE1_GROUP_LABEL = 'Wave 1 · sources';
export const WAVE2_GROUP_LABEL = 'Wave 2 · primary';
export const WAVE3_GROUP_LABEL = 'Wave 3 · memory';
export const WAVE4_GROUP_LABEL = 'Wave 4 · derived';

/** Wave 1 (sources) の ingester。LEP 登録順に並べる。 */
export const WAVE1_SOURCE_IDS: readonly string[] = [
  'JsonlIngester',
  'GitIngester',
  'CoverageIngester',
  'GitHubPrReviewIngester',
  'MetaJsonIngester',
];

/** Wave 4 (derived) の aggregator。 */
export const WAVE4_DERIVED_IDS: readonly string[] = [
  'DoraMetricsAggregator',
  'CrossSourceCorrelator',
];

export class PipelineItem extends vscode.TreeItem {
  /** group ノードの子要素 (pipeline ノードでは undefined)。 */
  readonly children?: PipelineItem[];

  constructor(
    public readonly kind: PipelineItemKind,
    label: string,
    options: PipelineItemOptions = {},
  ) {
    super(
      label,
      kind === 'group'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    if (kind === 'group') {
      this.children = options.children ?? [];
      this.contextValue = 'trailPipelineGroup';
      // 2 秒ポーリングで refresh されても折りたたみ状態を保持するため安定 id を付与する。
      this.id = `group:${label}`;
    } else if (options.staticEntry) {
      this.iconPath = new vscode.ThemeIcon(STATIC_ENTRY_ICON);
      this.description = options.description ?? STATIC_ENTRY_DESCRIPTION;
      this.contextValue = 'trailPipelineStatic';
    } else {
      this.iconPath = new vscode.ThemeIcon(PIPELINE_ICON[options.state ?? 'pending']);
      this.description = options.description;
      this.contextValue = 'trailPipeline';
    }
  }
}

/**
 * importAll 内部の job (phase) 表示順。Pipeline panel で必ずこの順で並ぶ。
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

/** importAll の 1 phase の追跡状態 (PipelineProvider 内のメモリに保持) */
interface ImportAllPhaseState {
  state: PipelineState;
  startedAt?: string;
  finishedAt?: string;
  count?: number;
  message?: string;
}

interface BackupDisplay {
  scope: string;
  state: PipelineState;
  description: string;
}

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------

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

/**
 * バックアップ世代ファイル (.bak.1.gz) の存在から表示用エントリを組み立てる。
 */
export function buildBackupDisplay(dbFilePath: string): BackupDisplay {
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

/**
 * importAll の単一 phase から表示用エントリを組み立てる。
 */
export function buildImportAllPhaseDisplay(
  phase: ImportAllPhase,
  state: ImportAllPhaseState | null,
  now: number = Date.now(),
): BackupDisplay {
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

// ---------------------------------------------------------------------------
//  PipelineProvider
// ---------------------------------------------------------------------------

export interface PipelineProviderOptions {
  /** memory-core が書き込む pipeline-status.json の絶対パス */
  statusFilePath?: string;
  /**
   * trail.db の絶対パス。指定時、先頭に backup ジョブを表示し
   * `${dbFilePath}.bak.1.gz` の存在/mtime/サイズから状態を導出する。
   */
  dbFilePath?: string;
  /**
   * memory-core.db の絶対パス。指定時、importAll phases と memory-core
   * pipelines の間に「memory backup」ジョブを表示し、
   * `${memoryDbFilePath}.bak.1.gz` の存在/mtime/サイズから状態を導出する。
   */
  memoryDbFilePath?: string;
  /**
   * importall-phase-status.json の絶対パス。指定時、デーモンが書き込む
   * importAll 各 phase の状態をポーリングして反映する。
   */
  importAllStatusFilePath?: string;
}

/**
 * Pipelines パネル (anytimeTrail.pipelines view) の TreeDataProvider。
 * 各パイプラインがどの Wave で動作するかが分かるよう、折りたたみ可能な
 * Wave グループ (親ノード) の下に pipeline (子ノード) を並べる 2 階層ツリー:
 *
 *   Wave 1 · sources  ← ingester 群 (静的表示)
 *   Wave 2 · primary  ← trail.db backup + importAll 8 phases
 *   Wave 3 · memory   ← memory backup + memory-core pipelines
 *   Wave 4 · derived  ← aggregator 群 (静的表示)
 *
 * importAll の per-phase 状態は in-process (setImportAllPhase) と
 * daemon mode (importall-phase-status.json polling) の両経路で受け取る。
 */
export class PipelineProvider
  implements vscode.TreeDataProvider<PipelineItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _statusFileTimer: ReturnType<typeof setInterval> | undefined;
  private _lastStatusFileMtime = 0;
  private _lastImportAllStatusFileMtime = 0;
  private _lastImportAllRunId: string | null = null;
  private readonly _statusFilePath: string | undefined;
  private readonly _dbFilePath: string | undefined;
  private readonly _memoryDbFilePath: string | undefined;
  private readonly _importAllStatusFilePath: string | undefined;
  private readonly _importAllPhases = new Map<ImportAllPhase, ImportAllPhaseState>();

  constructor(options: PipelineProviderOptions = {}) {
    this._statusFilePath = options.statusFilePath;
    this._dbFilePath = options.dbFilePath;
    this._memoryDbFilePath = options.memoryDbFilePath;
    this._importAllStatusFilePath = options.importAllStatusFilePath;
    if (this._statusFilePath || this._importAllStatusFilePath) {
      this._startStatusFilePolling();
    }
  }

  private _startStatusFilePolling(): void {
    this._statusFileTimer = setInterval(() => {
      this._checkStatusFile();
    }, POLL_STATUS_FILE_MS);
  }

  private _checkStatusFile(): void {
    try {
      let mtimeChanged = false;
      if (this._statusFilePath && fs.existsSync(this._statusFilePath)) {
        const stat = fs.statSync(this._statusFilePath);
        const mtime = stat.mtimeMs;
        if (mtime !== this._lastStatusFileMtime) {
          this._lastStatusFileMtime = mtime;
          mtimeChanged = true;
        }
      }

      // importAll phase status file (デーモンが書き込む) を polling して反映する。
      let importAllChanged = false;
      if (this._importAllStatusFilePath && fs.existsSync(this._importAllStatusFilePath)) {
        const stat = fs.statSync(this._importAllStatusFilePath);
        const mtime = stat.mtimeMs;
        if (mtime !== this._lastImportAllStatusFileMtime) {
          this._lastImportAllStatusFileMtime = mtime;
          importAllChanged = this._loadImportAllPhasesFromFile();
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

      if (mtimeChanged || importAllChanged || hasRunningPipeline || importAllPhaseRunning) {
        this._onDidChangeTreeData.fire();
      }
    } catch {
      // ignore
    }
  }

  /**
   * importall-phase-status.json を読み込み _importAllPhases にマージする。
   * run_id が前回と異なる場合は phase Map を一度クリアして上書きする
   * (新しいジョブ実行の開始)。
   */
  private _loadImportAllPhasesFromFile(): boolean {
    if (!this._importAllStatusFilePath) return false;
    const file = readImportAllPhaseStatus(this._importAllStatusFilePath);
    if (!file) return false;
    if (file.run_id !== this._lastImportAllRunId) {
      this._importAllPhases.clear();
      this._lastImportAllRunId = file.run_id;
    }
    for (const [phase, entry] of Object.entries(file.phases)) {
      if (!entry) continue;
      this._importAllPhases.set(phase as ImportAllPhase, {
        state: entry.state,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        count: entry.count,
        message: entry.message,
      });
    }
    return true;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PipelineItem): vscode.TreeItem {
    return element;
  }

  /**
   * 親 (`element` なし) では Wave グループを、子 (`element` = group) では
   * 当該 Wave 配下の pipeline を返す 2 階層ツリー。
   */
  async getChildren(element?: PipelineItem): Promise<PipelineItem[]> {
    if (element) {
      return element.children ? [...element.children] : [];
    }
    return this._buildGroups();
  }

  /** トップレベルの Wave グループ (折りたたみ親ノード) を組み立てる。 */
  private _buildGroups(): PipelineItem[] {
    const groups: PipelineItem[] = [];

    // Wave 1 · sources — ingester 群 (dbFilePath 指定時のみ)。専用ステータスを
    // 持たないため名称のみの静的エントリとして並べ、Wave 構造を可視化する。
    if (this._dbFilePath) {
      const sourceItems = WAVE1_SOURCE_IDS.map(
        (id) => new PipelineItem('pipeline', id, { staticEntry: true }),
      );
      groups.push(new PipelineItem('group', WAVE1_GROUP_LABEL, { children: sourceItems }));
    }

    // Wave 2 · primary — trail.db 世代バックアップ + importAll 8 phases (dbFilePath 指定時のみ)。
    // trail.db を書き込むのは Wave 2 (PersistAnalyzer.save) なので、その直前の世代
    // バックアップを Wave 2 の先頭に置く (Wave 3 の memory backup と対称)。
    if (this._dbFilePath) {
      const backup = buildBackupDisplay(this._dbFilePath);
      const wave2: PipelineItem[] = [
        new PipelineItem('pipeline', 'trail.db backup', {
          state: backup.state,
          description: backup.description,
        }),
      ];
      for (const phase of IMPORT_ALL_PHASE_ORDER) {
        const display = buildImportAllPhaseDisplay(phase, this._importAllPhases.get(phase) ?? null);
        wave2.push(
          new PipelineItem('pipeline', display.scope, {
            state: display.state,
            description: display.description,
          }),
        );
      }
      groups.push(new PipelineItem('group', WAVE2_GROUP_LABEL, { children: wave2 }));
    }

    // Wave 3 · memory — memory backup + memory-core pipelines。
    // memory backup を Wave 3 の先頭に置くことで、memory-core pipelines が
    // memory-core.db を書き換える直前の世代バックアップが論理的に対応する。
    const wave3: PipelineItem[] = [];
    if (this._memoryDbFilePath) {
      const memBackup = buildBackupDisplay(this._memoryDbFilePath);
      wave3.push(
        new PipelineItem('pipeline', 'memory backup', {
          state: memBackup.state,
          description: memBackup.description,
        }),
      );
    }
    const pipelineStatus = readPipelineStatus(this._statusFilePath);
    for (const p of pipelineStatus?.pipelines ?? []) {
      wave3.push(
        new PipelineItem('pipeline', p.scope, {
          state: p.state,
          description: formatPipelineDescription(p),
        }),
      );
    }
    if (wave3.length > 0) {
      groups.push(new PipelineItem('group', WAVE3_GROUP_LABEL, { children: wave3 }));
    }

    // Wave 4 · derived — aggregator 群 (dbFilePath 指定時のみ)。Wave 1 同様に
    // 専用ステータスを持たないため名称のみの静的エントリとして並べる。
    if (this._dbFilePath) {
      const derivedItems = WAVE4_DERIVED_IDS.map(
        (id) => new PipelineItem('pipeline', id, { staticEntry: true }),
      );
      groups.push(new PipelineItem('group', WAVE4_GROUP_LABEL, { children: derivedItems }));
    }

    return groups;
  }

  /**
   * importAll の単一 phase 状態を更新する (in-process 経路用)。
   * action: 'start' | 'finish' | 'skip' | 'error' で state が決まる。
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

  dispose(): void {
    if (this._statusFileTimer !== undefined) {
      clearInterval(this._statusFileTimer);
    }
    this._onDidChangeTreeData.dispose();
  }
}
