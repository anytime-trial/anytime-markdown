/**
 * 特許情報自動収集の設定ファイル。
 * 非機密の設定値をここで定義する。
 * 機密情報（APIキー、AWS認証情報）は環境変数で管理する。
 *
 * 環境変数 PATENT_CRON_ENABLED で cronEnabled を上書き可能。
 */
export const patentConfig = {
  /** CPC 分類コード */
  cpcCodes: ['G06', 'H04L'],
  /** 1回の取得件数 */
  fetchCount: 20,
  /** 対象期間（日数） */
  lookbackDays: 30,
  /** PatentsView API ベース URL */
  baseUrl: 'https://search.patentsview.org/api/v1',
  /** S3 キーのプレフィックス */
  s3Prefix: 'patents/',
  /** Cron 実行の有効/無効（環境変数 PATENT_CRON_ENABLED で上書き可能） */
  cronEnabled: true,
} as const;
