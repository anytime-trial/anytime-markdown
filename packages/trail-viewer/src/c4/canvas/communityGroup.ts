import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

/**
 * Pseudo-community ID derived from the first two path segments of filePath.
 * e.g. "packages/trail-viewer/src/c4/canvas/BubbleCanvas.tsx"
 *   → "packages/trail-viewer"
 *
 * Files at the repo root or with < 2 segments fall back to "_root".
 *
 * This is Option β of the galaxy view plan — coarser than real graph
 * communities but reads directly from FunctionAnalysisApiEntry.filePath
 * without additional data wiring.
 */
export function communityIdOf(filePath: string): string {
  const segments = filePath.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return '_root';
  return `${segments[0]}/${segments[1]}`;
}

export interface CommunityGroup {
  readonly id: string;
  readonly entries: readonly FunctionAnalysisApiEntry[];
}

/**
 * Group entries by their community ID and sort communities by size
 * (entries.length desc) so larger communities land closer to the galactic
 * center via computeCommunityCenters.
 */
export function groupByCommunity(
  entries: readonly FunctionAnalysisApiEntry[],
): CommunityGroup[] {
  const map = new Map<string, FunctionAnalysisApiEntry[]>();
  for (const entry of entries) {
    const id = communityIdOf(entry.filePath);
    let bucket = map.get(id);
    if (!bucket) {
      bucket = [];
      map.set(id, bucket);
    }
    bucket.push(entry);
  }
  return [...map.entries()]
    .map(([id, bucketEntries]) => ({ id, entries: bucketEntries as readonly FunctionAnalysisApiEntry[] }))
    .sort((a, b) => b.entries.length - a.entries.length);
}
