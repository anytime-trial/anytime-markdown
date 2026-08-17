import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveCaravanDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb } from '../sqlite/openDb';
import {
  ensureAndMigrateDoctrineJudgments,
  recordPointResolutionsDirect,
  type PointResolutionsResult,
} from '../sqlite/doctrineJudgments';

export const ResolveUnderspecifiedPointsInputSchema = z.object({
  id: z
    .number()
    .int()
    .optional()
    .describe('Judgment record ID returned by record_doctrine_judgment (preferred lookup key)'),
  session_id: z
    .string()
    .min(1)
    .optional()
    .describe('Session ID used when the judgment was recorded (required with subject when id is omitted)'),
  subject: z
    .string()
    .min(1)
    .optional()
    .describe('Subject key used when the judgment was recorded (required with session_id when id is omitted)'),
  resolutions: z
    .array(
      z.object({
        point: z
          .string()
          .min(1)
          .describe(
            "One of the judgment's declared underspecified_points, verbatim (whitespace included)",
          ),
        answer: z
          .string()
          .min(1)
          .describe("The human's actual answer for this point. Empty answers are rejected"),
      }),
    )
    .min(1)
    .describe("The human's answers, one entry per declared point being resolved"),
  workspacePath: workspacePathParam,
});

export type ResolveUnderspecifiedPointsInput = z.infer<typeof ResolveUnderspecifiedPointsInputSchema>;

/**
 * DCT-19: 申告済み未確定論点への人の回答を記録する。時刻引数は受け付けない
 * （常にサーバー側の now。`record_delegated_approval` と同じ監査上の理由）。
 */
export async function handleResolveUnderspecifiedPoints(
  input: ResolveUnderspecifiedPointsInput,
): Promise<PointResolutionsResult> {
  if (input.id === undefined && (input.session_id === undefined || input.subject === undefined)) {
    throw new Error('resolve_underspecified_points requires id or (session_id + subject)');
  }
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  // 保存先は caravan-book.db（判断記録と同居。解消は判断 id へ FK で紐づく）
  const dbPath = resolveCaravanDbPathForWrite({ workspacePath });
  const opened = await openCaravanDb(dbPath, 'readwrite');
  try {
    ensureAndMigrateDoctrineJudgments(opened.db, dbPath);
    const result = recordPointResolutionsDirect(opened.db, {
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      resolutions: input.resolutions,
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}
