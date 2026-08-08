import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * spec ドキュメントから claim / entity 抽出 (spec incremental)。chat + embedding を使用。
 */
export class SpecCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'SpecCaravanAnalyzer';
  override readonly requiresLlm = {
    chat: { provider: 'ollama', model: 'qwen2.5:7b' },
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runSpec();
  }
}
