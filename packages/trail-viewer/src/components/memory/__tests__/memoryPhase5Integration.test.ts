/**
 * Phase 5 integration tests: verifies data-layer logic across all Memory sub-tabs.
 * No DOM rendering — tests the pure logic pipeline: fetch params → filter → display data.
 */
import { filterDriftRows } from '../driftFilter';
import { buildBugGraph } from '../bugGraphBuilder';
import { buildReviewFlowSteps } from '../reviewFlowSteps';
import { buildPipelineChartBars, groupRunsByScope } from '../pipelineChartData';
import type { MemoryDriftEventRow, MemoryBugHistoryRow, MemoryReviewHistoryRow, MemoryPipelineRunRow } from '../../../data/types';

// ---- Synthetic dataset ----

const DRIFT_EVENTS: readonly MemoryDriftEventRow[] = [
  { id: 'd1', subjectEntityId: 'e1', subjectDisplayName: 'TrailDataServer', predicate: 'has_impl', driftType: 'spec_vs_code', severity: 'error', conversationValue: null, specValue: 'expected', codeValue: 'actual', detectedAt: '2026-01-10T00:00:00.000Z', resolvedAt: null, resolutionNote: '' },
  { id: 'd2', subjectEntityId: 'e2', subjectDisplayName: 'MemoryReader', predicate: 'has_test', driftType: 'test_missing', severity: 'warn', conversationValue: null, specValue: null, codeValue: null, detectedAt: '2026-01-11T00:00:00.000Z', resolvedAt: null, resolutionNote: '' },
  { id: 'd3', subjectEntityId: 'e3', subjectDisplayName: 'BugPanel', predicate: 'has_impl', driftType: 'spec_vs_code', severity: 'info', conversationValue: null, specValue: null, codeValue: null, detectedAt: '2026-01-12T00:00:00.000Z', resolvedAt: '2026-01-15T00:00:00.000Z', resolutionNote: 'Fixed' },
  { id: 'd4', subjectEntityId: 'e4', subjectDisplayName: 'ReviewPanel', predicate: 'has_impl', driftType: 'spec_vs_code', severity: 'warn', conversationValue: null, specValue: null, codeValue: null, detectedAt: '2026-01-13T00:00:00.000Z', resolvedAt: null, resolutionNote: '' },
  { id: 'd5', subjectEntityId: 'e5', subjectDisplayName: 'PipelineRuns', predicate: 'has_test', driftType: 'test_missing', severity: 'error', conversationValue: null, specValue: null, codeValue: null, detectedAt: '2026-01-14T00:00:00.000Z', resolvedAt: null, resolutionNote: '' },
];

const BUG_HISTORY: readonly MemoryBugHistoryRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: `b${i}`,
  commitSha: `sha${i.toString().padStart(5, '0')}abc`,
  bugEntityId: i < 3 ? 'entity-regression' : i < 5 ? 'entity-spec' : `entity-other-${i}`,
  package: i < 5 ? 'trail-viewer' : 'vscode-trail-extension',
  category: i < 3 ? 'regression' : i < 5 ? 'spec' : 'logic',
  subjectSummary: `Bug fix #${i}: something broke`,
  committedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
}));

const REVIEW_HISTORY: readonly MemoryReviewHistoryRow[] = Array.from({ length: 8 }, (_, i) => ({
  id: `r${i}`,
  reviewId: `rev-${Math.floor(i / 2)}`,
  title: `Review ${Math.floor(i / 2)}`,
  reviewedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  targetFilePath: i % 2 === 0 ? `src/file${i}.ts` : null,
  category: i < 4 ? 'security' : 'performance',
  severity: i < 2 ? 'error' : i < 6 ? 'warn' : 'info',
  findingText: `Finding text for item ${i}`,
  addressedCommitSha: i % 3 === 0 ? `addr${i}sha` : null,
  addressedAt: i % 3 === 0 ? `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` : null,
}));

const PIPELINE_RUNS: readonly MemoryPipelineRunRow[] = ['drift', 'spec', 'code', 'bug_history', 'review'].flatMap((scope, si) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `run-${scope}-${i}`,
    scope,
    startedAt: `2026-01-${String(si * 4 + i + 1).padStart(2, '0')}T10:00:00.000Z`,
    completedAt: `2026-01-${String(si * 4 + i + 1).padStart(2, '0')}T10:00:${String(10 + i).padStart(2, '0')}.000Z`,
    status: i === 3 ? 'error' : 'success',
    itemsProcessed: 5 + i,
    errorMessage: i === 3 ? 'timeout' : null,
  }))
);

// ---- Drift tab ----

