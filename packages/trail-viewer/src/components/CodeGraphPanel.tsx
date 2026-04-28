import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { CodeGraphCanvas } from './CodeGraphCanvas';
import { useCodeGraph } from '../hooks/useCodeGraph';

interface CodeGraphPanelProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
}

export function CodeGraphPanel({ serverUrl, isDark }: Readonly<CodeGraphPanelProps>) {
  const { graph, loading, error, refetch } = useCodeGraph(serverUrl);
  const [query, setQuery] = useState('');
  const [highlightedNodes, setHighlightedNodes] = useState<ReadonlySet<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null);
  const [repoFilter, setRepoFilter] = useState<string>('all');

  const handleSearch = useCallback(async () => {
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
  }, [serverUrl, query]);

  const handleNodeClick = useCallback(
    async (nodeId: string) => {
      try {
        const res = await fetch(`${serverUrl}/api/code-graph/explain?id=${encodeURIComponent(nodeId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { node?: CodeGraphNode };
        setSelectedNode(data.node ?? null);
      } catch (err) {
        console.error('[CodeGraphPanel] explain failed', err);
      }
    },
    [serverUrl],
  );

  const handleGenerate = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={20} />
        <Typography>グラフを読み込み中...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
        <Button onClick={refetch}>再試行</Button>
      </Box>
    );
  }

  if (!graph) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ mb: 2 }}>グラフがまだ生成されていません。</Typography>
        <Button variant="contained" onClick={handleGenerate}>
          Reload
        </Button>
      </Box>
    );
  }

  const repos = [{ id: 'all', label: 'All', path: '' }, ...graph.repositories];
  const filteredGraph: CodeGraph =
    repoFilter === 'all'
      ? graph
      : {
          ...graph,
          nodes: graph.nodes.filter((n) => n.repo === repoFilter),
          edges: graph.edges.filter((e) => {
            const sn = graph.nodes.find((n) => n.id === e.source);
            const tn = graph.nodes.find((n) => n.id === e.target);
            return sn?.repo === repoFilter && tn?.repo === repoFilter;
          }),
        };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          p: 1,
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          flexWrap: 'wrap',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <TextField
          size="small"
          placeholder="検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSearch();
          }}
          sx={{ minWidth: 200 }}
        />
        <Button size="small" variant="outlined" onClick={() => void handleSearch()}>
          検索
        </Button>
        <Button size="small" onClick={handleGenerate}>
          再読込
        </Button>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {repos.map((r) => (
            <Chip
              key={r.id}
              label={r.label}
              size="small"
              variant={repoFilter === r.id ? 'filled' : 'outlined'}
              onClick={() => setRepoFilter(r.id)}
            />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box sx={{ flex: 1 }}>
          <CodeGraphCanvas
            graph={filteredGraph}
            highlightedNodes={highlightedNodes}
            onNodeClick={(n) => void handleNodeClick(n)}
            isDark={isDark}
          />
        </Box>
        {selectedNode && (
          <Box
            sx={{
              width: 260,
              p: 2,
              borderLeft: 1,
              borderColor: 'divider',
              overflow: 'auto',
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {selectedNode.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {selectedNode.id}
            </Typography>
            <Typography variant="caption" display="block">
              リポジトリ: {selectedNode.repo}
            </Typography>
            <Typography variant="caption" display="block">
              コミュニティ: {selectedNode.communityLabel}
            </Typography>
            <Typography variant="caption" display="block">
              被参照数: {selectedNode.size}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
