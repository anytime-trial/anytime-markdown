import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * コードエンティティ抽出 (code incremental) + reconciliation。
 *
 * ts.Program 静的解析のみで **LLM 非依存** (Ollama 不在でも実行可能)。
 * incremental が返す `current_entity_ids` を reconciliation に in-memory 受け渡しするため
 * 1 analyzer に統合 (分離すると全エンティティ誤 soft-delete)。
 */
export class CodeMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'CodeMemoryAnalyzer';

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runCode();
  }
}
