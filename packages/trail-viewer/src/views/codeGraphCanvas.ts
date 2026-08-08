/**
 * CodeGraphCanvas vanilla view.
 *
 * Mounts a Sigma.js graph renderer for the code dependency graph.
 * Mirrors `components/CodeGraphCanvas.tsx` without React — follows
 * the graphCanvas.ts vanilla factory pattern:
 *   - ResizeObserver with jsdom guard (typeof ResizeObserver !== 'undefined')
 *   - All listeners registered + tracked, destroyed on destroy()
 *   - destroyed guard to skip any post-destroy callbacks
 *
 * グラフの組み立てと配色は sigma 非依存の `codeGraphSigmaGraph.ts` にある
 * （jsdom では sigma を import できないため。検証はあちらで行う）。
 */
import Sigma from 'sigma';
import { EdgeArrowProgram } from 'sigma/rendering';
import type { ArchitectureLayer } from '@anytime-markdown/trail-activity/codeGraph';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import {
  buildSigmaGraph,
  DEFAULT_NEUTRAL_COLOR_DARK,
  DEFAULT_NEUTRAL_COLOR_LIGHT,
  needsGraphRebuild,
  nodeColor,
  type CodeGraphCanvasViewProps,
  type CodeGraphColorBy,
} from './codeGraphSigmaGraph';

export {
  buildSigmaGraph,
  COMMUNITY_COLORS,
  isOverrideColorBy,
  riskColor,
} from './codeGraphSigmaGraph';
export type {
  CodeGraphCanvasViewProps,
  CodeGraphColorBy,
  CodeGraphGhostEdge,
  CodeGraphGhostEdgeGranularity,
} from './codeGraphSigmaGraph';

function applyHighlight(
  sigma: InstanceType<typeof Sigma>,
  highlightedNodes: ReadonlySet<string> | undefined,
  isDark: boolean | undefined,
  colorBy: CodeGraphColorBy = 'community',
  neutralColor?: string,
): void {
  const g = sigma.getGraph();
  const fallbackNeutral =
    neutralColor ?? (isDark ? DEFAULT_NEUTRAL_COLOR_DARK : DEFAULT_NEUTRAL_COLOR_LIGHT);
  g.forEachNode((node) => {
    const community = (g.getNodeAttribute(node, 'community') as number | undefined) ?? 0;
    const layer = g.getNodeAttribute(node, 'layer') as ArchitectureLayer | undefined;
    // 上書き配色（riskMap / Author Heatmap）を消さないよう、確定色を優先して戻す。
    const baseColor = g.getNodeAttribute(node, 'baseColor') as string | undefined;
    const fullColor =
      baseColor ?? nodeColor(colorBy, community, layer, isDark ?? false, fallbackNeutral);
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
    applyHighlight(sigma, props.highlightedNodes, props.isDark, props.colorBy, props.neutralColor);
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
      const graphChanged = needsGraphRebuild(props, next);
      const highlightChanged = next.highlightedNodes !== props.highlightedNodes;
      props = next;

      if (graphChanged) {
        initSigma();
      } else if (highlightChanged && sigma) {
        applyHighlight(sigma, props.highlightedNodes, props.isDark, props.colorBy, props.neutralColor);
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
