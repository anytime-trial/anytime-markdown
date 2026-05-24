import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * 会話履歴から fact 抽出 (conversation backfill/incremental + failed-items retry)。
 * chat + embedding (Ollama) を使用。
 */
export class ConversationMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'ConversationMemoryAnalyzer';
  override readonly requiresLlm = {
    chat: { provider: 'ollama', model: 'qwen2.5-coder:14b' },
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    // throttle gate を会話ループへ伝播。COOLING 中は incremental/backfill を
    // 途中で打ち切り、failed-items retry も skip して次 scope (Code) へ進む。
    return session.runConversation({ shouldStop: this.provider.throttleGate });
  }
}
