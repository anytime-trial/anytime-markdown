/**
 * CaravanBookService が pipelineRunner オプション未指定時に使う、trail-caravan-book
 * 全パイプラインを順次実行する実装。
 *
 * このファイルは sql.js / better-sqlite3 / Ollama などの重い依存をロードする
 * ため、`CaravanBookService` 本体からは遅延 require される。テストは
 * pipelineRunner オプションを差し替えて、このモジュールをまったく触らずに
 * 通せる構造にしてある。
 *
 * Step 3b 以降: scope ごとの実行ロジックは {@link CaravanDbSession} に集約され、
 * このランナーはセッションを open → 7 scope を順次実行 → close する薄い
 * orchestrator になった。LEP の memory analyzer 群と完全に同一の scope ロジックを
 * 共有するため、両経路の出力は一致する。error 時は (legacy 互換の) abort 動作を
 * 保つため、ScopeResult.status==='error' で即 throw する。
 */

import type { ScopeResult } from './CaravanDbSession';
import { openCaravanDbSession } from './openCaravanDbSession';
import type { PipelineRunnerContext } from './types';

export { PIPELINE_SCOPES } from './openCaravanDbSession';

export async function runCaravanBookPipeline(ctx: PipelineRunnerContext): Promise<void> {
  const session = await openCaravanDbSession(ctx);
  if (!session) return; // activity.db 不在 (openCaravanDbSession が error ログ済み)

  const assertOk = (r: ScopeResult): void => {
    if (r.status === 'error') throw new Error(r.error ?? `${r.scope} failed`);
  };

  try {
    // 実行順は drift / embedding の依存に従う:
    // conversation / code / bug / review / spec → drift → embedding。
    assertOk(await session.runConversation());
    assertOk(await session.runCode());
    assertOk(await session.runBugHistory());
    assertOk(await session.runReview());
    assertOk(await session.runSpec());
    assertOk(await session.runDrift());
    assertOk(await session.runEmbeddingBackfill());
  } finally {
    session.close();
  }
}
