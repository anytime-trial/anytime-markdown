/**
 * Thin React wrapper for CodeGraphCanvas.
 * All logic lives in the vanilla view `views/codeGraphCanvas.ts`.
 * Types are re-exported here for backward compatibility.
 */
import { VanillaIsland } from '../shared/vanillaIsland';
import {
  mountCodeGraphCanvas,
  type CodeGraphCanvasViewProps,
  COMMUNITY_COLORS,
  riskColor,
} from '../views/codeGraphCanvas';

export type { CodeGraphGhostEdge, CodeGraphGhostEdgeGranularity } from '../views/codeGraphCanvas';
export { COMMUNITY_COLORS, riskColor };

interface CodeGraphCanvasProps {
  readonly graph: CodeGraphCanvasViewProps['graph'];
  readonly highlightedNodes?: ReadonlySet<string>;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly isDark?: boolean;
  readonly ghostEdges?: CodeGraphCanvasViewProps['ghostEdges'];
  readonly ghostEdgeGranularity?: CodeGraphCanvasViewProps['ghostEdgeGranularity'];
  readonly riskMap?: ReadonlyMap<string, number> | null;
}

export function CodeGraphCanvas({
  graph,
  highlightedNodes,
  onNodeClick,
  isDark,
  ghostEdges,
  ghostEdgeGranularity = 'commit',
  riskMap,
}: Readonly<CodeGraphCanvasProps>): React.ReactElement {
  const viewProps: CodeGraphCanvasViewProps = {
    graph,
    highlightedNodes,
    onNodeClick,
    isDark,
    ghostEdges,
    ghostEdgeGranularity,
    riskMap,
  };

  return <VanillaIsland mount={mountCodeGraphCanvas} props={viewProps} />;
}