describe('Phase 5 integration: Drift tab', () => {
  it('shows all 5 drift events without filters', () => {
    const result = filterDriftRows(DRIFT_EVENTS, { unresolvedOnly: false, severityFilter: '', typeFilter: '' });
    expect(result).toHaveLength(5);
  });

  it('unresolvedOnly=true excludes resolved event d3', () => {
    const result = filterDriftRows(DRIFT_EVENTS, { unresolvedOnly: true, severityFilter: '', typeFilter: '' });
    expect(result).toHaveLength(4);
    expect(result.some((r) => r.id === 'd3')).toBe(false);
  });

  it('severity=error filter shows 2 events', () => {
    const result = filterDriftRows(DRIFT_EVENTS, { unresolvedOnly: false, severityFilter: 'error', typeFilter: '' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.severity === 'error')).toBe(true);
  });

  it('type=test_missing filter shows 2 events', () => {
    const result = filterDriftRows(DRIFT_EVENTS, { unresolvedOnly: false, severityFilter: '', typeFilter: 'test_missing' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.driftType === 'test_missing')).toBe(true);
  });

  it('unresolvedOnly + error severity shows d1 and d5 only', () => {
    const result = filterDriftRows(DRIFT_EVENTS, { unresolvedOnly: true, severityFilter: 'error', typeFilter: '' });
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(['d1', 'd5']);
  });
});

// ---- Bug History tab ----

describe('Phase 5 integration: Bug History tab', () => {
  it('builds graph from 10 bug records', () => {
    const g = buildBugGraph(BUG_HISTORY, true);
    expect(g.order).toBeGreaterThan(0);
    expect(g.size).toBeGreaterThan(0);
  });

  it('entity-regression entity appears in graph', () => {
    const g = buildBugGraph(BUG_HISTORY, true);
    expect(g.hasNode('entity-regression')).toBe(true);
  });

  it('regression entity has larger size than single-commit entities', () => {
    const g = buildBugGraph(BUG_HISTORY, true);
    const regressionSize = g.getNodeAttribute('entity-regression', 'size') as number;
    const singleSize = g.getNodeAttribute('entity-other-5', 'size') as number;
    expect(regressionSize).toBeGreaterThan(singleSize);
  });

  it('trail-viewer package has 5 bugs', () => {
    const tvBugs = BUG_HISTORY.filter((b) => b.package === 'trail-viewer');
    expect(tvBugs).toHaveLength(5);
  });

  it('grouped by scope: regression has 3 commits', () => {
    const regressionBugs = BUG_HISTORY.filter((b) => b.bugEntityId === 'entity-regression');
    expect(regressionBugs).toHaveLength(3);
  });
});

// ---- Review tab ----

describe('Phase 5 integration: Review tab', () => {
  it('3 of 8 findings are addressed (every 3rd)', () => {
    const addressed = REVIEW_HISTORY.filter((r) => r.addressedCommitSha != null);
    expect(addressed).toHaveLength(3);
  });

  it('review flow for addressed finding has 3 completed steps', () => {
    const addressed = REVIEW_HISTORY.find((r) => r.addressedCommitSha != null)!;
    const steps = buildReviewFlowSteps(addressed, {
      review: 'Review',
      findingLabel: 'Finding',
      addressed: 'Addressed',
      notAddressed: 'Not addressed',
    });
    expect(steps.filter((s) => s.completed)).toHaveLength(3);
  });

  it('review flow for unaddressed finding has 2 completed steps', () => {
    const unaddressed = REVIEW_HISTORY.find((r) => r.addressedCommitSha == null)!;
    const steps = buildReviewFlowSteps(unaddressed, {
      review: 'Review',
      findingLabel: 'Finding',
      addressed: 'Addressed',
      notAddressed: 'Not addressed',
    });
    expect(steps.filter((s) => s.completed)).toHaveLength(2);
    expect(steps[2].label).toBe('Not addressed');
  });

  it('severity filter: 2 error findings', () => {
    const errors = REVIEW_HISTORY.filter((r) => r.severity === 'error');
    expect(errors).toHaveLength(2);
  });
});

// ---- Pipeline Runs tab ----

describe('Phase 5 integration: Pipeline Runs tab', () => {
  it('builds 20 chart bars from 20 runs', () => {
    const bars = buildPipelineChartBars(PIPELINE_RUNS);
    expect(bars).toHaveLength(20);
  });

  it('each bar has positive duration', () => {
    const bars = buildPipelineChartBars(PIPELINE_RUNS);
    expect(bars.every((b) => b.durationMs >= 0)).toBe(true);
  });

  it('groups into 5 scopes', () => {
    const grouped = groupRunsByScope(PIPELINE_RUNS);
    expect(grouped.size).toBe(5);
  });

  it('each scope has 4 runs', () => {
    const grouped = groupRunsByScope(PIPELINE_RUNS);
    for (const [, runs] of grouped) {
      expect(runs).toHaveLength(4);
    }
  });

  it('error runs have status=error', () => {
    const errBars = buildPipelineChartBars(PIPELINE_RUNS).filter((b) => b.status === 'error');
    expect(errBars).toHaveLength(5);
  });
});
