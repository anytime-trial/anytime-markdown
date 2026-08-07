import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveMemoryDbPath, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb, openTrailDb } from '../sqlite/openDb';
import { listDoctrineJudgmentsBySession, type DoctrineJudgmentView } from '../sqlite/doctrineJudgments';
import { summarizeGitDiff, type GitDiffSummary } from '../doctrine/gitDiffSummary';
import { buildAcceptanceReview, type AcceptanceReview } from '../doctrine/acceptanceReview';

const DEFAULT_BASE_REF = 'develop';
const DEFAULT_HEAD_REF = 'HEAD';

export const GetAcceptanceReviewInputSchema = z.object({
  session_id: z
    .string()
    .min(1)
    .describe('Session ID whose doctrine judgments are presented (same key as record_doctrine_judgment)'),
  base_ref: z
    .string()
    .optional()
    .describe(`Baseline revision for the artifact diff (defaults to ${DEFAULT_BASE_REF})`),
  head_ref: z
    .string()
    .optional()
    .describe(`Target revision for the artifact diff (defaults to ${DEFAULT_HEAD_REF})`),
  include_diff: z
    .boolean()
    .optional()
    .describe('Set false to skip running git (when the diff is presented separately). Defaults to true'),
  workspacePath: workspacePathParam,
});

export type GetAcceptanceReviewInput = z.infer<typeof GetAcceptanceReviewInputSchema>;

function skippedDiff(baseRef: string, headRef: string): GitDiffSummary {
  return {
    available: false,
    baseRef,
    headRef,
    commits: [],
    files: [],
    degradedReason: 'include_diff=false のため git を実行していない',
  };
}

/**
 * 受け入れ確認インターフェース (DCT-13)。判断・接地条項・差分・エスカレーションを
 * 1 回の呼び出しで返す。読み取り専用 (判断の記録・更新は行わない)。
 */
/**
 * セッションの判断記録を読む。正は memory-core.db。memory 側にテーブルが無い
 * （移設前・遅延移行が未実行）場合のみ trail.db へ縮退する。
 */
async function readJudgmentsForSession(
  workspacePath: string,
  sessionId: string,
): Promise<ReadonlyArray<DoctrineJudgmentView>> {
  let memoryDbPath: string | null = null;
  try {
    memoryDbPath = resolveMemoryDbPath({ workspacePath });
  } catch {
    // memory-core.db 未作成（拡張未起動の環境）。trail 側縮退へ
  }
  if (memoryDbPath !== null) {
    const opened = await openMemoryDb(memoryDbPath, 'readonly');
    try {
      const hasTable =
        opened.db
          .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'doctrine_judgments'`)
          .get() !== undefined;
      if (hasTable) {
        return listDoctrineJudgmentsBySession(opened.db, sessionId);
      }
    } finally {
      opened.close();
    }
  }
  const trailDbPath = resolveDbPath({ workspacePath });
  const openedTrail = await openTrailDb(trailDbPath, 'readonly');
  try {
    return listDoctrineJudgmentsBySession(openedTrail.db, sessionId);
  } finally {
    openedTrail.close();
  }
}

export async function handleGetAcceptanceReview(
  input: GetAcceptanceReviewInput,
): Promise<AcceptanceReview> {
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const baseRef = input.base_ref ?? DEFAULT_BASE_REF;
  const headRef = input.head_ref ?? DEFAULT_HEAD_REF;

  // 保存先は memory-core.db（2026-08-07 に trail.db から移設）。提示のためだけに DB を
  // 変えない方針は維持し readonly で開く（移行は書き込み系ツールが担う）。移行前 —
  // memory 側にテーブルがまだ無い間に限り、trail.db 側へ縮退して読む（判断記録が
  // 「移行待ちの間だけ受け入れ確認から消える」のを防ぐ）。
  const judgments = await readJudgmentsForSession(workspacePath, input.session_id);

  const diff =
    input.include_diff === false
      ? skippedDiff(baseRef, headRef)
      : await summarizeGitDiff({ cwd: workspacePath, baseRef, headRef });

  return buildAcceptanceReview({ sessionId: input.session_id, judgments, diff });
}
