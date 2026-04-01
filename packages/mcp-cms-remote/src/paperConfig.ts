/**
 * 技術論文引用ランキング収集の設定ファイル。
 * OpenAlex API を使用して arXiv 論文の引用数ランキングを月次で収集する。
 * 認証不要。
 *
 * 環境変数 PAPER_CRON_ENABLED で cronEnabled を上書き可能。
 */
export const paperConfig = {
  /** Cron 実行の有効/無効（環境変数 PAPER_CRON_ENABLED で上書き可能） */
  cronEnabled: true,
  /** OpenAlex API ベース URL */
  openAlexBaseUrl: 'https://api.openalex.org',
  /** OpenAlex arXiv ソース ID */
  openAlexArxivSourceId: 'S4306400194',
  /** 引用数ランキング S3 プレフィックス */
  rankingS3Prefix: 'paper-rankings/',
  /** 月次ランキングの対象期間（月数） */
  monthlyRankingMonths: 3,
  /** ランキング取得件数 */
  rankingFetchCount: 50,
} as const;
