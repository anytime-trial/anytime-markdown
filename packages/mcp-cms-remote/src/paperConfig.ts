/**
 * 技術論文引用ランキング収集の設定ファイル。
 * OpenAlex API を使用して arXiv 論文の引用数ランキングを月次で収集する。
 * 認証不要。
 */
export const paperConfig = {
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
  /** 記事作成済みリストのファイル名 */
  writtenFileName: 'written.tsv',
} as const;
