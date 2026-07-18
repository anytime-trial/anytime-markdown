// 自律受入基盤 S5 (受入台帳): acceptance_records 永続化のポート。
// 実装は trail-db の TrailDatabase（副作用: trail.db への書き込み）。

import type {
  AcceptanceMissRate,
  AcceptanceRecord,
  AcceptanceRecordFilter,
  AcceptanceRecordInput,
} from '../model/acceptance';

export interface IAcceptanceRepository {
  /**
   * 受入記録の UPSERT（trail.db へ書き込む副作用を持つ）。
   * (commit_sha, route) をキーに冪等: farm の再実行・多重記録を吸収する。
   */
  upsertAcceptanceRecord(input: AcceptanceRecordInput): void;
  listAcceptanceRecords(filter?: AcceptanceRecordFilter): AcceptanceRecord[];
  /**
   * 経路別見逃し率の算出（読み取りのみ）。
   * 合格レコードの変更ファイル（commit_files）と、合格後 windowDays 日以内の
   * fix 系コミット（session_commits.commit_message が 'fix' 始まり）の変更ファイルを突合する近似指標。
   */
  computeAcceptanceMissRate(windowDays?: number): AcceptanceMissRate[];
}
