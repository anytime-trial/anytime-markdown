import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveDbPath, resolveCaravanDbPath, resolveCaravanDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb, openTrailDb } from '../sqlite/openDb';
import { describeDbOpenFailure } from '../sqlite/dbOpenError';
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
  // Flight Record の台帳は caravan-book.db（2026-08-07 に activity.db から移設）。
  // 書き込みは ForWrite 解決: 拡張未起動で caravan-book.db が無くても宣言を落とさない
  const dbPath = resolveCaravanDbPathForWrite({ workspacePath });
  const opened = await openCaravanDb(dbPath, 'readwrite');
  try {
    // activity.db に旧台帳が残っていれば回収する（caravan_doctrine_judgments と同じ遅延移行。
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
 * 移行過渡期には旧指示が activity.db 側に残るため、memory + trail の両読みを id で
 * memory 優先に重複排除して返す（get_doctrine_agreement と同方針。移行完了後は
 * trail 側が常に空になり union は no-op）。
 */
export async function handleListOpenInstructions(
  input: ListOpenInstructionsInput,
): Promise<{ instructions: OpenInstructionRow[] }> {
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const limit = input.limit ?? 10;

  let caravanRows: OpenInstructionRow[] = [];
  let caravanFailed: unknown = null;
  try {
    const dbPath = resolveCaravanDbPath({ workspacePath });
    const opened = await openCaravanDb(dbPath, 'readonly');
    try {
      caravanRows = listOpenInstructionsDirect(opened.db, workspacePath, limit);
    } finally {
      opened.close();
    }
  } catch (err) {
    caravanFailed = err;
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] list_open_instructions: caravan-book.db read failed (workspace=${workspacePath}); falling back to activity.db`,
      err instanceof Error ? err.stack : err,
    );
  }

  let trailRows: OpenInstructionRow[] = [];
  let trailFailed: unknown = null;
  try {
    const trailDbPath = resolveDbPath({ workspacePath });
    const openedTrail = await openTrailDb(trailDbPath, 'readonly');
    try {
      trailRows = listOpenInstructionsDirect(openedTrail.db, workspacePath, limit);
    } finally {
      openedTrail.close();
    }
  } catch (err) {
    trailFailed = err;
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] list_open_instructions: activity.db read failed (workspace=${workspacePath}); using caravan-book.db rows only`,
      err instanceof Error ? err.stack : err,
    );
  }

  // 「テーブルが無い = 宣言ゼロ」（空配列）と「両 DB とも読めない = 不明」を混同しない。
  // 後者を空配列で返すと、進行中の指示を放置したまま新規宣言が積まれる偽陰性になる
  if (caravanFailed !== null && trailFailed !== null) {
    // 原因が native binary の解決なら 2 つの DB は同じ理由で落ちている。
    // 「両方読めなかった」ではなく共通の原因を 1 度で返す（dbOpenError.ts 参照）。
    throw new Error(
      `list_open_instructions: both caravan-book.db and activity.db unreadable (workspace=${workspacePath}): ` +
        describeDbOpenFailure(caravanFailed),
    );
  }

  const seen = new Set(caravanRows.map((r) => r.id));
  const merged = [...caravanRows, ...trailRows.filter((r) => !seen.has(r.id))]
    .sort((a, b) => (a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0))
    .slice(0, limit);
  return { instructions: merged };
}
