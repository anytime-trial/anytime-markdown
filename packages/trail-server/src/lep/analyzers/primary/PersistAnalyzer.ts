import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

export interface PersistAnalyzerOptions {
  readonly trailDb: TrailDatabase;
}

/**
 * Layer 2 の最終 analyzer: Wave 2 (primary) の末端で `TrailDatabase.save()` を呼び、
 * sql.js の in-memory DB をディスクへ永続化する。
 *
 * **重要**: memory-core (Wave 3) は trail.db を **ディスクパスから read-only attach** する
 * (`defaultMemoryCorePipelineRunner.ts`)。そのため Wave 2 内 (wave_complete:primary が
 * memory-core を起動する前) に save() を完了させる必要がある。旧 `importAll()` 末尾の
 * save() がこのタイミングを担っていたのを引き継ぐ。
 *
 * tier=2 の **最後** に登録することで、他の全 Layer 2 analyzer の DB 書き込み後に save() が走る。
 * save() が失敗した場合は throw し、LepOrchestrator が `Persist` エラーとして収集する。
 */
export class PersistAnalyzer implements Analyzer {
  readonly id = 'Persist';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  constructor(private readonly opts: PersistAnalyzerOptions) {}

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    this.opts.trailDb.save();
    ctx.logger.info('[Persist] trail.db saved');
  }
}
