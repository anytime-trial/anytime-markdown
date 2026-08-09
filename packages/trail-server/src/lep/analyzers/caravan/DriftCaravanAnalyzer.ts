import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * 多源ドリフト検出 (drift detection)。純 SQL で **LLM 非依存**。
 *
 * `caravan_edges` (conv/spec/code が投入) と review/bug クラスタ結果を読むため、
 * **全 content analyzer の後**に走る必要がある (dependsOn 参照)。
 */
export class DriftCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'DriftCaravanAnalyzer';
  override readonly dependsOn: readonly string[] = [
    'ConversationCaravanAnalyzer',
    'CodeCaravanAnalyzer',
    'SpecCaravanAnalyzer',
    'ReviewFindingCaravanAnalyzer',
    'BugHistoryCaravanAnalyzer',
  ];

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runDrift();
  }
}
