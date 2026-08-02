import { z } from 'zod';
import { resolveDbPath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import {
  recordHumanDecisionDirect,
  type HumanDecisionResult,
} from '../sqlite/doctrineJudgments';

export const RecordHumanDecisionInputSchema = z.object({
  id: z
    .number()
    .int()
    .optional()
    .describe('Judgment record ID returned by record_doctrine_judgment (preferred lookup key)'),
  session_id: z.string().min(1).optional().describe('Session ID used when the judgment was recorded (required with subject when id is omitted)'),
  subject: z.string().min(1).optional().describe('Subject key used when the judgment was recorded (required with session_id when id is omitted)'),
  decision: z
    .enum(['approve', 'reject', 'modified'])
    .describe("Human's actual decision (modified = approved with changes / conditions)"),
  decided_at: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  workspacePath: z.string().optional().describe('Workspace root to resolve trail.db (defaults to cwd)'),
});

export type RecordHumanDecisionInput = z.infer<typeof RecordHumanDecisionInputSchema>;

export async function handleRecordHumanDecision(
  input: RecordHumanDecisionInput,
): Promise<HumanDecisionResult> {
  if (input.id === undefined && (input.session_id === undefined || input.subject === undefined)) {
    throw new Error('record_human_decision requires id or (session_id + subject)');
  }
  // 既存 MCP ルート (buildRouteOpts) と同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = input.workspacePath ?? process.env['TRAIL_WORKSPACE_PATH'];
  const dbPath = resolveDbPath(workspacePath === undefined ? {} : { workspacePath });
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    const result = recordHumanDecisionDirect(opened.db, {
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      decision: input.decision,
      ...(input.decided_at === undefined ? {} : { decidedAt: input.decided_at }),
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}
