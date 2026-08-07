import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveMemoryDbPath, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb, openTrailDb } from '../sqlite/openDb';
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

/**
 * D2 監視指標の読み出し。**読み取り専用**で開き、ensure・遅延移行を起動しない
 * （監視のつもりの呼び出しが本番 DB のテーブルを DROP しない — getAcceptanceReview と同方針。
 * 移行の起点は書込 3 ツールに限定する）。
 *
 * 保存先は memory-core.db（2026-08-07 移設）。移行過渡期に trail.db 側へ旧レコードが
 * 残っている間は両方を読み、(session_id, subject) の memory 優先で重複排除して集計する
 * （片側だけを読むと部分データで agreementRate が誤発火し、D2 → D1 の差し戻し判断を狂わせる）。
 */
export async function handleGetDoctrineAgreement(
  input: GetDoctrineAgreementInput,
): Promise<DoctrineAgreementMetrics> {
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const range = {
    ...(input.since === undefined ? {} : { since: input.since }),
    ...(input.until === undefined ? {} : { until: input.until }),
  };

  let memoryRows: DoctrineAgreementRow[] = [];
  try {
    const memoryDbPath = resolveMemoryDbPath({ workspacePath });
    const openedMemory = await openMemoryDb(memoryDbPath, 'readonly');
    try {
      memoryRows = fetchDoctrineAgreementRows(openedMemory.db, range);
    } finally {
      openedMemory.close();
    }
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] get_doctrine_agreement: memory-core.db read failed (falling back to trail.db only)`,
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
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] get_doctrine_agreement: trail.db read failed (using memory-core.db rows only)`,
      err instanceof Error ? err.stack : err,
    );
  }

  return aggregateDoctrineAgreement(mergeDoctrineAgreementRows(memoryRows, trailRows));
}
