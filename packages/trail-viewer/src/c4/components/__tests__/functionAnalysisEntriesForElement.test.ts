import type { C4Element } from '@anytime-markdown/trail-core/c4';
import type { FunctionAnalysisApiEntry } from '../../hooks/fetchFunctionAnalysisApi';
import { functionAnalysisEntriesForElement } from '../functionAnalysisEntriesForElement';

const makeElement = (id: string, type: C4Element['type'] = 'component'): C4Element => ({
  id,
  name: id,
  type,
  description: '',
  external: false,
});

const makeEntry = (filePath: string, functionName: string): FunctionAnalysisApiEntry => ({
  filePath,
  functionName,
  startLine: 1,
  endLine: 10,
  language: 'typescript',
  fanIn: 0,
  fanOut: 0,
  distinctCallees: 0,
  cognitiveComplexity: 0,
  dataMutationScore: 0,
  sideEffectScore: 0,
  lineCount: 10,
  importanceScore: 0,
  functionRole: 'peripheral',
  signals: { fanInZero: true },
});

describe('functionAnalysisEntriesForElement', () => {
  const elements: C4Element[] = [
    makeElement('file::packages/trail-viewer/src/foo.ts', 'code'),
    makeElement('pkg_trail-viewer', 'component'),
    makeElement('sys_root', 'system'),
  ];

  it('returns empty array when entries is empty', () => {
    const result = functionAnalysisEntriesForElement([], 'pkg_trail-viewer', elements);
    expect(result).toHaveLength(0);
  });

  it('returns 3 functions for an element that contains 3 functions in one file', () => {
    const entries: FunctionAnalysisApiEntry[] = [
      makeEntry('packages/trail-viewer/src/foo.ts', 'a'),
      makeEntry('packages/trail-viewer/src/foo.ts', 'b'),
      makeEntry('packages/trail-viewer/src/foo.ts', 'c'),
    ];

    const result = functionAnalysisEntriesForElement(
      entries,
      'file::packages/trail-viewer/src/foo.ts',
      elements,
    );

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.functionName).sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not include functions from other elements', () => {
    const entries: FunctionAnalysisApiEntry[] = [
      makeEntry('packages/trail-viewer/src/foo.ts', 'inFoo'),
      makeEntry('packages/other-pkg/src/bar.ts', 'inBar'),
    ];

    const result = functionAnalysisEntriesForElement(
      entries,
      'file::packages/trail-viewer/src/foo.ts',
      elements,
    );

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe('inFoo');
  });

  it('returns empty array when given a system element (no file mapping)', () => {
    const entries: FunctionAnalysisApiEntry[] = [
      makeEntry('packages/trail-viewer/src/foo.ts', 'inFoo'),
    ];

    const result = functionAnalysisEntriesForElement(entries, 'sys_root', elements);
    expect(result).toHaveLength(0);
  });
});
