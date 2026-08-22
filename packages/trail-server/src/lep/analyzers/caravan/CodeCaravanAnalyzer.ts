import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * コードエンティティ抽出 (code incremental) + reconciliation。
 *
 * ts.Program 静的解析のみで **LLM 非依存** (Ollama 不在でも実行可能)。
 * incremental が返す `current_entity_ids` を reconciliation に in-memory 受け渡しするため
 * 1 analyzer に統合 (分離すると全エンティティ誤 soft-delete)。
 */
export class CodeCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'CodeCaravanAnalyzer';
  readonly scopes = ['code_incremental', 'code_reconciliation'] as const;

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runCode();
  }
}
