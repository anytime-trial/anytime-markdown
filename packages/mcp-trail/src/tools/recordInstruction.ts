import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveMemoryDbPath, resolveWorkspacePath } from '../dbPath';
import { openMemoryDb } from '../sqlite/openDb';
import {
  closeInstructionDirect,
  continueInstructionDirect,
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
  // Flight Record の台帳は memory-core.db（2026-08-07 に trail.db から移設）
  const dbPath = resolveMemoryDbPath({ workspacePath });
  const opened = await openMemoryDb(dbPath, 'readwrite');
  try {
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

export async function handleListOpenInstructions(
  input: ListOpenInstructionsInput,
): Promise<{ instructions: OpenInstructionRow[] }> {
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const dbPath = resolveMemoryDbPath({ workspacePath });
  const opened = await openMemoryDb(dbPath, 'readonly');
  try {
    return { instructions: listOpenInstructionsDirect(opened.db, workspacePath, input.limit ?? 10) };
  } finally {
    opened.close();
  }
}
