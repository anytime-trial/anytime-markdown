/**
 * CodeGraphCanvas vanilla view.
 *
 * Mounts a Sigma.js graph renderer for the code dependency graph.
 * Mirrors `components/CodeGraphCanvas.tsx` without React — follows
 * the graphCanvas.ts vanilla factory pattern:
 *   - ResizeObserver with jsdom guard (typeof ResizeObserver !== 'undefined')
 *   - All listeners registered + tracked, destroyed on destroy()
 *   - destroyed guard to skip any post-destroy callbacks
 */
import Sigma from 'sigma';
import { EdgeArrowProgram } from 'sigma/rendering';
import Graph from 'graphology';
import type { ArchitectureLayer, CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { CouplingDirection } from '@anytime-markdown/trail-core';
import { COMMUNITY_COLORS, communityColor, layerColor } from '../components/communityColors';
import {
  GHOST_EDGE_COMMIT_DARK,
  GHOST_EDGE_COMMIT_LIGHT,
  GHOST_EDGE_SESSION_DARK,
  GHOST_EDGE_SESSION_LIGHT,
  GHOST_EDGE_SUBAGENT_DARK,
  GHOST_EDGE_SUBAGENT_LIGHT,
} from '../c4/ghostEdgeColors';
import type { VanillaViewHandle } from '../shared/vanillaIsland';

export { COMMUNITY_COLORS };

// ---------------------------------------------------------------------------
// Re-export types (CodeGraphCanvas.tsx re-exports for back-compat)
// ---------------------------------------------------------------------------

export type CodeGraphGhostEdgeGranularity = 'commit' | 'session' | 'subagentType';

export interface CodeGraphGhostEdge {
  readonly source: string;
  readonly target: string;
  readonly jaccard: number;
  readonly coChangeCount: number;
  readonly direction?: CouplingDirection;
  readonly confidenceForward?: number;
  readonly confidenceBackward?: number;
}

export function riskColor(score: number, dark: boolean): string {
  if (score >= 0.7) return dark ? '#ef5350' : '#c62828';
  if (score >= 0.35) return dark ? '#ffa726' : '#f9a825';
  return dark ? '#66bb6a' : '#2e7d32';
}

// ---------------------------------------------------------------------------
// Props / handle types
// ---------------------------------------------------------------------------

/** ノードの配色方式。'community'（既定）= コミュニティ番号、'layer' = アーキテクチャ層。 */
export type CodeGraphColorBy = 'community' | 'layer';

export interface CodeGraphCanvasViewProps {
  readonly graph: CodeGraph;
  readonly highlightedNodes?: ReadonlySet<string>;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly isDark?: boolean;
  readonly ghostEdges?: ReadonlyArray<CodeGraphGhostEdge>;
  readonly ghostEdgeGranularity?: CodeGraphGhostEdgeGranularity;
  readonly riskMap?: ReadonlyMap<string, number> | null;
  /** ノード配色方式（既定 'community'）。'layer' でアーキテクチャ層配色に切替。 */
  readonly colorBy?: CodeGraphColorBy;
}

/** 配色方式に応じたノード色を返す（layer は node.layer から、未付与は utility 色）。 */
function nodeColor(
  colorBy: CodeGraphColorBy,
  community: number,
  layer: ArchitectureLayer | undefined,
  isDark: boolean,
): string {
  return colorBy === 'layer' ? layerColor(layer, isDark) : communityColor(community);
}

// ---------------------------------------------------------------------------
// Graph builder helper
// ---------------------------------------------------------------------------

function buildSigmaGraph(props: CodeGraphCanvasViewProps): { g: InstanceType<typeof Graph>; ghostRendered: number } {
  const { graph, isDark, ghostEdges, ghostEdgeGranularity = 'commit', riskMap, colorBy = 'community' } = props;
  const g = new Graph();

  let invalidCoordCount = 0;
  for (const node of graph.nodes) {
    const hasValidXY =
      typeof node.x === 'number' && Number.isFinite(node.x) &&
      typeof node.y === 'number' && Number.isFinite(node.y);
    if (!hasValidXY) invalidCoordCount++;
    const fallbackAngle = (g.order / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
    const x = hasValidXY ? node.x : Math.cos(fallbackAngle);
    const y = hasValidXY ? node.y : Math.sin(fallbackAngle);
    const community = Number.isFinite(node.community) ? node.community : 0;
    g.addNode(node.id, {
      label: node.label,
      x,
      y,
      size: Math.max(3, Math.min((node.size ?? 0) + 4, 20)),
      color: nodeColor(colorBy, community, node.layer, isDark ?? false),
      community,
      layer: node.layer,
    });
  }

  if (invalidCoordCount > 0) {
    console.warn(
      `[CodeGraphCanvas] ${invalidCoordCount} / ${graph.nodes.length} nodes had invalid x/y; ` +
        `placed on a fallback circle. Run "Anytime Trail: Generate Code Graph" to fix.`,
    );
  }

  for (const edge of graph.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
      g.addEdge(edge.source, edge.target, { color: isDark ? '#444' : '#ccc' });
    }
  }

  const isSubagent = ghostEdgeGranularity === 'subagentType';
  const isSession = ghostEdgeGranularity === 'session';
  const ghostColor = isSubagent
    ? (isDark ? GHOST_EDGE_SUBAGENT_DARK : GHOST_EDGE_SUBAGENT_LIGHT)
    : isSession
      ? (isDark ? GHOST_EDGE_SESSION_DARK : GHOST_EDGE_SESSION_LIGHT)
      : (isDark ? GHOST_EDGE_COMMIT_DARK : GHOST_EDGE_COMMIT_LIGHT);
  const jaccardLabelPrefix = isSubagent ? 'Subagent J' : isSession ? 'Session J' : 'Temporal J';
  const confLabelPrefix = isSubagent ? 'Subagent' : isSession ? 'Session' : 'Conf';

  let ghostRendered = 0;
  for (const ge of ghostEdges ?? []) {
    if (
      !g.hasNode(ge.source) ||
      !g.hasNode(ge.target) ||
      g.hasEdge(ge.source, ge.target) ||
      g.hasEdge(ge.target, ge.source)
    ) continue;

    const conf = ge.confidenceForward;
    const sizeBase = conf ?? ge.jaccard;
    const baseAttrs = {
      color: ghostColor,
      size: 1 + sizeBase * 3,
      forceLabel: true,
      temporal: true,
    };
    if (ge.direction === 'A→B' && conf !== undefined) {
      g.addDirectedEdge(ge.source, ge.target, {
        ...baseAttrs,
        type: 'arrow',
        label: `${confLabelPrefix} ${conf.toFixed(2)} →`,
      });
    } else if (ge.direction === 'undirected' && conf !== undefined) {
      g.addEdge(ge.source, ge.target, {
        ...baseAttrs,
        label: `${confLabelPrefix} ${conf.toFixed(2)} ↔`,
      });
    } else {
      g.addEdge(ge.source, ge.target, {
        ...baseAttrs,
        size: 1 + ge.jaccard * 3,
        label: `${jaccardLabelPrefix}=${ge.jaccard.toFixed(2)}`,
      });
    }
    ghostRendered++;
  }

  if (riskMap) {
    g.forEachNode((nodeId) => {
      const score = riskMap.get(nodeId);
      if (score !== undefined) {
        g.setNodeAttribute(nodeId, 'color', riskColor(score, isDark ?? false));
      }
    });
  }

  return { g, ghostRendered };
}

function applyHighlight(
  sigma: InstanceType<typeof Sigma>,
  highlightedNodes: ReadonlySet<string> | undefined,
  isDark: boolean | undefined,
  colorBy: CodeGraphColorBy = 'community',
): void {
  const g = sigma.getGraph();
  g.forEachNode((node) => {
    const community = (g.getNodeAttribute(node, 'community') as number | undefined) ?? 0;
    const layer = g.getNodeAttribute(node, 'layer') as ArchitectureLayer | undefined;
    const fullColor = nodeColor(colorBy, community, layer, isDark ?? false);
    const dimmed = isDark ? '#333' : '#eee';
    const highlighted =
      !highlightedNodes || highlightedNodes.size === 0 || highlightedNodes.has(node);
    g.setNodeAttribute(node, 'color', highlighted ? fullColor : dimmed);
  });
  sigma.refresh();
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountCodeGraphCanvas(
  container: HTMLElement,
  initial: CodeGraphCanvasViewProps,
): VanillaViewHandle<CodeGraphCanvasViewProps> {
  let props = initial;
  let destroyed = false;
  let sigma: InstanceType<typeof Sigma> | null = null;
  let containerReady = false;
  const cleanupFns: (() => void)[] = [];

  // Inner container (matches React's `ref={containerRef}`)
  const inner = document.createElement('div');
  inner.style.cssText = 'width:100%;height:100%;';
  container.appendChild(inner);

  function initSigma(): void {
    if (!containerReady || destroyed) return;

    // Kill any existing sigma instance
    if (sigma) {
      sigma.kill();
      sigma = null;
    }

    const { g, ghostRendered } = buildSigmaGraph(props);

    // jsdom guard: Sigma requires a real canvas context
    const testCanvas = document.createElement('canvas');
    const ctx = testCanvas.getContext('2d');
    if (!ctx) {
      // jsdom environment — skip Sigma init
      return;
    }

    sigma = new Sigma(g, inner, {
      renderEdgeLabels: ghostRendered > 0,
      defaultEdgeColor: props.isDark ? '#444' : '#ccc',
      allowInvalidContainer: true,
      edgeProgramClasses: {
        arrow: EdgeArrowProgram,
      },
    });

    if (props.onNodeClick) {
      const onNodeClick = props.onNodeClick;
      sigma.on('clickNode', ({ node }: { node: string }) => onNodeClick(node));
    }

    // Apply initial highlight
    applyHighlight(sigma, props.highlightedNodes, props.isDark, props.colorBy);
  }

  // ResizeObserver (jsdom guard)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (destroyed) return;
      const ready = inner.clientWidth > 0 && inner.clientHeight > 0;
      if (ready !== containerReady) {
        containerReady = ready;
        if (ready) initSigma();
      }
    });
    ro.observe(inner);
    cleanupFns.push(() => ro.disconnect());

    // Initial check
    const ready = inner.clientWidth > 0 && inner.clientHeight > 0;
    containerReady = ready;
    if (ready) initSigma();
  }

  return {
    update(next) {
      if (destroyed) return;
      const graphChanged =
        next.graph !== props.graph ||
        next.isDark !== props.isDark ||
        next.ghostEdges !== props.ghostEdges ||
        next.ghostEdgeGranularity !== props.ghostEdgeGranularity ||
        next.riskMap !== props.riskMap ||
        next.colorBy !== props.colorBy ||
        next.onNodeClick !== props.onNodeClick;

      const highlightChanged = next.highlightedNodes !== props.highlightedNodes;
      props = next;

      if (graphChanged) {
        initSigma();
      } else if (highlightChanged && sigma) {
        applyHighlight(sigma, props.highlightedNodes, props.isDark, props.colorBy);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const fn of cleanupFns) fn();
      cleanupFns.length = 0;
      sigma?.kill();
      sigma = null;
      inner.remove();
    },
  };
}
