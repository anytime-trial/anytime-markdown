import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import { getBugCausality, openCaravanBookDb } from '@anytime-markdown/trail-caravan-book/query';
import type { GetBugCausalityResult } from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const GetBugCausalityInputSchema = z.object({
  workspacePath: workspacePathParam,
  query: z.string().optional().describe('Symptom keywords matched against fix subjects and Bug names (AND of tokens)'),
  commit_sha: z.string().optional().describe('Fix commit SHA (prefix match)'),
  file_path: z.string().optional().describe('File path matched against the affected files of each fix'),
  limit: z.number().optional().describe('Max causality cards (default 3)'),
});

export type GetBugCausalityToolInput = z.infer<typeof GetBugCausalityInputSchema>;

export async function handleGetBugCausality(input: GetBugCausalityToolInput): Promise<GetBugCausalityResult> {
  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));
  try {
    return getBugCausality(memHandle.db, {
      query: input.query,
      commit_sha: input.commit_sha,
      file_path: input.file_path,
      limit: input.limit,
    });
  } finally {
    memHandle.close();
  }
}
