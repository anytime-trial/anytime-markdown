import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * git バグ履歴解析 (bug history incremental)。git 解析のみで **LLM 非依存**。
 * 会話 fact を読まない完全独立な analyzer。
 */
export class BugHistoryCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'BugHistoryCaravanAnalyzer';
  readonly scopes = ['bug_history_incremental'] as const;

  protected runScope(session: CaravanDbSession): Promise<ScopeResult> {
    return session.runBugHistory();
  }
}
