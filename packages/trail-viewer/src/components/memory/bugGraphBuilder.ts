import Graph from 'graphology';
import type { MemoryBugHistoryRow } from '../../data/types';

export interface BugGraphNode {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface BugGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

function entityColor(category: string, dark: boolean): string {
  switch (category) {
    case 'regression': return dark ? '#ef5350' : '#c62828';
    case 'spec': return dark ? '#42a5f5' : '#1565c0';
    case 'logic': return dark ? '#ffa726' : '#ef6c00';
    default: return dark ? '#9e9e9e' : '#616161';
  }
}

export function buildBugGraph(bugs: readonly MemoryBugHistoryRow[], dark: boolean): Graph {
  const g = new Graph({ multi: false, type: 'directed' });

  const entitySet = new Set<string>();
  bugs.forEach((bug) => {
    if (!entitySet.has(bug.bugEntityId)) {
      entitySet.add(bug.bugEntityId);
    }
  });

  const entityList = [...entitySet];
  entityList.forEach((entityId, i) => {
    const angle = (2 * Math.PI * i) / Math.max(entityList.length, 1);
    const bugsForEntity = bugs.filter((b) => b.bugEntityId === entityId);
    const category = bugsForEntity[0]?.category ?? 'unknown';
    const label = bugsForEntity[0]?.subjectSummary.slice(0, 32) ?? entityId;
    g.addNode(entityId, {
      label,
      color: entityColor(category, dark),
      x: Math.cos(angle),
      y: Math.sin(angle),
      size: 6 + Math.min(bugsForEntity.length * 2, 12),
    });
  });

  bugs.forEach((bug) => {
    const commitNodeId = `commit:${bug.commitSha}`;
    if (!g.hasNode(commitNodeId)) {
      const angle = Math.random() * 2 * Math.PI;
      g.addNode(commitNodeId, {
        label: bug.commitSha.slice(0, 7),
        color: dark ? '#78909c' : '#546e7a',
        x: 0.5 * Math.cos(angle),
        y: 0.5 * Math.sin(angle),
        size: 4,
      });
    }
    const edgeKey = `${bug.bugEntityId}->${commitNodeId}`;
    if (!g.hasEdge(edgeKey)) {
      g.addEdgeWithKey(edgeKey, bug.bugEntityId, commitNodeId, { label: bug.category });
    }
  });

  return g;
}
