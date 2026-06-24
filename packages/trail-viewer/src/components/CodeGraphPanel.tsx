import { useCallback, useMemo, useState } from 'react';
import type { CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { type CodeGraphGhostEdge } from './CodeGraphCanvas';
import { useCodeGraph } from '../hooks/useCodeGraph';
import { useTemporalCoupling } from '../c4/hooks/useTemporalCoupling';
import type { TemporalCouplingControlsValue } from '../c4/components/overlays/TemporalCouplingControls';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountCodeGraphPanel, type CodeGraphPanelProps as VanillaProps } from '../views/codeGraphPanel';
import { useTrailI18n } from '../i18n';
import type { TrailI18n } from '../i18n';

function toCodeGraphNodeId(repoId: string, filePath: string): string {
  const cleaned = filePath.replace(/\.(tsx?|mdx?)$/, '');
  return `${repoId}:${cleaned}`;
}

const DEFAULT_TC_VALUE: TemporalCouplingControlsValue = {
  enabled: false,
  windowDays: 30,
  threshold: 0.5,
  topK: 50,
  directional: false,
  confidenceThreshold: 0.5,
  directionalDiff: 0.3,
  granularity: 'commit',
};

interface CodeGraphPanelProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
  readonly tcValue?: TemporalCouplingControlsValue;
  readonly repoName?: string;
}

export function CodeGraphPanel({ serverUrl, isDark, tcValue: tcValueProp, repoName }: Readonly<CodeGraphPanelProps>): React.ReactElement {
  const { graph, loading, error, refetch } = useCodeGraph(serverUrl, {
    repo: repoName,
    enabled: !!repoName,
  });
  const [highlightedNodes, setHighlightedNodes] = useState<ReadonlySet<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null);
  const tcValue = tcValueProp ?? DEFAULT_TC_VALUE;

  const tcRepoId = useMemo<string | null>(() => {
    if (!graph || graph.repositories.length === 0) return null;
    return graph.repositories[0]?.id ?? null;
  }, [graph]);

  const {
    edges: rawGhostEdges,
    directional: tcDirectional,
    granularity: tcGranularity,
  } = useTemporalCoupling({
    enabled: tcValue.enabled && !!tcRepoId,
    serverUrl,
    repoName: tcRepoId ?? '',
    windowDays: tcValue.windowDays,
    threshold: tcValue.threshold,
    topK: tcValue.topK,
    directional: tcValue.directional,
    confidenceThreshold: tcValue.confidenceThreshold,
    directionalDiff: tcValue.directionalDiff,
    granularity: tcValue.granularity,
  });

  const showSubagentDirectionalHint = useMemo<boolean>(() => {
    if (!tcValue.enabled) return false;
    if (tcGranularity !== 'subagentType') return false;
    if (!tcDirectional) return false;
    if (rawGhostEdges.length === 0) return false;
    return rawGhostEdges.every(
      (e) => !('direction' in e) || e.direction !== 'A→B',
    );
  }, [tcValue.enabled, tcGranularity, tcDirectional, rawGhostEdges]);

  const ghostEdges = useMemo<CodeGraphGhostEdge[]>(() => {
    if (!tcRepoId) return [];
    return rawGhostEdges.map((e) => {
      const base: CodeGraphGhostEdge = {
        source: toCodeGraphNodeId(tcRepoId, e.source),
        target: toCodeGraphNodeId(tcRepoId, e.target),
        jaccard: e.jaccard,
        coChangeCount: e.coChangeCount,
      };
      if ('direction' in e) {
        return {
          ...base,
          direction: e.direction,
          confidenceForward: e.confidenceForward,
          confidenceBackward: e.confidenceBackward,
        };
      }
      return base;
    });
  }, [rawGhostEdges, tcRepoId]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHighlightedNodes(new Set());
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/code-graph/query?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { nodes: string[] };
      setHighlightedNodes(new Set(data.nodes));
    } catch (err) {
      console.error('[CodeGraphPanel] search failed', err);
    }
  }, [serverUrl]);

  const handleNodeClick = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/code-graph/explain?id=${encodeURIComponent(nodeId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { node?: CodeGraphNode };
      setSelectedNode(data.node ?? null);
    } catch (err) {
      console.error('[CodeGraphPanel] explain failed', err);
    }
  }, [serverUrl]);

  // Build graphState for vanilla view
  const graphState = useMemo<VanillaProps['graphState']>(() => {
    if (loading) return { status: 'loading' };
    if (error) return { status: 'error', message: error };
    if (!repoName) return { status: 'no-repo' };
    if (!graph) return { status: 'no-graph' };
    return { status: 'ready', graph };
  }, [loading, error, repoName, graph]);

  const { t: translate } = useTrailI18n();
  const t = useCallback((key: string): string => translate(key as keyof TrailI18n), [translate]);

  const viewProps: VanillaProps = {
    graphState,
    highlightedNodes,
    selectedNode,
    showSubagentDirectionalHint,
    ghostEdges,
    ghostEdgesEnabled: tcValue.enabled,
    ghostEdgeGranularity: tcGranularity,
    isDark,
    onSearch: (q) => void handleSearch(q),
    onRefetch: refetch,
    onNodeClick: (n) => void handleNodeClick(n),
    communitySummaries: graph?.communitySummaries,
    t,
  };

  return <VanillaIsland mount={mountCodeGraphPanel} props={viewProps} />;
}
