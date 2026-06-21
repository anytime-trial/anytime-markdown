/**
 * GraphCanvas — thin React wrapper around the vanilla mountGraphCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/graphCanvas.ts
 *
 * This file keeps the `GraphCanvas` component name and all previously-exported
 * types so that C4ViewerCore + external consumers are unchanged.
 */
import type { GraphDocument, GraphGroup, SelectionState, Viewport } from '@anytime-markdown/graph-core';
import type { Action } from '@anytime-markdown/graph-core/state';
import type React from 'react';
import { useRef } from 'react';

import { VanillaIsland } from '../../../shared/vanillaIsland';
import type {
  CommunityOverlayStyle,
  C4GhostEdgeGranularity,
  C4GhostEdgeRender,
  GraphCanvasViewProps,
} from '../../../views/c4/canvases/graphCanvas';
import { mountGraphCanvas } from '../../../views/c4/canvases/graphCanvas';

// Re-export types from the vanilla module for back-compat.
export type { CommunityOverlayStyle, C4GhostEdgeGranularity, C4GhostEdgeRender } from '../../../views/c4/canvases/graphCanvas';

/**
 * Re-export deleteGroupsContainingSelection for any consumers that import it from this path.
 * Defined here since graph-react-islands does not re-export it from its package index.
 */
export function deleteGroupsContainingSelection(
  selectedIds: Set<string>,
  groups: readonly GraphGroup[],
  dispatch: ((action: { type: string; [key: string]: unknown }) => void) | undefined,
): void {
  for (const g of groups) {
    if (g.memberIds.some((id) => selectedIds.has(id))) {
      dispatch?.({ type: 'DELETE_GROUP', id: g.id });
    }
  }
}

// Suppress unused-import warnings for types used only in JSDoc / re-export
type _Unused = SelectionState;

export interface C4GraphCanvasProps {
  readonly document: GraphDocument;
  readonly viewport: Viewport;
  readonly dispatch: React.Dispatch<Action>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly selectedNodeId?: string | null;
  readonly centerOnSelect?: boolean;
  readonly overlayMap?: ReadonlyMap<string, string> | null;
  readonly claudeActivityMap?: ReadonlyMap<string, string> | null;
  readonly communityMap?: ReadonlyMap<string, CommunityOverlayStyle> | null;
  readonly communityRoleBadgeMap?: ReadonlyMap<string, string> | null;
  readonly ghostEdges?: ReadonlyArray<C4GhostEdgeRender>;
  readonly ghostEdgeGranularity?: C4GhostEdgeGranularity;
  readonly onNodeSelect?: (nodeId: string | null) => void;
  readonly onMultiNodeSelect?: (c4Ids: readonly string[]) => void;
  readonly onNodeDoubleClick?: (nodeId: string) => void;
  readonly onNodeContextMenu?: (c4Id: string, x: number, y: number) => void;
  readonly onGroupContextMenu?: (groupId: string, x: number, y: number) => void;
  readonly isDark?: boolean;
}

export function GraphCanvas({
  document,
  viewport,
  dispatch,
  canvasRef,
  selectedNodeId,
  centerOnSelect,
  overlayMap,
  claudeActivityMap,
  communityMap,
  communityRoleBadgeMap,
  ghostEdges,
  ghostEdgeGranularity = 'commit',
  onNodeSelect,
  onMultiNodeSelect,
  onNodeDoubleClick,
  onNodeContextMenu,
  onGroupContextMenu,
  isDark,
}: Readonly<C4GraphCanvasProps>): React.ReactElement {
  // Keep a stable ref to canvasRef so we can pass the mutable-ref slot
  const stableCanvasRef = useRef(canvasRef);
  stableCanvasRef.current = canvasRef;

  const vanillaProps: GraphCanvasViewProps = {
    document: document as GraphDocument,
    viewport,
    dispatch: dispatch as unknown as (action: Action) => void,
    // Pass canvasRef as a plain mutable-ref compatible object
    canvasRef: canvasRef as { current: HTMLCanvasElement | null },
    selectedNodeId,
    centerOnSelect,
    overlayMap,
    claudeActivityMap,
    communityMap,
    communityRoleBadgeMap,
    ghostEdges,
    ghostEdgeGranularity,
    onNodeSelect,
    onMultiNodeSelect,
    onNodeDoubleClick,
    onNodeContextMenu,
    onGroupContextMenu,
    isDark,
  };

  return (
    <VanillaIsland
      mount={mountGraphCanvas}
      props={vanillaProps}
    />
  );
}
