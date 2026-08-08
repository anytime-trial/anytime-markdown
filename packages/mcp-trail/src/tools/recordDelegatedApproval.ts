import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveMemoryDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb } from '../sqlite/openDb';
import {
  ensureAndMigrateDoctrineJudgments,
  recordDelegatedApprovalDirect,
  type DelegatedApprovalResult,
} from '../sqlite/doctrineJudgments';

export const RecordDelegatedApprovalInputSchema = z.object({
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
  // delegated_at は意図的に受け付けない。外から時刻を指定できると代行を遡って記録でき、
  // 「いつ人へ聞かずに進めたか」の監査ログとして成立しなくなる。時刻は常にサーバー側の now。
  workspacePath: workspacePathParam,
});

export type RecordDelegatedApprovalInput = z.infer<typeof RecordDelegatedApprovalInputSchema>;

export async function handleRecordDelegatedApproval(
  input: RecordDelegatedApprovalInput,
): Promise<DelegatedApprovalResult> {
  if (input.id === undefined && (input.session_id === undefined || input.subject === undefined)) {
    throw new Error('record_delegated_approval requires id or (session_id + subject)');
  }
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  // 保存先は caravan-book.db（2026-08-07 に activity.db から移設。旧テーブルは遅延移行で回収）
  const dbPath = resolveMemoryDbPathForWrite({ workspacePath });
  const opened = await openMemoryDb(dbPath, 'readwrite');
  try {
    ensureAndMigrateDoctrineJudgments(opened.db, dbPath);
    const result = recordDelegatedApprovalDirect(opened.db, {
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
      ...(input.subject === undefined ? {} : { subject: input.subject }),
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}
