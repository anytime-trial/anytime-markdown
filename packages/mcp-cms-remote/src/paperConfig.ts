/**
 * 技術論文自動収集の設定ファイル。
 * arXiv API を使用して CS 分野の論文を日次で収集する。
 * 認証不要。
 *
 * 環境変数 PAPER_CRON_ENABLED で cronEnabled を上書き可能。
 */
export const paperConfig = {
  /** arXiv カテゴリ */
  categories: ['cs.AI', 'cs.LG', 'cs.CL', 'cs.SE', 'cs.CR', 'cs.DC'],
  /** 1回の取得件数 */
  fetchCount: 20,
  /** 対象期間（日数） */
  lookbackDays: 7,
  /** arXiv API ベース URL */
  baseUrl: 'https://export.arxiv.org/api/query',
  /** S3 キーのプレフィックス */
  s3Prefix: 'papers/',
  /** Cron 実行の有効/無効（環境変数 PAPER_CRON_ENABLED で上書き可能） */
  cronEnabled: true,
  /** OpenAlex API ベース URL */
  openAlexBaseUrl: 'https://api.openalex.org',
  /** OpenAlex arXiv ソース ID */
  openAlexArxivSourceId: 'S4306400194',
  /** 引用数ランキング S3 プレフィックス */
  rankingS3Prefix: 'paper-rankings/',
  /** 週次ランキングの対象期間（月数） */
  weeklyRankingMonths: 1,
  /** 月次ランキングの対象期間（月数） */
  monthlyRankingMonths: 3,
  /** ランキング取得件数 */
  rankingFetchCount: 20,
} as const;
