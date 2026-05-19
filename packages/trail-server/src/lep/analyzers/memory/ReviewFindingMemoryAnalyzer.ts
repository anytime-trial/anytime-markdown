import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * review .md / session から finding 抽出 (review incremental)。chat + embedding を使用。
 */
export class ReviewFindingMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'ReviewFindingMemoryAnalyzer';

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runReview();
  }
}
