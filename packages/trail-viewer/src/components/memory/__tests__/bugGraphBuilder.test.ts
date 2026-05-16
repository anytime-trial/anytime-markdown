import { buildBugGraph } from '../bugGraphBuilder';
import type { MemoryBugHistoryRow } from '../../../data/types';

function makeRow(overrides: Partial<MemoryBugHistoryRow>): MemoryBugHistoryRow {
  return {
    id: 'r1',
    commitSha: 'abc1234',
    bugEntityId: 'entity-1',
    package: 'trail-viewer',
    category: 'regression',
    subjectSummary: 'Something broke',
    committedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildBugGraph', () => {
  it('returns empty graph for empty input', () => {
    const g = buildBugGraph([], true);
    expect(g.order).toBe(0);
    expect(g.size).toBe(0);
  });

  it('creates entity node and commit node for single bug', () => {
    const bugs = [makeRow({})];
    const g = buildBugGraph(bugs, true);
    expect(g.hasNode('entity-1')).toBe(true);
    expect(g.hasNode('commit:abc1234')).toBe(true);
    expect(g.order).toBe(2);
    expect(g.size).toBe(1);
  });

  it('groups multiple bugs for same entity into one entity node', () => {
    const bugs = [
      makeRow({ id: 'r1', commitSha: 'aaa0001', bugEntityId: 'entity-x' }),
      makeRow({ id: 'r2', commitSha: 'bbb0002', bugEntityId: 'entity-x' }),
    ];
    const g = buildBugGraph(bugs, true);
    const entityNodes = g.nodes().filter((n) => !n.startsWith('commit:'));
    expect(entityNodes).toHaveLength(1);
    expect(g.hasNode('entity-x')).toBe(true);
    expect(g.size).toBe(2);
  });

  it('creates separate entity nodes for different bug entities', () => {
    const bugs = [
      makeRow({ id: 'r1', bugEntityId: 'entity-a', commitSha: 'sha-a' }),
      makeRow({ id: 'r2', bugEntityId: 'entity-b', commitSha: 'sha-b' }),
    ];
    const g = buildBugGraph(bugs, true);
    expect(g.hasNode('entity-a')).toBe(true);
    expect(g.hasNode('entity-b')).toBe(true);
  });

  it('deduplicates commit nodes when same commit sha appears twice', () => {
    const bugs = [
      makeRow({ id: 'r1', bugEntityId: 'e1', commitSha: 'same-sha' }),
      makeRow({ id: 'r2', bugEntityId: 'e2', commitSha: 'same-sha' }),
    ];
    const g = buildBugGraph(bugs, false);
    const commitNodes = g.nodes().filter((n) => n.startsWith('commit:'));
    expect(commitNodes).toHaveLength(1);
  });

  it('entity node size scales with bug count', () => {
    const bugs = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `r${i}`, commitSha: `sha-${i}`, bugEntityId: 'big-entity' })
    );
    const g = buildBugGraph(bugs, true);
    const nodeAttrs = g.getNodeAttributes('big-entity');
    expect(nodeAttrs.size).toBeGreaterThan(6);
  });
});
