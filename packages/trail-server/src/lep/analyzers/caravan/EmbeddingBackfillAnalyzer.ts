import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * NULL embedding の補完 (embedding backfill)。embedding (Ollama) を使用。
 *
 * 他全 analyzer が追加したエンティティ/episode の embedding を生成するため、
 * **Wave 3 の最後**に走る (dependsOn = 全 content + drift)。冪等 (NULL のみ対象)。
 */
export class EmbeddingBackfillAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'EmbeddingBackfillAnalyzer';
  override readonly requiresLlm = {
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;
  override readonly dependsOn: readonly string[] = [
    'ConversationCaravanAnalyzer',
    'CodeCaravanAnalyzer',
    'SpecCaravanAnalyzer',
    'ReviewFindingCaravanAnalyzer',
    'BugHistoryCaravanAnalyzer',
    'DriftCaravanAnalyzer',
  ];

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runEmbeddingBackfill();
  }
}
