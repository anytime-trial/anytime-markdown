import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * review .md / session から finding 抽出 (review incremental)。chat + embedding を使用。
 */
export class ReviewFindingMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'ReviewFindingMemoryAnalyzer';
  override readonly requiresLlm = {
    chat: { provider: 'ollama', model: 'qwen2.5:7b' },
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runReview();
  }
}
