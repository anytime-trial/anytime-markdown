import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * NULL embedding の補完 (embedding backfill)。embedding (Ollama) を使用。
 *
 * 他全 analyzer が追加したエンティティ/episode の embedding を生成するため、
 * **Wave 3 の最後**に走る (dependsOn = 全 content + drift)。冪等 (NULL のみ対象)。
 */
export class EmbeddingBackfillAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'EmbeddingBackfillAnalyzer';
  override readonly requiresLlm = {
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;
  override readonly dependsOn: readonly string[] = [
    'ConversationMemoryAnalyzer',
    'CodeMemoryAnalyzer',
    'SpecMemoryAnalyzer',
    'ReviewFindingMemoryAnalyzer',
    'BugHistoryMemoryAnalyzer',
    'DriftMemoryAnalyzer',
  ];

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runEmbeddingBackfill();
  }
}
