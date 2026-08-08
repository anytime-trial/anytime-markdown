import { useMemo } from 'react';
import type { C4Model } from '@anytime-markdown/trail-activity';
import type {
  ConfidenceCouplingEdge,
  TemporalCouplingEdge,
} from '@anytime-markdown/trail-activity';
import {
  aggregateGhostEdgesToC4,
  type C4GhostEdge,
} from '@anytime-markdown/trail-activity/c4';

export function useC4GhostEdges(
  edges: ReadonlyArray<TemporalCouplingEdge | ConfidenceCouplingEdge>,
  c4Model: C4Model | null,
  level: 1 | 2 | 3 | 4,
  selectedRepo: string | null,
): readonly C4GhostEdge[] {
  return useMemo(() => {
    if (!c4Model) return [];
    return aggregateGhostEdgesToC4(edges, c4Model, level, selectedRepo);
  }, [edges, c4Model, level, selectedRepo]);
}
