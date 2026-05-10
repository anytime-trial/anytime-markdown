import type { C4Element } from '@anytime-markdown/trail-core/c4';
import type { FileAnalysisApiEntry } from '../../hooks/fetchFileAnalysisApi';
import { fileAnalysisEntriesForElement } from '../fileAnalysisEntriesForElement';

const makeElement = (id: string, type: C4Element['type'] = 'component'): C4Element => ({
  id,
  name: id,
  type,
  description: '',
  external: false,
});

const makeEntry = (filePath: string): FileAnalysisApiEntry => ({
  filePath,
  importanceScore: 10,
  fanInTotal: 0,
  cognitiveComplexityMax: 0,
  lineCount: 0,
  functionCount: 1,
  deadCodeScore: 25,
  signals: {
    orphan: false,
    fanInZero: true,
    noRecentChurn: false,
    zeroCoverage: false,
    isolatedCommunity: false,
  },
  isIgnored: false,
  ignoreReason: '',
  centralityScore: 0,
  crossPkgInCount: 0,
  externalConsumerPkgs: 0,
  isBarrel: false,
});

describe('fileAnalysisEntriesForElement', () => {
  const elements: C4Element[] = [
    makeElement('file::packages/trail-viewer/src/foo.ts', 'code'),
    makeElement('file::packages/trail-viewer/src/bar.ts', 'code'),
    makeElement('pkg_trail-viewer', 'component'),
  ];

  it('returns entries whose filePath maps to the given elementId via exact match', () => {
    const entries: FileAnalysisApiEntry[] = [
      makeEntry('packages/trail-viewer/src/foo.ts'),
      makeEntry('packages/trail-viewer/src/bar.ts'),
    ];

    const result = fileAnalysisEntriesForElement(
      entries,
      'file::packages/trail-viewer/src/foo.ts',
      elements,
    );

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('packages/trail-viewer/src/foo.ts');
  });

  it('returns entries matching via package fallback', () => {
    const entries: FileAnalysisApiEntry[] = [
      makeEntry('packages/trail-viewer/src/unknown.ts'),
    ];

    const result = fileAnalysisEntriesForElement(
      entries,
      'pkg_trail-viewer',
      elements,
    );

    // package fallback: packages/trail-viewer/... -> pkg_trail-viewer
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('packages/trail-viewer/src/unknown.ts');
  });

  it('returns empty array when no entries match', () => {
    const entries: FileAnalysisApiEntry[] = [
      makeEntry('packages/other-pkg/src/something.ts'),
    ];

    const result = fileAnalysisEntriesForElement(
      entries,
      'file::packages/trail-viewer/src/foo.ts',
      elements,
    );

    expect(result).toHaveLength(0);
  });

  it('returns empty array when entries is empty', () => {
    const result = fileAnalysisEntriesForElement([], 'pkg_trail-viewer', elements);
    expect(result).toHaveLength(0);
  });
});
