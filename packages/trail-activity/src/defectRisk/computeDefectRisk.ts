import type { CommitRiskRow, DefectRiskEntry, ComputeDefectRiskOptions } from './types';

const W_FIX = 0.7;
const W_CHURN = 0.3;

export function computeDefectRisk(
  rows: ReadonlyArray<CommitRiskRow>,
  options: ComputeDefectRiskOptions,
): DefectRiskEntry[] {
  if (rows.length === 0) return [];

  const { halfLifeDays, referenceDateIso } = options;
  const λ = Math.LN2 / halfLifeDays;
  const refMs = referenceDateIso ? new Date(referenceDateIso).getTime() : Date.now();

  const fileMap = new Map<string, { fixScore: number; churnScore: number; fixCount: number; churnCount: number }>();

  for (const row of rows) {
    const daysSince = Math.max(0, (refMs - new Date(row.committedAt).getTime()) / 86400000);
    const decay = Math.exp(-λ * daysSince);
    const isFix = /^fix[(:)]/.test(row.commitMessage);

    let entry = fileMap.get(row.filePath);
    if (!entry) {
      entry = { fixScore: 0, churnScore: 0, fixCount: 0, churnCount: 0 };
      fileMap.set(row.filePath, entry);
    }
    entry.churnScore += decay;
    entry.churnCount++;
    if (isFix) {
      entry.fixScore += decay;
      entry.fixCount++;
    }
  }

  type Raw = DefectRiskEntry & { raw: number };
  const raws: Raw[] = [];
  for (const [filePath, { fixScore, churnScore, fixCount, churnCount }] of fileMap) {
    raws.push({ filePath, fixCount, churnCount, score: 0, raw: W_FIX * fixScore + W_CHURN * churnScore });
  }

  const maxRaw = Math.max(...raws.map((r) => r.raw), 1e-9);
  return raws
    .map(({ filePath, fixCount, churnCount, raw }) => ({ filePath, fixCount, churnCount, score: raw / maxRaw }))
    .sort((a, b) => b.score - a.score);
}
