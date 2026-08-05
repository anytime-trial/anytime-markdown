import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveWorkspacePath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import {
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
  delegated_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
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
  const dbPath = resolveDbPath({ workspacePath });
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    const result = recordDelegatedApprovalDirect(opened.db, {
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(input.delegated_at === undefined ? {} : { delegatedAt: input.delegated_at }),
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}
