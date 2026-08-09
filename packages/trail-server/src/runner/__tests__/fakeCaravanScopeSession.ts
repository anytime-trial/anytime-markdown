import { join } from 'node:path';

import { CaravanBookService } from '@anytime-markdown/trail-caravan-book/pipeline';
import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

/**
 * テスト用 fake trail-caravan-book scope session ヘルパ (LEP Step 3d 以降)。
 *
 * legacy `CaravanBookLegacyAnalyzer` 削除後、Layer 3 は `CaravanBookService.openScopeSession()`
 * が返す {@link CaravanDbSession} の scope メソッドを呼ぶ。テストは実 DB を開かずに、
 * openScopeSession を fake に差し替えて scope 呼び出しを検証する。
 */

export interface FakeScopeSession {
  /** 呼ばれた scope 名 (実行順)。 */
  calls: string[];
  /** close() が呼ばれた回数。 */
  closed: number;
  session: CaravanDbSession;
}

export interface FakeScopeSessionOptions {
  /** このメソッド名 (例 'runReview') で error ScopeResult を返す。 */
  errorOnScope?: keyof CaravanDbSession;
  errorMessage?: string;
  /** scope 実行時に push する共有 order 配列 (save 順序検証用)。 */
  order?: string[];
  /** order に push するラベル (既定 'trail-caravan-book')。最初の scope 実行時に 1 度だけ push。 */
  orderLabel?: string;
}

function ok(scope: string): ScopeResult {
  return { scope, status: 'ok', itemsProcessed: 0, itemsFailed: 0 };
}

export function makeFakeScopeSession(opts: FakeScopeSessionOptions = {}): FakeScopeSession {
  const state: FakeScopeSession = { calls: [], closed: 0, session: null as unknown as CaravanDbSession };
  let orderPushed = false;
  const run = (name: string, scope: string): (() => Promise<ScopeResult>) => {
    return async () => {
      state.calls.push(name);
      if (opts.order && !orderPushed) {
        orderPushed = true;
        opts.order.push(opts.orderLabel ?? 'trail-caravan-book');
      }
      if (opts.errorOnScope === name) {
        return { scope, status: 'error', itemsProcessed: 0, itemsFailed: 0, error: opts.errorMessage ?? 'scope boom' };
      }
      return ok(scope);
    };
  };
  state.session = {
    runConversation: run('runConversation', 'conversation_incremental'),
    runCode: run('runCode', 'code_incremental'),
    runBugHistory: run('runBugHistory', 'bug_history_incremental'),
    runReview: run('runReview', 'review_incremental'),
    runSpec: run('runSpec', 'spec_incremental'),
    runDrift: run('runDrift', 'drift_detection'),
    runEmbeddingBackfill: run('runEmbeddingBackfill', 'embedding_backfill'),
    close: () => {
      state.closed += 1;
    },
  } as unknown as CaravanDbSession;
  return state;
}

/** `openScopeSession` を fake session (または null = activity.db 不在) に差し替えた CaravanBookService。 */
export function makeCaravanBookWithSession(
  dir: string,
  session: CaravanDbSession | null,
): CaravanBookService {
  const mc = new CaravanBookService({
    logSink: { appendLine: () => {} },
    trailDbPath: join(dir, 'activity.db'),
    dbPath: join(dir, 'caravan-book.db'),
    statePath: join(dir, 'trail-caravan-book-runner.json'),
    pipelineRunner: async () => undefined,
  });
  (mc as unknown as { openScopeSession: () => Promise<CaravanDbSession | null> }).openScopeSession =
    async () => session;
  return mc;
}
