import { z } from 'zod';
import { detectDrift, openMemoryCoreDb } from '@anytime-markdown/memory-core';
import type { DriftEventSummary } from '@anytime-markdown/memory-core';

export const DetectDriftInputSchema = z.object({
  unresolved_only: z.boolean().optional().describe('Only return unresolved events (default true)'),
  severity: z.string().optional().describe('Filter by severity (info, warn, error)'),
  drift_type: z.string().optional().describe('Filter by drift_type'),
  subject_id: z.string().optional().describe('Filter by subject entity ID'),
  since: z.string().optional().describe('Filter detected_at >= ISO 8601'),
  limit: z.number().optional().describe('Max results (default 50)'),
});

export type DetectDriftInput = z.infer<typeof DetectDriftInputSchema>;

export async function handleDetectDrift(input: DetectDriftInput): Promise<DriftEventSummary[]> {
  const memoryDbPath = process.env['MEMORY_CORE_DB_PATH'];
  const memHandle = await openMemoryCoreDb(memoryDbPath);
  const logger = { info: () => {}, error: console.error };
  try {
    return detectDrift({ db: memHandle.db, ...input, logger });
  } finally {
    memHandle.close();
  }
}
