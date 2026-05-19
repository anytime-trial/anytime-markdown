import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * spec ドキュメントから claim / entity 抽出 (spec incremental)。chat + embedding を使用。
 */
export class SpecMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'SpecMemoryAnalyzer';
  override readonly requiresLlm = {
    chat: { provider: 'ollama', model: 'qwen2.5:7b' },
    embedding: { provider: 'ollama', model: 'bge-m3' },
  } as const;

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runSpec();
  }
}
