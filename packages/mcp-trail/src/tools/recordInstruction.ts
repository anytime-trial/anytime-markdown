import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveMemoryDbPath, resolveMemoryDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb, openTrailDb } from '../sqlite/openDb';
import {
  closeInstructionDirect,
  continueInstructionDirect,
  ensureAndMigrateInstructionTables,
  listOpenInstructionsDirect,
  openInstructionDirect,
  type InstructionDeclarationResult,
  type OpenInstructionRow,
} from '../sqlite/instructions';

export const RecordInstructionInputSchema = z.object({
  mode: z
    .enum(['new', 'continue', 'close'])
    .describe(
      'new = open a new instruction with this session as its origin; continue = attach this session to an existing instruction; close = mark an instruction finished so it stops being offered as a continuation candidate',
    ),
  session_id: z
    .string()
    .min(1)
    .optional()
    .describe('Claude Code session UUID being declared (required for new and continue)'),
  instruction_id: z
    .string()
    .min(1)
    .optional()
    .describe('Existing instruction ID (required for continue and close; get it from list_open_instructions)'),
  summary: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("One-line summary of what the human asked for (required for new). This is the row's identity in Flight Record"),
  origin_prompt: z
    .string()
    .max(2000)
    .optional()
    .describe("The human's opening prompt verbatim, truncated (new only)"),
  workspacePath: workspacePathParam,
});

export type RecordInstructionInput = z.infer<typeof RecordInstructionInputSchema>;

export async function handleRecordInstruction(
  input: RecordInstructionInput,
): Promise<InstructionDeclarationResult | { instructionId: string; closedAt: string }> {
  if (input.mode !== 'close' && (input.session_id === undefined || input.session_id === '')) {
    throw new Error('record_instruction requires session_id for mode=new|continue');
  }
  if (input.mode !== 'new' && (input.instruction_id === undefined || input.instruction_id === '')) {
    throw new Error('record_instruction requires instruction_id for mode=continue|close');
  }
  if (input.mode === 'new' && (input.summary === undefined || input.summary.trim() === '')) {
    throw new Error('record_instruction requires summary for mode=new');
  }
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  // Flight Record の台帳は memory-core.db（2026-08-07 に trail.db から移設）。
  // 書き込みは ForWrite 解決: 拡張未起動で memory-core.db が無くても宣言を落とさない
  const dbPath = resolveMemoryDbPathForWrite({ workspacePath });
  const opened = await openMemoryDb(dbPath, 'readwrite');
  try {
    // trail.db に旧台帳が残っていれば回収する（doctrine_judgments と同じ遅延移行。
    // 回収しないと旧指示への continue が「not found」になり、一覧からも消える）
    ensureAndMigrateInstructionTables(opened.db, dbPath);
    if (input.mode === 'close') {
      const result = closeInstructionDirect(opened.db, input.instruction_id as string);
      opened.save();
      return result;
    }
    if (input.mode === 'continue') {
      const result = continueInstructionDirect(opened.db, {
        sessionId: input.session_id as string,
        instructionId: input.instruction_id as string,
        workspacePath,
      });
      opened.save();
      return result;
    }
    const result = openInstructionDirect(opened.db, {
      sessionId: input.session_id as string,
      summary: input.summary as string,
      ...(input.origin_prompt === undefined ? {} : { originPrompt: input.origin_prompt }),
      workspacePath,
    });
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}

export const ListOpenInstructionsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().describe('Maximum candidates to return (default 10)'),
  workspacePath: workspacePathParam,
});

export type ListOpenInstructionsInput = z.infer<typeof ListOpenInstructionsInputSchema>;

/**
 * 継続宣言の候補一覧。**読み取り専用**（ensure・移行を起動しない）。
 * 移行過渡期には旧指示が trail.db 側に残るため、memory + trail の両読みを id で
 * memory 優先に重複排除して返す（get_doctrine_agreement と同方針。移行完了後は
 * trail 側が常に空になり union は no-op）。
 */
export async function handleListOpenInstructions(
  input: ListOpenInstructionsInput,
): Promise<{ instructions: OpenInstructionRow[] }> {
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const limit = input.limit ?? 10;

  let memoryRows: OpenInstructionRow[] = [];
  try {
    const dbPath = resolveMemoryDbPath({ workspacePath });
    const opened = await openMemoryDb(dbPath, 'readonly');
    try {
      memoryRows = listOpenInstructionsDirect(opened.db, workspacePath, limit);
    } finally {
      opened.close();
    }
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] list_open_instructions: memory-core.db read failed (workspace=${workspacePath}); falling back to trail.db`,
      err instanceof Error ? err.stack : err,
    );
  }

  let trailRows: OpenInstructionRow[] = [];
  try {
    const trailDbPath = resolveDbPath({ workspacePath });
    const openedTrail = await openTrailDb(trailDbPath, 'readonly');
    try {
      trailRows = listOpenInstructionsDirect(openedTrail.db, workspacePath, limit);
    } finally {
      openedTrail.close();
    }
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] list_open_instructions: trail.db read failed (workspace=${workspacePath}); using memory-core.db rows only`,
      err instanceof Error ? err.stack : err,
    );
  }

  const seen = new Set(memoryRows.map((r) => r.id));
  const merged = [...memoryRows, ...trailRows.filter((r) => !seen.has(r.id))]
    .sort((a, b) => (a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0))
    .slice(0, limit);
  return { instructions: merged };
}
