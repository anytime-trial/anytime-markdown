import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * review .md / session から finding 抽出 (review incremental)。chat + embedding を使用。
 */
export class ReviewFindingCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'ReviewFindingCaravanAnalyzer';
  override readonly requiresLlm = {
    chat: { provider: 'ollama', model: 'qwen2.5:7b' },
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runReview();
  }
}
