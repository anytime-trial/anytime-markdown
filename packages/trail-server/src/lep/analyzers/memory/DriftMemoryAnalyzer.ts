import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * 多源ドリフト検出 (drift detection)。純 SQL で **LLM 非依存**。
 *
 * `memory_edges` (conv/spec/code が投入) と review/bug クラスタ結果を読むため、
 * **全 content analyzer の後**に走る必要がある (dependsOn 参照)。
 */
export class DriftMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'DriftMemoryAnalyzer';
  override readonly dependsOn: readonly string[] = [
    'ConversationMemoryAnalyzer',
    'CodeMemoryAnalyzer',
    'SpecMemoryAnalyzer',
    'ReviewFindingMemoryAnalyzer',
    'BugHistoryMemoryAnalyzer',
  ];

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runDrift();
  }
}
