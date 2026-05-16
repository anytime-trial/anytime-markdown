import {
  DEFAULT_TOUR_SIZE,
  describeEntry,
  selectTourTargets,
} from '../canvas/tourTargets';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

function entry(
  functionName: string,
  extras: Partial<FunctionAnalysisApiEntry> = {},
): FunctionAnalysisApiEntry {
  return {
    filePath: `pkg/${functionName}.ts`,
    functionName,
    startLine: 1,
    endLine: 10,
    language: 'ts',
    fanIn: 0,
    fanOut: 0,
    distinctCallees: 0,
    cognitiveComplexity: 0,
    dataMutationScore: 0,
    sideEffectScore: 0,
    lineCount: 10,
    importanceScore: 0,
    functionRole: 'leaf',
    signals: { fanInZero: false },
    ...extras,
  };
}

describe('describeEntry', () => {
  test('includes role', () => {
    expect(describeEntry(entry('f', { functionRole: 'hub' }))).toContain('Role: hub.');
  });

  test('mentions fanIn for hub roles', () => {
    expect(describeEntry(entry('f', { functionRole: 'hub', fanIn: 15 }))).toContain(
      'Used from 15 places.',
    );
  });

  test('mentions heavy fanIn for non-hub roles', () => {
    const text = describeEntry(entry('f', { functionRole: 'orchestrator', fanIn: 22 }));
    expect(text).toContain('Heavily used (fanIn=22).');
  });

  test('mentions fanOut when it exceeds 5', () => {
    expect(describeEntry(entry('f', { fanOut: 8 }))).toContain('Calls 8 other functions.');
  });

  test('mentions high complexity', () => {
    expect(describeEntry(entry('f', { cognitiveComplexity: 20 }))).toContain(
      'High complexity (CC=20).',
    );
  });

  test('mentions moderate complexity', () => {
    expect(describeEntry(entry('f', { cognitiveComplexity: 10 }))).toContain(
      'Moderate complexity (CC=10).',
    );
  });

  test('mentions large size', () => {
    expect(describeEntry(entry('f', { lineCount: 200 }))).toContain('Large function (200 lines).');
  });
});

describe('selectTourTargets', () => {
  test('returns at most size entries (default 10)', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry(`f${i}`, { importanceScore: i }),
    );
    const tour = selectTourTargets(entries);
    expect(tour).toHaveLength(DEFAULT_TOUR_SIZE);
    // Highest importanceScore (=19) comes first
    expect(tour[0]?.entry.functionName).toBe('f19');
    expect(tour[0]?.index).toBe(1);
    expect(tour[0]?.total).toBe(DEFAULT_TOUR_SIZE);
  });

  test('respects custom size', () => {
    const entries = [entry('a', { importanceScore: 1 }), entry('b', { importanceScore: 2 })];
    expect(selectTourTargets(entries, 1)).toHaveLength(1);
    expect(selectTourTargets(entries, 5)).toHaveLength(2);
  });

  test('orders by importanceScore desc', () => {
    const entries = [
      entry('low', { importanceScore: 1 }),
      entry('high', { importanceScore: 100 }),
      entry('mid', { importanceScore: 50 }),
    ];
    const names = selectTourTargets(entries).map((s) => s.entry.functionName);
    expect(names).toEqual(['high', 'mid', 'low']);
  });

  test('tie-breaks by role priority then fanIn', () => {
    const entries = [
      entry('leafA', { importanceScore: 10, functionRole: 'leaf', fanIn: 5 }),
      entry('hubA', { importanceScore: 10, functionRole: 'hub', fanIn: 3 }),
      entry('hubB', { importanceScore: 10, functionRole: 'hub', fanIn: 7 }),
    ];
    const names = selectTourTargets(entries).map((s) => s.entry.functionName);
    // Both hubs come before the leaf; among hubs, fanIn=7 first
    expect(names).toEqual(['hubB', 'hubA', 'leafA']);
  });

  test('deduplicates by (filePath, functionName)', () => {
    const dup = entry('f', { importanceScore: 5 });
    const tour = selectTourTargets([dup, { ...dup, importanceScore: 4 }]);
    expect(tour).toHaveLength(1);
  });

  test('attaches index/total/description to each step', () => {
    const tour = selectTourTargets([
      entry('a', { importanceScore: 2, functionRole: 'hub', fanIn: 5 }),
      entry('b', { importanceScore: 1 }),
    ]);
    expect(tour[0]?.index).toBe(1);
    expect(tour[0]?.total).toBe(2);
    expect(tour[0]?.description).toContain('Role: hub.');
    expect(tour[1]?.index).toBe(2);
  });

  test('empty input returns empty array', () => {
    expect(selectTourTargets([])).toEqual([]);
  });
});
