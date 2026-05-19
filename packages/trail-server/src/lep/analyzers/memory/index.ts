import type { Analyzer, MemoryCoreService } from '@anytime-markdown/memory-core';

import { BugHistoryMemoryAnalyzer } from './BugHistoryMemoryAnalyzer';
import { CodeMemoryAnalyzer } from './CodeMemoryAnalyzer';
import { ConversationMemoryAnalyzer } from './ConversationMemoryAnalyzer';
import { DriftMemoryAnalyzer } from './DriftMemoryAnalyzer';
import { EmbeddingBackfillAnalyzer } from './EmbeddingBackfillAnalyzer';
import { MemoryWaveSessionProvider } from './MemoryWaveSessionProvider';
import { ReviewFindingMemoryAnalyzer } from './ReviewFindingMemoryAnalyzer';
import { SpecMemoryAnalyzer } from './SpecMemoryAnalyzer';

export { MemoryAnalyzerBase } from './MemoryAnalyzerBase';
export { MemoryWaveSessionProvider } from './MemoryWaveSessionProvider';
export type { MemoryDbSessionFactory } from './MemoryWaveSessionProvider';
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

/**
 * 7 個の memory analyzer を生成して返す。共有 {@link MemoryWaveSessionProvider} を内部に持ち、
 * 全 analyzer が同じ memory-core セッションを使う。返り値の `provider` は Wave 3 完了後の
 * `closeIfOpen()` 用に `AnalyzeAllRunner` へ渡す。
 *
 * 並び順は dependsOn を満たす (Drift は content の後、Embedding は最後)。
 */
export function createMemoryAnalyzers(memoryCoreService: MemoryCoreService): MemoryAnalyzerSet {
  const provider = new MemoryWaveSessionProvider(() => memoryCoreService.openScopeSession());
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
