// 自律受入基盤 S5 (受入台帳): 受入記録・見逃し率のドメイン型。
// DDL は domain/schema/tables.ts の CREATE_ACCEPTANCE_RECORDS が正本。
// S5 時点の書き込み経路は farm（受入ファーム）と人手記録のみ。route の自動振り分けは S3 で始まる。

export type AcceptanceRoute = 'auto' | 'machine' | 'human';

/** not_run はファーム自体の実行失敗（環境要因）。合格でも不合格でもなく人手経路へ戻す（要件書 §9）。 */
export type AcceptanceVerdict = 'pass' | 'fail' | 'pending' | 'not_run';

export type AcceptanceDecidedBy = 'farm' | 'human';

export interface AcceptanceRecord {
  commitSha: string;
  route: AcceptanceRoute;
  repoName: string;
  verdict: AcceptanceVerdict;
  decidedBy: AcceptanceDecidedBy;
  /** UTC ISO 8601。pending の間は null */
  decidedAt: string | null;
  /** farm 実行成果物（レポート・VRT 差分画像）への参照パス */
  farmRunRef: string;
  /** JSON 配列文字列（失敗テストのタイトル） */
  failedTests: string;
  vrtDiff: boolean;
  quarantinedCount: number;
  notes: string;
  /** UTC ISO 8601 */
  createdAt: string;
  /** UTC ISO 8601 */
  updatedAt: string;
}

/** (commitSha, route) キーの冪等 UPSERT 入力。 */
export interface AcceptanceRecordInput {
  commitSha: string;
  route: AcceptanceRoute;
  repoName?: string;
  verdict: AcceptanceVerdict;
  decidedBy: AcceptanceDecidedBy;
  decidedAt?: string | null;
  farmRunRef?: string;
  /** 失敗テストのタイトル配列（DB には JSON 文字列で格納） */
  failedTests?: string[];
  vrtDiff?: boolean;
  quarantinedCount?: number;
  notes?: string;
}

export interface AcceptanceRecordFilter {
  commitSha?: string;
  route?: AcceptanceRoute;
  /** decided_at >= since (UTC ISO 8601) */
  since?: string;
  /** decided_at <= until (UTC ISO 8601) */
  until?: string;
  limit?: number;
}

/**
 * 経路別見逃し率（近似指標）。
 * 「受入合格したコミットの変更ファイルと同じファイルに、合格後 windowDays 日以内の
 * fix 系コミットが触れた」件数を missed と数える。厳密な因果は問わない（要件書 §5.2）。
 */
export interface AcceptanceMissRate {
  route: AcceptanceRoute;
  acceptedCount: number;
  missedCount: number;
  /** acceptedCount が 0 のときは null（0 除算を率 0 と区別する） */
  missRate: number | null;
  windowDays: number;
}
