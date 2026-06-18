import type { PathResult } from '@anytime-markdown/graph-core/engine';
import { findShortestPath } from '@anytime-markdown/graph-core/engine';

import type { GraphEdge } from '../types';

export interface PathHighlightState {
  readonly highlightPath: PathResult | null;
  readonly originNodeId: string | null;
  readonly highlightNodeIds: ReadonlySet<string>;
  readonly highlightEdgeIds: ReadonlySet<string>;
}

export interface PathHighlight {
  getState(): PathHighlightState;
  setOriginNodeId(id: string | null): void;
  setHoverTargetId(id: string | null): void;
  /** エッジリストが変わったとき（グラフ更新時）に呼ぶ */
  updateEdges(edges: readonly GraphEdge[]): void;
  subscribe(cb: (state: PathHighlightState) => void): () => void;
}

function computeState(
  edges: readonly GraphEdge[],
  originNodeId: string | null,
  hoverTargetId: string | null,
): PathHighlightState {
  const highlightPath =
    originNodeId && hoverTargetId && originNodeId !== hoverTargetId
      ? findShortestPath(edges, originNodeId, hoverTargetId)
      : null;

  const highlightNodeIds: ReadonlySet<string> = new Set(highlightPath?.nodeIds ?? []);
  const highlightEdgeIds: ReadonlySet<string> = new Set(highlightPath?.edgeIds ?? []);

  return { highlightPath, originNodeId, highlightNodeIds, highlightEdgeIds };
}

/**
 * usePathHighlight 相当の vanilla factory。
 * 状態を closure に保持し、subscribe でリアクティブに通知する。
 */
export function createPathHighlight(initialEdges: readonly GraphEdge[] = []): PathHighlight {
  let edges: readonly GraphEdge[] = initialEdges;
  let originNodeId: string | null = null;
  let hoverTargetId: string | null = null;
  let currentState: PathHighlightState = computeState(edges, null, null);
  const listeners = new Set<(state: PathHighlightState) => void>();

  function notify(): void {
    currentState = computeState(edges, originNodeId, hoverTargetId);
    for (const cb of listeners) {
      cb(currentState);
    }
  }

  function getState(): PathHighlightState {
    return currentState;
  }

  function setOriginNodeId(id: string | null): void {
    if (originNodeId === id) return;
    originNodeId = id;
    notify();
  }

  function setHoverTargetId(id: string | null): void {
    if (hoverTargetId === id) return;
    hoverTargetId = id;
    notify();
  }

  function updateEdges(nextEdges: readonly GraphEdge[]): void {
    // 変化ガード（setOriginNodeId / setHoverTargetId と同じ防御）。
    // 同一参照での再 push では通知しない。これにより updateEdges → notify →
    // 購読者 → updateEdges(同一) という再帰が必ず停止する（defense-in-depth）。
    if (edges === nextEdges) return;
    edges = nextEdges;
    notify();
  }

  function subscribe(cb: (state: PathHighlightState) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }

  return { getState, setOriginNodeId, setHoverTargetId, updateEdges, subscribe };
}

// ---------------------------------------------------------------------------
// Pure helper — ホスト側が直接計算したい場合に使える
// ---------------------------------------------------------------------------

/**
 * エッジ・origin・hoverTarget を受け取り PathHighlightState を純関数で計算して返す。
 * React-free でメモ化不要な場所（SSR・テスト等）から呼べる。
 */
export function computePathHighlight(
  edges: readonly GraphEdge[],
  originNodeId: string | null,
  hoverTargetId: string | null,
): PathHighlightState {
  return computeState(edges, originNodeId, hoverTargetId);
}
