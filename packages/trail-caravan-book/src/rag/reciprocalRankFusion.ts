export interface RankedItem {
  readonly id: string;
  readonly rank: number;
}

export type RankSource = 'bm25' | 'vec';

export interface FusedItem {
  readonly id: string;
  readonly score: number;
  readonly sources: RankSource[];
}

export function reciprocalRankFusion(
  bm25: ReadonlyArray<RankedItem>,
  vec: ReadonlyArray<RankedItem>,
  k = 60,
): FusedItem[] {
  const scores = new Map<string, { score: number; sources: Set<RankSource> }>();
  const accumulate = (list: ReadonlyArray<RankedItem>, source: RankSource): void => {
    for (const { id, rank } of list) {
      const entry = scores.get(id) ?? { score: 0, sources: new Set<RankSource>() };
      entry.score += 1 / (k + rank);
      entry.sources.add(source);
      scores.set(id, entry);
    }
  };
  accumulate(bm25, 'bm25');
  accumulate(vec, 'vec');
  return [...scores.entries()]
    .map(([id, v]) => ({ id, score: v.score, sources: [...v.sources] }))
    .sort((a, b) => b.score - a.score);
}
