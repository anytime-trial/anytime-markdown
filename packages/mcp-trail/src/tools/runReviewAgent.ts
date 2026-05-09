import { z } from 'zod';
import { runReviewAgent, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { RunReviewAgentResult } from '@anytime-markdown/memory-core';

export const RunReviewAgentInputSchema = z.object({
  trigger_kind: z.literal('mcp').describe('Trigger kind (must be "mcp")'),
  target_kind: z.enum(['spec', 'code', 'package', 'mixed']).describe('Target type'),
  target_refs: z.array(z.string()).describe('List of target file paths or package names'),
  prompt_kind: z.enum(['a11y', 'security', 'perf', 'spec_drift', 'naming', 'logic', 'multi']).describe('Review prompt type'),
  model: z.string().optional().describe('Model override'),
});

export type RunReviewAgentInput = z.infer<typeof RunReviewAgentInputSchema>;

export async function handleRunReviewAgent(input: RunReviewAgentInput): Promise<RunReviewAgentResult> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return runReviewAgent({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
