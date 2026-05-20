import * as fs from 'node:fs';
import * as path from 'node:path';

export type PipelineState =
  | 'pending'
  | 'running'
  | 'success'
  | 'partial'
  | 'error'
  | 'skipped';

export interface PipelineStatusEntry {
  scope: string;
  state: PipelineState;
  started_at?: string;
  finished_at?: string;
  items_processed?: number;
  items_total?: number;
  items_failed?: number;
  message?: string;
}

export interface PipelineStatusFile {
  updated_at: string;
  run_id: string;
  pipelines: PipelineStatusEntry[];
}

/**
 * Writes pipeline run status to a shared JSON file.
 * sql.js は in-memory のため pipeline_runs テーブルは memDb.save() まで disk
 * に反映されない。realtime な UI 表示用に、本クラスが fs に atomic 書き込みする。
 */
export class PipelineStatusWriter {
  private state: PipelineStatusFile;

  constructor(
    private readonly filePath: string,
    runId: string,
    scopes: string[],
  ) {
    this.state = {
      updated_at: new Date().toISOString(),
      run_id: runId,
      pipelines: scopes.map((scope) => ({ scope, state: 'pending' })),
    };
  }

  initialize(): void {
    this.flush();
  }

  /**
   * 全 scope を `skipped` にして flush する。stage が memory wave を含まず Wave 3 が
   * 走らないとき、UI が古い `running`/`pending` を表示し続けないよう runner が呼ぶ。
   */
  markAllSkipped(message?: string): void {
    const finishedAt = new Date().toISOString();
    for (const entry of this.state.pipelines) {
      entry.state = 'skipped';
      entry.finished_at = finishedAt;
      if (message !== undefined) entry.message = message;
    }
    this.flush();
  }

  start(scope: string, total?: number): void {
    const entry = this.find(scope);
    if (!entry) return;
    entry.state = 'running';
    entry.started_at = new Date().toISOString();
    if (total !== undefined) entry.items_total = total;
    entry.items_processed = 0;
    entry.items_failed = 0;
    this.flush();
  }

  update(scope: string, processed: number, failed: number): void {
    const entry = this.find(scope);
    if (!entry) return;
    entry.items_processed = processed;
    entry.items_failed = failed;
    this.flush();
  }

  finish(
    scope: string,
    state: PipelineState,
    processed: number,
    failed: number,
    message?: string,
  ): void {
    const entry = this.find(scope);
    if (!entry) return;
    entry.state = state;
    entry.finished_at = new Date().toISOString();
    entry.items_processed = processed;
    entry.items_failed = failed;
    if (message !== undefined) entry.message = message;
    this.flush();
  }

  private find(scope: string): PipelineStatusEntry | undefined {
    return this.state.pipelines.find((p) => p.scope === scope);
  }

  private flush(): void {
    this.state.updated_at = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }
}
