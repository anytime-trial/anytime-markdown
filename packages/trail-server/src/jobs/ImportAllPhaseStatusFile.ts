import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImportAllPhase, ImportAllPhaseEvent } from '@anytime-markdown/trail-db';

/**
 * importAll の per-phase 進捗を、デーモンプロセスから VS Code 拡張 UI に
 * 伝えるための JSON ファイル形式。memory-core の pipeline-status.json と
 * 同じ位置 (dbStorageDir) に並べて配置する想定。
 *
 * - 単一プロセスのみが書き手 (AnalyzeAllJob 内の writer)
 * - 読み手は複数可 (OllamaProvider の polling)
 * - 書き込みは atomic (tmp file + rename)
 */
export interface ImportAllPhaseStatusFile {
  /** 書き込み時刻 ISO 8601 UTC */
  readonly updated_at: string;
  /** ジョブ実行 ID (毎回新規) */
  readonly run_id: string;
  /** 各 phase の最新状態 */
  readonly phases: { readonly [phase in ImportAllPhase]?: ImportAllPhaseEntry };
}

export type ImportAllPhaseState =
  | 'pending'
  | 'running'
  | 'success'
  | 'partial'
  | 'error'
  | 'skipped';

export interface ImportAllPhaseEntry {
  readonly state: ImportAllPhaseState;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly count?: number;
  readonly message?: string;
}

/**
 * importAll の onPhase イベントを受け取り、ImportAllPhaseStatusFile に
 * 反映する writer。run_id は構築時に固定 (1 ジョブ = 1 run_id)。
 */
export class ImportAllPhaseStatusWriter {
  private state: {
    updated_at: string;
    run_id: string;
    phases: { [phase in ImportAllPhase]?: ImportAllPhaseEntry };
  };

  constructor(
    private readonly filePath: string,
    runId: string,
  ) {
    this.state = {
      updated_at: new Date().toISOString(),
      run_id: runId,
      phases: {},
    };
  }

  /** 初期状態を fs に flush。ジョブ開始時に呼ぶ。 */
  initialize(): void {
    this.flush();
  }

  /** onPhase イベントを受けて該当 phase を更新する。 */
  applyEvent(event: ImportAllPhaseEvent): void {
    const now = new Date().toISOString();
    const phase = event.phase;
    const previous = this.state.phases[phase];
    if (event.action === 'start') {
      this.state.phases[phase] = { state: 'running', startedAt: now };
    } else if (event.action === 'finish') {
      this.state.phases[phase] = {
        state: 'success',
        startedAt: previous?.startedAt,
        finishedAt: now,
        count: event.count,
      };
    } else if (event.action === 'skip') {
      this.state.phases[phase] = {
        state: 'skipped',
        startedAt: previous?.startedAt,
        finishedAt: now,
        message: event.message,
      };
    } else {
      // error
      this.state.phases[phase] = {
        state: 'error',
        startedAt: previous?.startedAt,
        finishedAt: now,
        message: event.message,
      };
    }
    this.flush();
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

/**
 * ImportAllPhaseStatusFile を読み出す。ファイル不在・パースエラー時は null。
 */
export function readImportAllPhaseStatus(filePath: string): ImportAllPhaseStatusFile | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ImportAllPhaseStatusFile;
  } catch {
    return null;
  }
}
