import type { CaravanDbSession, ScopeResult } from '@anytime-markdown/trail-caravan-book';

import type { LlmProviderAvailability } from '../../LlmAvailability';
import { CaravanAnalyzerBase } from './CaravanAnalyzerBase';

/**
 * review .md / session から finding 抽出 (review incremental)。
 *
 * **LLM をハード要件にしない。** 取込の本体（`### N.` 見出し ＋ 重大度 / カテゴリ / 対象 /
 * 観点の 4 メタ ＋ `問題:` / `提案:` のパース、upsert、addresses リンク）はすべて決定論で、
 * LLM が要るのは「見出しから category を決められなかった指摘の推論」だけである。
 * かつてはこれを chat のハード要件として宣言していたため、Ollama が居ない環境では
 * scope ごと skip され、書式を満たしたレビューが 1 件も取り込まれなかった
 * （2026-08-21 anytime-trade 実測: code-reviewer 実行 127 件に対し caravan_reviews 0 行）。
 *
 * embedding も要件から外す。review 取込は埋め込みを 1 度も生成せず、それは
 * `embedding_backfill` scope の担当である。
 *
 * chat が使えるかは実行時に availability から判定し、使えないときは category 推論だけを
 * 保留する（`category_inferred_by='pending_llm'`）。復旧後の run が埋め直す。
 */
export class ReviewFindingCaravanAnalyzer extends CaravanAnalyzerBase {
  readonly id = 'ReviewFindingCaravanAnalyzer';
  readonly scopes = ['review_incremental'] as const;

  protected runScope(
    session: CaravanDbSession,
    availability: LlmProviderAvailability | null,
  ): Promise<ScopeResult> {
    // availability 未計測 (checker 未配線) は従来動作の「chat あり」として扱う。
    // 計測していないことを「不在」に倒すと、健全な環境で category 推論が黙って止まる。
    return session.runReview({ chatAvailable: availability?.ollama_chat.ok ?? true });
  }
}
