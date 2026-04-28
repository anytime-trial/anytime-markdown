import { useEffect, useRef, useState } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

const COMMUNITY_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
];

interface CodeGraphCanvasProps {
  readonly graph: CodeGraph;
  readonly highlightedNodes?: ReadonlySet<string>;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly isDark?: boolean;
}

export function CodeGraphCanvas({
  graph,
  highlightedNodes,
  onNodeClick,
  isDark,
}: Readonly<CodeGraphCanvasProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  // タブが display:none の間はコンテナの幅が 0 になり sigma 初期化が失敗する。
  // ResizeObserver で可視サイズを検知してから初期化する。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => {
      const ready = el.clientWidth > 0 && el.clientHeight > 0;
      setContainerReady((prev) => (prev === ready ? prev : ready));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!containerReady || !containerRef.current) return undefined;

    const g = new Graph();
    let invalidCoordCount = 0;
    for (const node of graph.nodes) {
      // x/y が欠けているグラフ（レイアウト未実行の中間形式）でも壊さないよう、
      // 円周上に等間隔配置するフォールバックを用意する。
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
        color: COMMUNITY_COLORS[community % COMMUNITY_COLORS.length],
        community,
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

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: isDark ? '#444' : '#ccc',
      allowInvalidContainer: true,
    });

    if (onNodeClick) {
      sigma.on('clickNode', ({ node }) => onNodeClick(node));
    }

    sigmaRef.current = sigma;
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [containerReady, graph, isDark, onNodeClick]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const g = sigma.getGraph();
    g.forEachNode((node) => {
      const community = (g.getNodeAttribute(node, 'community') as number | undefined) ?? 0;
      const fullColor = COMMUNITY_COLORS[community % COMMUNITY_COLORS.length];
      const dimmed = isDark ? '#333' : '#eee';
      const highlighted =
        !highlightedNodes || highlightedNodes.size === 0 || highlightedNodes.has(node);
      g.setNodeAttribute(node, 'color', highlighted ? fullColor : dimmed);
    });
    sigma.refresh();
  }, [highlightedNodes, isDark]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
