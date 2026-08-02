import { z } from 'zod';
import { resolveDbPath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import { listDoctrineJudgmentsBySession } from '../sqlite/doctrineJudgments';
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
  workspacePath: z
    .string()
    .optional()
    .describe('Workspace root to resolve trail.db and run git in (defaults to cwd)'),
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
export async function handleGetAcceptanceReview(
  input: GetAcceptanceReviewInput,
): Promise<AcceptanceReview> {
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = input.workspacePath ?? process.env['TRAIL_WORKSPACE_PATH'] ?? process.cwd();
  const dbPath = resolveDbPath({ workspacePath });
  const baseRef = input.base_ref ?? DEFAULT_BASE_REF;
  const headRef = input.head_ref ?? DEFAULT_HEAD_REF;

  // 提示のためだけに本番 DB のスキーマを変えない。readonly で開き、テーブル・
  // 後付け列の不在は listDoctrineJudgmentsBySession 側で縮退させる
  const opened = await openTrailDb(dbPath, 'readonly');
  let judgments;
  try {
    judgments = listDoctrineJudgmentsBySession(opened.db, input.session_id);
  } finally {
    opened.close();
  }

  const diff =
    input.include_diff === false
      ? skippedDiff(baseRef, headRef)
      : await summarizeGitDiff({ cwd: workspacePath, baseRef, headRef });

  return buildAcceptanceReview({ sessionId: input.session_id, judgments, diff });
}
