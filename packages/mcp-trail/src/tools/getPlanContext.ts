import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import {
  getPlanContext,
  openCaravanBookDb,
  attachTrailDbReadOnly,
} from '@anytime-markdown/trail-caravan-book/query';
import type { PlanContextResult } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath, resolveDbPath } from '../dbPath';

export const GetPlanContextInputSchema = z.object({
  workspacePath: workspacePathParam,
  target_paths: z
    .array(z.string())
    .min(1)
    .describe('Files / directories about to be changed (workspace-relative paths)'),
  token_budget: z
    .number()
    .optional()
    .describe('Approximate token budget for the whole response (default 2000; JSON chars / 3)'),
});

export type GetPlanContextToolInput = z.infer<typeof GetPlanContextInputSchema>;

export async function handleGetPlanContext(input: GetPlanContextToolInput): Promise<PlanContextResult> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  try {
    // 共変更セクションは activity.db（attach 済み trail スキーマ）が必要。
    // attach に失敗しても他セクションは返す（getPlanContext 側で縮退する）
    try {
      await attachTrailDbReadOnly(memHandle.db, resolveDbPath({ workspacePath: input.workspacePath }));
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? String(err)) : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[${new Date().toISOString()}] [WARN] get_plan_context: activity.db attach failed, cochange degraded: ${stack}`,
      );
    }
    return getPlanContext(memHandle.db, {
      target_paths: input.target_paths,
      token_budget: input.token_budget,
    });
  } finally {
    memHandle.close();
  }
}
