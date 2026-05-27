import { join } from 'node:path';

import { getTrailHome } from '../db/paths';
import { BaseRunner } from '../runner/BaseRunner';
import type { RunReason } from '../runner/types';
import type {
  MemoryCoreServiceOptions,
  PipelineLogger,
  PipelineRunnerContext,
} from './types';

/**
 * memory-core ingest パイプラインをホストする長寿命サービス。
 *
 * BaseRunner を継承し、共通の pause/resume/state/ticks/lastRunAt ロジックは
 * 基底から受け継ぐ。memory-core 固有の処理 (チャンク化・埋め込み・FTS index
 * 再構築 等) を `runImpl(reason)` で実装する。
 *
 * 既存の `createMemoryCoreRunner().runAfterImport()` 本体は `pipelineRunner`
 * オプションに注入される。省略時はパッケージ内デフォルトを使用する。
 */
export class MemoryCoreService extends BaseRunner {
  private readonly serviceOpts: MemoryCoreServiceOptions;

  constructor(opts: MemoryCoreServiceOptions) {
    super({
      logSink: opts.logSink,
      logTag: 'anytime-memory',
      statePath: opts.statePath ?? defaultStatePath(opts.gitRoot),
    });
    this.serviceOpts = opts;
  }

  protected override async runImpl(_reason: RunReason): Promise<void> {
    const ctx = this.buildPipelineContext();
    const runner = this.serviceOpts.pipelineRunner ?? defaultPipelineRunner;
    await runner(ctx);
  }

  /** serviceOpts から 1 run 分の {@link PipelineRunnerContext} を組み立てる。 */
  buildPipelineContext(): PipelineRunnerContext {
    return {
      logger: this.buildPipelineLogger(),
      trailDbPath: this.serviceOpts.trailDbPath,
      dbPath: this.serviceOpts.dbPath,
      nativeBinding: this.serviceOpts.nativeBinding,
      gitRoot: this.serviceOpts.gitRoot,
      backfillDays: this.serviceOpts.backfillDays,
      backupGenerations: this.serviceOpts.backupGenerations,
      backupIntervalDays: this.serviceOpts.backupIntervalDays,
      llm: this.serviceOpts.llm,
      ollamaFactory: this.serviceOpts.ollamaFactory,
    };
  }

  /**
   * LEP Wave 3 用に、scope 単位で実行できる {@link MemoryDbSession} を open する。
   *
   * 7 個の memory analyzer がこの 1 セッションを共有して各 scope メソッドを呼ぶ。
   * trail.db 不在時は `null` を返す。終了時は呼び出し側で `session.close()` する。
   * 重い依存 (agent-core / better-sqlite3) を eager load しないため遅延 require する。
   */
  async openScopeSession(): Promise<import('./MemoryDbSession').MemoryDbSession | null> {
    const ctx = this.buildPipelineContext();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./openMemoryDbSession') as typeof import('./openMemoryDbSession');
    return mod.openMemoryDbSession(ctx);
  }

  private buildPipelineLogger(): PipelineLogger {
    return {
      info: (msg: string) => this.log(`[INFO] ${msg}`),
      error: (msg: string, err?: unknown) => {
        const nonErrorSuffix = err === undefined ? '' : '\n' + String(err);
        const errSuffix = err instanceof Error
          ? '\n' + (err.stack ?? err.message)
          : nonErrorSuffix;
        this.log(`[ERROR] ${msg}${errSuffix}`);
      },
    };
  }
}

/**
 * テスト未注入時のデフォルト実装。memory-core 本体の全パイプラインを順次実行する。
 * 実体は `defaultMemoryCorePipelineRunner.ts` に分離 (循環依存と test 副作用を避けるため)。
 */
async function defaultPipelineRunner(ctx: PipelineRunnerContext): Promise<void> {
  // 遅延 import: テスト時にパイプラインモジュール (sql.js / better-sqlite3 など
  // の重い依存) をロードしないよう、デフォルト経路でのみ require する。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runMemoryCorePipeline } = require('./defaultMemoryCorePipelineRunner') as {
    runMemoryCorePipeline: (ctx: PipelineRunnerContext) => Promise<void>;
  };
  await runMemoryCorePipeline(ctx);
}

export function defaultStatePath(workspaceRoot?: string): string {
  return join(getTrailHome(workspaceRoot), 'memory-core-runner.json');
}

// re-export so callers don't have to dig into state.ts / types.ts
export { defaultState } from './state';
export type { MemoryCoreLogSink, MemoryCoreServiceStatus } from './types';
export type { MemoryCoreServiceOptions };
