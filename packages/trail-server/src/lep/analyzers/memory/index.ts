import type { Analyzer, MemoryCoreService } from '@anytime-markdown/memory-core';

import { BugHistoryMemoryAnalyzer } from './BugHistoryMemoryAnalyzer';
import { CodeMemoryAnalyzer } from './CodeMemoryAnalyzer';
import { ConversationMemoryAnalyzer } from './ConversationMemoryAnalyzer';
import { DriftMemoryAnalyzer } from './DriftMemoryAnalyzer';
import { EmbeddingBackfillAnalyzer } from './EmbeddingBackfillAnalyzer';
import { MemoryWaveSessionProvider, type LlmAvailabilityChecker } from './MemoryWaveSessionProvider';
import { ReviewFindingMemoryAnalyzer } from './ReviewFindingMemoryAnalyzer';
import { SpecMemoryAnalyzer } from './SpecMemoryAnalyzer';

export { MemoryAnalyzerBase } from './MemoryAnalyzerBase';
export { MemoryWaveSessionProvider } from './MemoryWaveSessionProvider';
export type { MemoryDbSessionFactory, LlmAvailabilityChecker } from './MemoryWaveSessionProvider';
export { ConversationMemoryAnalyzer } from './ConversationMemoryAnalyzer';
export { CodeMemoryAnalyzer } from './CodeMemoryAnalyzer';
export { BugHistoryMemoryAnalyzer } from './BugHistoryMemoryAnalyzer';
export { ReviewFindingMemoryAnalyzer } from './ReviewFindingMemoryAnalyzer';
export { SpecMemoryAnalyzer } from './SpecMemoryAnalyzer';
export { DriftMemoryAnalyzer } from './DriftMemoryAnalyzer';
export { EmbeddingBackfillAnalyzer } from './EmbeddingBackfillAnalyzer';

export interface MemoryAnalyzerSet {
  analyzers: Analyzer[];
  provider: MemoryWaveSessionProvider;
}

export interface CreateMemoryAnalyzersOptions {
  /** Wave 3 開始前の LLM Pre-flight チェッカ。省略時 LLM gating なし (全 analyzer 実行)。 */
  checkLlmAvailability?: LlmAvailabilityChecker;
  /** スキップ時ヒント用の Ollama baseUrl。 */
  ollamaBaseUrl?: string;
}

/**
 * 7 個の memory analyzer を生成して返す。共有 {@link MemoryWaveSessionProvider} を内部に持ち、
 * 全 analyzer が同じ memory-core セッションを使う。返り値の `provider` は Wave 3 完了後の
 * `closeIfOpen()` 用に `AnalyzeAllRunner` へ渡す。
 *
 * 並び順は dependsOn を満たす (Drift は content の後、Embedding は最後)。
 */
export function createMemoryAnalyzers(
  memoryCoreService: MemoryCoreService,
  opts: CreateMemoryAnalyzersOptions = {},
): MemoryAnalyzerSet {
  const provider = new MemoryWaveSessionProvider(
    () => memoryCoreService.openScopeSession(),
    opts.checkLlmAvailability,
    opts.ollamaBaseUrl,
  );
  const analyzers: Analyzer[] = [
    new ConversationMemoryAnalyzer(provider),
    new CodeMemoryAnalyzer(provider),
    new BugHistoryMemoryAnalyzer(provider),
    new ReviewFindingMemoryAnalyzer(provider),
    new SpecMemoryAnalyzer(provider),
    new DriftMemoryAnalyzer(provider),
    new EmbeddingBackfillAnalyzer(provider),
  ];
  return { analyzers, provider };
}
