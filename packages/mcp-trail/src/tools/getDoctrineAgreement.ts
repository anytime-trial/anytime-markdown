import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveCaravanDbPath, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb, openTrailDb } from '../sqlite/openDb';
import {
  aggregateDoctrineAgreement,
  fetchDoctrineAgreementRows,
  mergeDoctrineAgreementRows,
  type DoctrineAgreementMetrics,
  type DoctrineAgreementRow,
} from '../sqlite/doctrineJudgments';

export const GetDoctrineAgreementInputSchema = z.object({
  since: z.string().optional().describe('ISO 8601 lower bound on judged_at (inclusive)'),
  until: z.string().optional().describe('ISO 8601 upper bound on judged_at (inclusive)'),
  workspacePath: workspacePathParam,
});

export type GetDoctrineAgreementInput = z.infer<typeof GetDoctrineAgreementInputSchema>;

export type GetDoctrineAgreementResult = DoctrineAgreementMetrics & {
  /**
   * 読み取りに失敗した DB とその理由。空配列なら両 DB を読めている。
   * fail-open の縮退（片側 DB の読み失敗 → 残る側だけで集計）は維持するが、縮退した事実を
   * 返り値で運ぶ。stderr ログだけだと、DB 破損時に「全指標 0」が正常値として読まれる
   * 無言故障になる（2026-08-15 実測: caravan-book.db malformed で 74 件が 0 件に見えた）。
   */
  readonly sourceErrors: readonly string[];
};

/**
 * D2 監視指標の読み出し。**読み取り専用**で開き、ensure・遅延移行を起動しない
 * （監視のつもりの呼び出しが本番 DB のテーブルを DROP しない — getAcceptanceReview と同方針。
 * 移行の起点は書込 3 ツールに限定する）。
 *
 * 保存先は caravan-book.db（2026-08-07 移設）。移行過渡期に activity.db 側へ旧レコードが
 * 残っている間は両方を読み、(session_id, subject) の memory 優先で重複排除して集計する
 * （片側だけを読むと部分データで agreementRate が誤発火し、D2 → D1 の差し戻し判断を狂わせる）。
 */
export async function handleGetDoctrineAgreement(
  input: GetDoctrineAgreementInput,
): Promise<GetDoctrineAgreementResult> {
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const range = {
    ...(input.since === undefined ? {} : { since: input.since }),
    ...(input.until === undefined ? {} : { until: input.until }),
  };

  const sourceErrors: string[] = [];

  let caravanRows: DoctrineAgreementRow[] = [];
  try {
    const caravanDbPath = resolveCaravanDbPath({ workspacePath });
    const openedCaravan = await openCaravanDb(caravanDbPath, 'readonly');
    try {
      caravanRows = fetchDoctrineAgreementRows(openedCaravan.db, range);
    } finally {
      openedCaravan.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sourceErrors.push(`caravan-book.db read failed (falling back to activity.db only): ${message}`);
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] get_doctrine_agreement: caravan-book.db read failed (falling back to activity.db only)`,
      err instanceof Error ? err.stack : err,
    );
  }

  let trailRows: DoctrineAgreementRow[] = [];
  try {
    const trailDbPath = resolveDbPath({ workspacePath });
    const openedTrail = await openTrailDb(trailDbPath, 'readonly');
    try {
      // fetchDoctrineAgreementRows はテーブル不在で空配列（移行完了後はここが常に空）
      trailRows = fetchDoctrineAgreementRows(openedTrail.db, range);
    } finally {
      openedTrail.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sourceErrors.push(`activity.db read failed (using caravan-book.db rows only): ${message}`);
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] get_doctrine_agreement: activity.db read failed (using caravan-book.db rows only)`,
      err instanceof Error ? err.stack : err,
    );
  }

  return {
    ...aggregateDoctrineAgreement(mergeDoctrineAgreementRows(caravanRows, trailRows)),
    sourceErrors,
  };
}
