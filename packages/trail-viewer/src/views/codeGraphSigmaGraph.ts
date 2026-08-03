/**
 * コードグラフ → graphology グラフの組み立て（sigma 非依存）。
 *
 * Why not codeGraphCanvas.ts: あちらは `sigma` を import しており、jsdom では
 * `WebGL2RenderingContext` が無く import 時点で落ちる。配色ロジックを検証可能に保つため、
 * レンダラを持たない層へ分ける（canvas 側はここで組んだグラフを sigma へ渡すだけ）。
 */
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

/**
 * ノードの配色方式。
 *
 * - `community`（既定）= コミュニティ番号
 * - `layer` = アーキテクチャ層
 * - `lastEditor` / `editFrequency` = Author Heatmap。色はノード属性から導けないため
 *   `nodeColorOverrides` で外から与える（未収録ノードは中立色のまま残る）。
 */
export type CodeGraphColorBy = 'community' | 'layer' | 'lastEditor' | 'editFrequency';

/** Author Heatmap 系の配色方式か（ノード属性ではなく外部の対応表で着色する）。 */
export function isOverrideColorBy(colorBy: CodeGraphColorBy): boolean {
  return colorBy === 'lastEditor' || colorBy === 'editFrequency';
}

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
  /**
   * ノード ID → 色の上書き（Author Heatmap 等）。`colorBy` が override 系のとき、
   * ここに無いノードは中立色のまま残り「データなし」として読める。
   */
  readonly nodeColorOverrides?: ReadonlyMap<string, string> | null;
  /** 色以外の手段でも強調するノード（属人度が高い等）。sigma の highlighted で縁取る。 */
  readonly emphasizedNodes?: ReadonlySet<string> | null;
  /** override 系配色でデータを持たないノードの中立色。 */
  readonly neutralColor?: string;
}

/** @internal 配色方式に応じたノード色を返す（layer は node.layer から、未付与は utility 色）。 */
export function nodeColor(
  colorBy: CodeGraphColorBy,
  community: number,
  layer: ArchitectureLayer | undefined,
  isDark: boolean,
  neutralColor: string,
): string {
  if (isOverrideColorBy(colorBy)) return neutralColor;
  return colorBy === 'layer' ? layerColor(layer, isDark) : communityColor(community);
}

/** override 系配色の既定中立色（呼び出し側が neutralColor を渡さない場合）。 */
export const DEFAULT_NEUTRAL_COLOR_DARK = '#3A4046';
export const DEFAULT_NEUTRAL_COLOR_LIGHT = '#D5D1C8';

// ---------------------------------------------------------------------------
// Graph builder helper
// ---------------------------------------------------------------------------

/**
 * props から sigma へ渡す graphology グラフを組み立てる。
 *
 * export しているのは検証のため。jsdom では canvas 2d コンテキストが無く Sigma 自体を
 * 初期化できないので（`initSigma` の guard）、配色の正しさはこの関数の出力で確かめる。
 */
export function buildSigmaGraph(props: CodeGraphCanvasViewProps): { g: InstanceType<typeof Graph>; ghostRendered: number } {
  const {
    graph,
    isDark,
    ghostEdges,
    ghostEdgeGranularity = 'commit',
    riskMap,
    colorBy = 'community',
    nodeColorOverrides,
    emphasizedNodes,
  } = props;
  const neutralColor =
    props.neutralColor ?? (isDark ? DEFAULT_NEUTRAL_COLOR_DARK : DEFAULT_NEUTRAL_COLOR_LIGHT);
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
      color: nodeColor(colorBy, community, node.layer, isDark ?? false, neutralColor),
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

  if (nodeColorOverrides && isOverrideColorBy(colorBy)) {
    g.forEachNode((nodeId) => {
      const color = nodeColorOverrides.get(nodeId);
      if (color !== undefined) g.setNodeAttribute(nodeId, 'color', color);
    });
  }

  if (emphasizedNodes && isOverrideColorBy(colorBy)) {
    g.forEachNode((nodeId) => {
      if (emphasizedNodes.has(nodeId)) g.setNodeAttribute(nodeId, 'highlighted', true);
    });
  }

  // 検索ハイライトの復帰色として確定色を控える。ここで控えないと applyHighlight が
  // ノード属性から色を再計算し、riskMap / nodeColorOverrides の上書きを消してしまう。
  g.forEachNode((nodeId) => {
    g.setNodeAttribute(nodeId, 'baseColor', g.getNodeAttribute(nodeId, 'color'));
  });

  return { g, ghostRendered };
}

