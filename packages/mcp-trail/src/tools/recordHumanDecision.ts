import { z } from 'zod';
import { resolveDbPath } from '../dbPath';
import { openTrailDb } from '../sqlite/openDb';
import {
  recordHumanDecisionDirect,
  type HumanDecisionResult,
} from '../sqlite/doctrineJudgments';

export const RecordHumanDecisionInputSchema = z.object({
  session_id: z.string().min(1).describe('Session ID used when the judgment was recorded'),
  subject: z.string().min(1).describe('Subject key used when the judgment was recorded'),
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
  const dbPath = resolveDbPath({ workspacePath: input.workspacePath });
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    const result = recordHumanDecisionDirect(opened.db, {
      sessionId: input.session_id,
      subject: input.subject,
      decision: input.decision,
      ...(input.decided_at === undefined ? {} : { decidedAt: input.decided_at }),
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}
