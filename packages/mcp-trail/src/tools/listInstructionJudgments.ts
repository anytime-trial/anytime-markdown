import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveCaravanDbPath, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb } from '../sqlite/openDb';
import { listDoctrineJudgmentsByInstruction, type DoctrineJudgmentView } from '../sqlite/doctrineJudgments';

export const ListInstructionJudgmentsInputSchema = z.object({
  instruction_id: z.string().min(1).describe('Instruction ID from list_open_instructions / record_instruction'),
  workspacePath: workspacePathParam,
});

export interface ListInstructionJudgmentsResult {
  readonly instructionId: string;
  readonly summary: string | null;
  readonly judgments: readonly DoctrineJudgmentView[];
  readonly sourceErrors: readonly string[];
}

/** Read only: never ensure tables or trigger a migration. */
export async function handleListInstructionJudgments(
  input: z.infer<typeof ListInstructionJudgmentsInputSchema>,
): Promise<ListInstructionJudgmentsResult> {
  const sourceErrors: string[] = [];
  let summary: string | null = null;
  let judgments: DoctrineJudgmentView[] = [];
  try {
    const workspacePath = resolveWorkspacePath(input.workspacePath).path;
    const opened = await openCaravanDb(resolveCaravanDbPath({ workspacePath }), 'readonly');
    try {
      try {
        const row = opened.db.prepare('SELECT summary FROM caravan_instructions WHERE id = ?')
          .get(input.instruction_id) as { summary: string | null } | undefined;
        summary = row?.summary ?? null;
      } catch (error) {
        sourceErrors.push(`caravan-book.db summary read failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const columns = opened.db.prepare('PRAGMA table_info(caravan_doctrine_judgments)').all() as Array<{ name: string }>;
      if (columns.length === 0) {
        sourceErrors.push('caravan-book.db: caravan_doctrine_judgments table not found');
      } else if (!columns.some(column => column.name === 'instruction_id')) {
        sourceErrors.push('caravan-book.db: caravan_doctrine_judgments.instruction_id column not found');
      } else {
        judgments = listDoctrineJudgmentsByInstruction(opened.db, input.instruction_id);
      }
    } finally {
      opened.close();
    }
  } catch (error) {
    sourceErrors.push(`caravan-book.db read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { instructionId: input.instruction_id, summary, judgments, sourceErrors };
}
