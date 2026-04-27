import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!containerRef.current) return;

    const g = new Graph();
    for (const node of graph.nodes) {
      g.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: Math.max(3, Math.min(node.size + 4, 20)),
        color: COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length],
        community: node.community,
      });
    }
    for (const edge of graph.edges) {
      if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, { color: isDark ? '#444' : '#ccc' });
      }
    }

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: isDark ? '#444' : '#ccc',
    });

    if (onNodeClick) {
      sigma.on('clickNode', ({ node }) => onNodeClick(node));
    }

    sigmaRef.current = sigma;
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph, isDark, onNodeClick]);

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
