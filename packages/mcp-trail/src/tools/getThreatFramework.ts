import {
  getThreatFramework,
  THREAT_TACTIC_IDS,
  type ThreatFramework,
} from '@anytime-markdown/trail-core';
import { z } from 'zod';

export const GetThreatFrameworkInputSchema = z.object({
  tactic: z
    .enum(THREAT_TACTIC_IDS)
    .optional()
    .describe('Filter to one tactic. Omitted = the full framework (5 tactics, 17 techniques)'),
});

export type GetThreatFrameworkInput = z.infer<typeof GetThreatFrameworkInputSchema>;

/**
 * ADR 由来の脅威分類（trail-core の静的定数）を返す。DB もネットワークも見ない。
 * 将来の外部脅威インテリジェンス連携はこのツールの置換ではなく別ツールとして
 * 設計する（静的データ返却であることが本ツールの契約）。
 */
export function handleGetThreatFramework(input: GetThreatFrameworkInput): ThreatFramework {
  return getThreatFramework(input.tactic);
}
