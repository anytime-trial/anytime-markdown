/**
 * record_plan_snapshot / verify_plan_snapshot（共用 UI 優先 3・FR-11/12）。
 *
 * 着手時にプランの節指紋を記録し、各タスクの着手前に照合する。人間がプランを書き換えて
 * いれば changed / removed / added が返るので、エージェントは続行せず差分を提示して
 * 再確認する（Plover の「編集可能なプランを共有状態として扱う」を機構だけで採る）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { resolveCaravanDbPath, resolveCaravanDbPathForWrite, resolveWorkspacePath } from '../dbPath';
import { openCaravanDb } from '../sqlite/openDb';
import { findInstructionIdForSession } from '../sqlite/instructions';
import {
  diffPlanSections,
  fingerprintPlanSections,
  latestPlanSnapshotDirect,
  recordPlanSnapshotDirect,
  type PlanSectionDiff,
} from '../sqlite/planSnapshots';

const planPathParam = z
  .string()
  .min(1)
  .describe('Plan markdown file. Absolute path, or relative to the workspace root');

export const RecordPlanSnapshotInputSchema = z.object({
  plan_path: planPathParam,
  session_id: z.string().min(1).describe('Claude Code session UUID recording the snapshot'),
  workspacePath: workspacePathParam,
});

export const VerifyPlanSnapshotInputSchema = z.object({
  plan_path: planPathParam,
  workspacePath: workspacePathParam,
});

export type RecordPlanSnapshotInput = z.infer<typeof RecordPlanSnapshotInputSchema>;
export type VerifyPlanSnapshotInput = z.infer<typeof VerifyPlanSnapshotInputSchema>;

export interface RecordPlanSnapshotResult {
  readonly id: number;
  readonly planPath: string;
  readonly instructionId: string | null;
  readonly sectionCount: number;
  readonly recordedAt: string;
}

export type VerifyPlanSnapshotResult =
  | { readonly recorded: false; readonly planPath: string }
  | ({
      readonly recorded: true;
      readonly planPath: string;
      readonly recordedAt: string;
      readonly instructionId: string | null;
    } & PlanSectionDiff);

function resolvePlanPath(workspacePath: string | undefined, planPath: string): string {
  return path.isAbsolute(planPath) ? path.normalize(planPath) : path.resolve(workspacePath ?? process.cwd(), planPath);
}

export async function handleRecordPlanSnapshot(input: RecordPlanSnapshotInput): Promise<RecordPlanSnapshotResult> {
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const planPath = resolvePlanPath(workspacePath, input.plan_path);
  const sections = fingerprintPlanSections(fs.readFileSync(planPath, 'utf8'));
  const dbPath = resolveCaravanDbPathForWrite({ workspacePath });
  const opened = await openCaravanDb(dbPath, 'readwrite');
  try {
    const instructionId = findInstructionIdForSession(opened.db, input.session_id);
    const result = recordPlanSnapshotDirect(opened.db, {
      sessionId: input.session_id,
      instructionId,
      planPath,
      sections,
    });
    opened.save();
    return { id: result.id, planPath, instructionId, sectionCount: sections.length, recordedAt: result.recordedAt };
  } finally {
    opened.close();
  }
}

/** 読み取り専用。テーブル不在・未記録は `recorded: false`（空の差分と区別する）。 */
export async function handleVerifyPlanSnapshot(input: VerifyPlanSnapshotInput): Promise<VerifyPlanSnapshotResult> {
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const planPath = resolvePlanPath(workspacePath, input.plan_path);
  const current = fingerprintPlanSections(fs.readFileSync(planPath, 'utf8'));
  const opened = await openCaravanDb(resolveCaravanDbPath({ workspacePath }), 'readonly');
  try {
    const snapshot = latestPlanSnapshotDirect(opened.db, planPath);
    if (snapshot === null) return { recorded: false, planPath };
    return {
      recorded: true,
      planPath,
      recordedAt: snapshot.recordedAt,
      instructionId: snapshot.instructionId,
      ...diffPlanSections(snapshot.sections, current),
    };
  } finally {
    opened.close();
  }
}
