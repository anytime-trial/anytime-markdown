import { BetterSqlite3CaravanDb } from '../../db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../db/migrations/runner';
import { EventBus } from '../EventBus';
import { LepOrchestrator, type PipelineRunLedgerFactory } from '../LepOrchestrator';
import { PipelineRunLedger } from '../../pipeline/PipelineRunLedger';
import type { Analyzer } from '../types';

function makeAnalyzer(id: string, tier: 1 | 2 | 3 | 4, onRunEnd?: () => Promise<void>): Analyzer {
  return { id, tier, subscribes: [], ...(onRunEnd ? { onRunEnd } : {}) };
}

function readRuns(db: BetterSqlite3CaravanDb): Array<Record<string, unknown>> {
  const result = db.exec(
    `SELECT scope, wave, tier, status, error_detail FROM caravan_pipeline_runs ORDER BY scope`,
  );
  const first = result[0];
  if (!first) return [];
  return first.values.map((row) =>
    Object.fromEntries(first.columns.map((c, i) => [c, row[i]])),
  );
}

describe('LepOrchestrator 台帳連携', () => {
  let db: BetterSqlite3CaravanDb;
  let openLedger: PipelineRunLedgerFactory;

  beforeEach(() => {
    db = BetterSqlite3CaravanDb.openInCaravan();
    db.run('PRAGMA foreign_keys = ON');
    runMigrations(db);
    openLedger = (scope, wave, tier) =>
      new PipelineRunLedger({ db, scope, wave, tier });
  });

  afterEach(() => {
    db.close();
  });

  it('Wave 1/2/4 の analyzer が caravan_pipeline_runs へ記録される', async () => {
    const bus = new EventBus();
    const analyzers = [
      makeAnalyzer('GitIngester', 1, async () => {}),
      makeAnalyzer('SessionImporter', 2, async () => {}),
      makeAnalyzer('DoraMetricsAggregator', 4, async () => {}),
    ];
    for (const a of analyzers) bus.subscribe(a);

    const orchestrator = new LepOrchestrator(bus, analyzers, undefined, openLedger);
    await orchestrator.runOnce({ runId: 'r1', reason: 'manual' });

    const runs = readRuns(db);
    expect(runs).toEqual([
      { scope: 'DoraMetricsAggregator', wave: 'derived', tier: 4, status: 'success', error_detail: '' },
      { scope: 'GitIngester', wave: 'sources', tier: 1, status: 'success', error_detail: '' },
      { scope: 'SessionImporter', wave: 'primary', tier: 2, status: 'success', error_detail: '' },
    ]);
  });

  it('tier 3 は二重計上を避けるため orchestrator 側では記録しない', async () => {
    // Wave 3 の analyzer は trail-caravan-book の run*Incremental が自分で run 行を書く。
    const bus = new EventBus();
    const analyzers = [makeAnalyzer('ConversationCaravanAnalyzer', 3, async () => {})];
    for (const a of analyzers) bus.subscribe(a);

    const orchestrator = new LepOrchestrator(bus, analyzers, undefined, openLedger);
    await orchestrator.runOnce({ runId: 'r2', reason: 'manual' });

    expect(readRuns(db)).toEqual([]);
  });

  it('analyzer が throw したら error として stack を残し run は継続する', async () => {
    const bus = new EventBus();
    const analyzers = [
      makeAnalyzer('Boom', 2, async () => {
        throw new Error('analyzer exploded');
      }),
      makeAnalyzer('Fine', 2, async () => {}),
    ];
    for (const a of analyzers) bus.subscribe(a);

    const orchestrator = new LepOrchestrator(bus, analyzers, undefined, openLedger);
    const result = await orchestrator.runOnce({ runId: 'r3', reason: 'manual' });

    expect(result.errors.get('Boom')?.message).toBe('analyzer exploded');
    const runs = readRuns(db);
    const boom = runs.find((r) => r['scope'] === 'Boom');
    const fine = runs.find((r) => r['scope'] === 'Fine');
    expect(boom?.['status']).toBe('error');
    expect(String(boom?.['error_detail'])).toContain('analyzer exploded');
    expect(fine?.['status']).toBe('success');
  });

  it('ファクトリ未指定なら台帳を書かない（既存の呼び出し元との後方互換）', async () => {
    const bus = new EventBus();
    const analyzers = [makeAnalyzer('GitIngester', 1, async () => {})];
    for (const a of analyzers) bus.subscribe(a);

    const orchestrator = new LepOrchestrator(bus, analyzers);
    await orchestrator.runOnce({ runId: 'r4', reason: 'manual' });

    expect(readRuns(db)).toEqual([]);
  });
});
