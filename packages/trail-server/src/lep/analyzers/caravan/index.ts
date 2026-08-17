import type { Analyzer, CaravanBookService } from '@anytime-markdown/trail-caravan-book';

import { BugHistoryCaravanAnalyzer } from './BugHistoryCaravanAnalyzer';
import { CodeCaravanAnalyzer } from './CodeCaravanAnalyzer';
import { ConversationCaravanAnalyzer } from './ConversationCaravanAnalyzer';
import { DriftCaravanAnalyzer } from './DriftCaravanAnalyzer';
import { EmbeddingBackfillAnalyzer } from './EmbeddingBackfillAnalyzer';
import { CaravanWaveSessionProvider, type LlmAvailabilityChecker } from './CaravanWaveSessionProvider';
import { ReviewFindingCaravanAnalyzer } from './ReviewFindingCaravanAnalyzer';
import { SpecCaravanAnalyzer } from './SpecCaravanAnalyzer';

export { CaravanAnalyzerBase } from './CaravanAnalyzerBase';
export { CaravanWaveSessionProvider } from './CaravanWaveSessionProvider';
export type { CaravanDbSessionFactory, LlmAvailabilityChecker } from './CaravanWaveSessionProvider';
export { ConversationCaravanAnalyzer } from './ConversationCaravanAnalyzer';
export { CodeCaravanAnalyzer } from './CodeCaravanAnalyzer';
export { BugHistoryCaravanAnalyzer } from './BugHistoryCaravanAnalyzer';
export { ReviewFindingCaravanAnalyzer } from './ReviewFindingCaravanAnalyzer';
export { SpecCaravanAnalyzer } from './SpecCaravanAnalyzer';
export { DriftCaravanAnalyzer } from './DriftCaravanAnalyzer';
export { EmbeddingBackfillAnalyzer } from './EmbeddingBackfillAnalyzer';

export interface CaravanAnalyzerSet {
  analyzers: Analyzer[];
  provider: CaravanWaveSessionProvider;
}

export interface CreateCaravanAnalyzersOptions {
  /** Wave 3 開始前の LLM Pre-flight チェッカ。省略時 LLM gating なし (全 analyzer 実行)。 */
  checkLlmAvailability?: LlmAvailabilityChecker;
  /** スキップ時ヒント用の Ollama baseUrl。 */
  ollamaBaseUrl?: string;
  /** `lep.json` の `analyzers.<id>.enabled === false` な analyzer id。登録せず Wave 3 で実行しない。 */
  disabledAnalyzerIds?: readonly string[];
  /**
   * Ollama throttle が COOLING かを返すゲート。指定時、`ConversationCaravanAnalyzer` は
   * COOLING 中に会話ループを中断して次 scope へ進む。未指定なら throttle スキップ無効。
   */
  throttleGate?: () => boolean;
}

/**
 * 7 個の memory analyzer を生成して返す。共有 {@link CaravanWaveSessionProvider} を内部に持ち、
 * 全 analyzer が同じ trail-caravan-book セッションを使う。返り値の `provider` は Wave 3 完了後の
 * `endRun()` 用に `AnalyzeAllRunner` へ渡す。
 *
 * 並び順は dependsOn を満たす (Drift は content の後、Embedding は最後)。
 * `disabledAnalyzerIds` に含まれる analyzer は登録しない (lep.json の `analyzers.<id>.enabled:false`)。
 */
export function createCaravanAnalyzers(
  caravanBookService: CaravanBookService,
  opts: CreateCaravanAnalyzersOptions = {},
): CaravanAnalyzerSet {
  const provider = new CaravanWaveSessionProvider(
    () => caravanBookService.openScopeSession(),
    opts.checkLlmAvailability,
    opts.ollamaBaseUrl,
    opts.throttleGate,
  );
  const disabled = new Set(opts.disabledAnalyzerIds ?? []);
  const analyzers: Analyzer[] = [
    new ConversationCaravanAnalyzer(provider),
    new CodeCaravanAnalyzer(provider),
    new BugHistoryCaravanAnalyzer(provider),
    new ReviewFindingCaravanAnalyzer(provider),
    new SpecCaravanAnalyzer(provider),
    new DriftCaravanAnalyzer(provider),
    new EmbeddingBackfillAnalyzer(provider),
  ].filter((a) => !disabled.has(a.id));
  return { analyzers, provider };
}
