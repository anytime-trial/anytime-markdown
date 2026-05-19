import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * 会話履歴から fact 抽出 (conversation backfill/incremental + failed-items retry)。
 * chat + embedding (Ollama) を使用。
 */
export class ConversationMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'ConversationMemoryAnalyzer';

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runConversation();
  }
}
