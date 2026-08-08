import type { FileHotspotRow } from './types';

export function computeFileHotspot(rows: readonly FileHotspotRow[]): readonly FileHotspotRow[] {
  if (rows.length === 0) return [];
  const sums = new Map<string, number>();
  for (const { filePath, churn } of rows) {
    sums.set(filePath, (sums.get(filePath) ?? 0) + churn);
  }
  const merged: FileHotspotRow[] = [];
  for (const [filePath, churn] of sums) {
    merged.push({ filePath, churn });
  }
  merged.sort((a, b) => {
    if (b.churn !== a.churn) return b.churn - a.churn;
    return a.filePath.localeCompare(b.filePath);
  });
  return merged;
}
