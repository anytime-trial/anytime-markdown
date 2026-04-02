'use client';

import { useRef, useState, useCallback } from 'react';
import type { Core, NodeSingular } from 'cytoscape';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import {
  CytoscapeCanvas,
  type CytoscapeCanvasRef,
} from '../../components/CytoscapeCanvas';
import {
  socialNetworkData,
  defaultStylesheetJsonBlock,
} from '../../components/sampleData';

type Algorithm = 'dijkstra' | 'pagerank' | 'markov';

const CLUSTER_COLORS = [
  '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0',
  '#9966ff', '#ff9f40', '#c9cbcf', '#7bc8a4',
];

export function AlgorithmDemo() {
  const cyRef = useRef<CytoscapeCanvasRef>(null);
  const [algorithm, setAlgorithm] = useState<Algorithm>('dijkstra');
  const [startNode, setStartNode] = useState<NodeSingular | null>(null);
  const [info, setInfo] = useState('');

  const resetGraph = useCallback(() => {
    const cy = cyRef.current?.getCy();
    if (!cy) return;
    cy.elements().removeClass('highlighted');
    cy.nodes().style({
      'background-color': '',
      width: '',
      height: '',
    });
    setStartNode(null);
    setInfo('');
  }, []);

  const runPageRank = useCallback((cy: Core) => {
    const result = cy.elements().pageRank({ dampingFactor: 0.8 });
    const ranks = cy.nodes().map(n => result.rank(n));
    const min = Math.min(...ranks);
    const max = Math.max(...ranks);
    const range = max - min || 1;

    for (const node of cy.nodes()) {
      const rank = result.rank(node);
      const size = 30 + ((rank - min) / range) * 50;
      node.style({ width: size, height: size });
    }
    setInfo('PageRank measures relative importance of each node based on incoming connections.');
  }, []);

  const runMarkov = useCallback((cy: Core) => {
    const clusters = cy.elements().markovClustering({});
    for (const [i, cluster] of clusters.entries()) {
      const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
      for (const ele of cluster) {
        if (ele.isNode()) {
          ele.style('background-color', color);
        }
      }
    }
    setInfo(`Found ${String(clusters.length)} clusters via Markov Clustering.`);
  }, []);

  const handleCyReady = useCallback((cy: Core) => {
    cy.on('tap', 'node', evt => {
      if (algorithm !== 'dijkstra') return;

      const tappedNode = evt.target as NodeSingular;

      setStartNode(prev => {
        if (!prev) {
          tappedNode.addClass('highlighted');
          setInfo(`Start: ${String(tappedNode.data('label'))}. Click an end node.`);
          return tappedNode;
        }

        const dijkstra = cy.elements().dijkstra({
          root: prev,
          weight: edge => (edge.data('weight') as number) || 1,
        });
        const path = dijkstra.pathTo(tappedNode);
        path.addClass('highlighted');
        setInfo(
          `Shortest path: ${String(prev.data('label'))} → ${String(tappedNode.data('label'))} (distance: ${String(dijkstra.distanceTo(tappedNode))})`,
        );
        return null;
      });
    });
  }, [algorithm]);

  const handleAlgorithmChange = (value: Algorithm) => {
    resetGraph();
    setAlgorithm(value);

    const cy = cyRef.current?.getCy();
    if (!cy) return;

    if (value === 'pagerank') {
      runPageRank(cy);
    } else if (value === 'markov') {
      runMarkov(cy);
    }
  };

  const highlightStyle = {
    selector: '.highlighted',
    style: {
      'background-color': '#50fa7b',
      'line-color': '#50fa7b',
      'target-arrow-color': '#50fa7b',
      width: 4,
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Algorithm</InputLabel>
          <Select
            value={algorithm}
            label="Algorithm"
            onChange={e => handleAlgorithmChange(e.target.value as Algorithm)}
          >
            <MenuItem value="dijkstra">Dijkstra (Shortest Path)</MenuItem>
            <MenuItem value="pagerank">PageRank</MenuItem>
            <MenuItem value="markov">Markov Clustering</MenuItem>
          </Select>
        </FormControl>

        <Button variant="outlined" size="small" onClick={resetGraph}>
          Reset
        </Button>
      </Box>

      {algorithm === 'dijkstra' && !info && (
        <Typography variant="body2" color="text.secondary">
          Click a start node, then click an end node to find the shortest path.
        </Typography>
      )}

      {info && (
        <Typography variant="body2" color="text.secondary">
          {info}
        </Typography>
      )}

      <Box sx={{ height: 500 }}>
        <CytoscapeCanvas
          ref={cyRef}
          elements={socialNetworkData}
          stylesheet={[...defaultStylesheetJsonBlock, highlightStyle]}
          layout={{ name: 'cose' }}
          onCyReady={handleCyReady}
        />
      </Box>
    </Box>
  );
}
