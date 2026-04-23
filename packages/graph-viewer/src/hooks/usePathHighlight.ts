import type { PathResult } from '@anytime-markdown/graph-core/engine';
import { findShortestPath } from '@anytime-markdown/graph-core/engine';
import { useCallback,useMemo, useState } from 'react';

import type { GraphEdge } from '../types';

interface UsePathHighlightReturn {
  readonly highlightPath: PathResult | null;
  readonly originNodeId: string | null;
  readonly setOriginNodeId: (id: string | null) => void;
  readonly setHoverTargetId: (id: string | null) => void;
  readonly highlightNodeIds: ReadonlySet<string>;
  readonly highlightEdgeIds: ReadonlySet<string>;
}

export function usePathHighlight(edges: readonly GraphEdge[]): UsePathHighlightReturn {
  const [originNodeId, setOriginNodeId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetIdState] = useState<string | null>(null);

  const setHoverTargetId = useCallback((id: string | null) => {
    setHoverTargetIdState(id);
  }, []);

  const highlightPath = useMemo(() => {
    if (!originNodeId || !hoverTargetId || originNodeId === hoverTargetId) return null;
    return findShortestPath(edges, originNodeId, hoverTargetId);
  }, [edges, originNodeId, hoverTargetId]);

  const highlightNodeIds = useMemo(
    () => new Set(highlightPath?.nodeIds ?? []),
    [highlightPath],
  );
  const highlightEdgeIds = useMemo(
    () => new Set(highlightPath?.edgeIds ?? []),
    [highlightPath],
  );

  return { highlightPath, originNodeId, setOriginNodeId, setHoverTargetId, highlightNodeIds, highlightEdgeIds };
}
