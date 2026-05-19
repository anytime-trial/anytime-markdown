import type { MemoryDbSession, ScopeResult } from '@anytime-markdown/memory-core';

import { MemoryAnalyzerBase } from './MemoryAnalyzerBase';

/**
 * git バグ履歴解析 (bug history incremental)。git 解析のみで **LLM 非依存**。
 * 会話 fact を読まない完全独立な analyzer。
 */
export class BugHistoryMemoryAnalyzer extends MemoryAnalyzerBase {
  readonly id = 'BugHistoryMemoryAnalyzer';

  protected runScope(session: MemoryDbSession): Promise<ScopeResult> {
    return session.runBugHistory();
  }
}
