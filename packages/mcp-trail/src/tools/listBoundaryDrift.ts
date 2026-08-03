import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';

import { resolveDbPath, resolveWorkspacePath } from '../dbPath';
import {
  listBoundaryDriftDirect,
  type BoundaryDriftListResult,
} from '../sqlite/boundaryDrift';
import { openTrailDb } from '../sqlite/openDb';

export const ListBoundaryDriftInputSchema = z.object({
  repoName: z.string().optional().describe('Repository name to filter (defaults to all repos)'),
  kind: z
    .enum(['boundary_spanning', 'package_fragmentation'])
    .optional()
    .describe('boundary_spanning: one community spans many packages. package_fragmentation: one package splits across many communities'),
  minSeverity: z
    .number()
    .optional()
    .describe('Minimum severity. Requires kind: severity is comparable only within a kind (boundary_spanning = spanCount x (1 - dominance), package_fragmentation = communityCount)'),
  includeHistory: z
    .boolean()
    .optional()
    .describe('Include past detection runs (default false: latest run only)'),
  limit: z.number().optional().describe('Maximum warnings to return (default 50)'),
  workspacePath: workspacePathParam,
});

export type ListBoundaryDriftInput = z.infer<typeof ListBoundaryDriftInputSchema>;

export async function handleListBoundaryDrift(
  input: ListBoundaryDriftInput,
): Promise<BoundaryDriftListResult> {
  // 既存 MCP ルートと同じ入口: 引数 > TRAIL_WORKSPACE_PATH > cwd
  const workspacePath = resolveWorkspacePath(input.workspacePath).path;
  const dbPath = resolveDbPath({ workspacePath });
  const opened = await openTrailDb(dbPath, 'readonly');
  try {
    return listBoundaryDriftDirect(opened.db, {
      ...(input.repoName === undefined ? {} : { repoName: input.repoName }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.minSeverity === undefined ? {} : { minSeverity: input.minSeverity }),
      ...(input.includeHistory === undefined ? {} : { latestOnly: !input.includeHistory }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
  } finally {
    opened.close();
  }
}
