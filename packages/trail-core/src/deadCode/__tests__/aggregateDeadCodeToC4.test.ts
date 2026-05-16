import { aggregateDeadCodeToC4 } from '../aggregateDeadCodeToC4';
import type { FileAnalysisRow } from '../types';
import type { C4Element } from '../../domain/engine/c4Mapper';

const row = (filePath: string, score: number, ignored = false): FileAnalysisRow => ({
  repoName: 'r',
  filePath,
  importanceScore: 0,
  fanInTotal: 0,
  cognitiveComplexityMax: 0,
  lineCount: 0,
  cyclomaticComplexityMax: 0,
  functionCount: 0,
  deadCodeScore: ignored ? 0 : score,  // ignored ファイルはスコア 0 で永続化される想定
  signals: {
    orphan: false, fanInZero: false, noRecentChurn: false,
    zeroCoverage: false, isolatedCommunity: false,
  },
  isIgnored: ignored,
  ignoreReason: ignored ? 'user:**/*.config.ts' : '',
  crossPkgInCount: 0,
  externalConsumerPkgs: 0,
  totalInCount: 0,
  isBarrel: false,
  centralityScore: 0,
  category: 'logic',
  analyzedAt: '2026-05-05T00:00:00Z',
});

const elements: readonly C4Element[] = [
  { id: 'pkg_a', type: 'container', name: 'a' },
];

describe('aggregateDeadCodeToC4', () => {
  it('要素単位で max スコア', () => {
    const m = aggregateDeadCodeToC4(
      [row('packages/a/foo.ts', 70), row('packages/a/bar.ts', 30)],
      elements,
    );
    expect(m.get('pkg_a')).toBe(70);
  });

  it('isIgnored ファイル (deadCodeScore=0) は集約から除外される', () => {
    const m = aggregateDeadCodeToC4(
      [row('packages/a/foo.ts', 0, true), row('packages/a/bar.ts', 30)],
      elements,
    );
    expect(m.get('pkg_a')).toBe(30);
  });

  it('スコア 0 のファイルしかなければ要素はマップされない', () => {
    const m = aggregateDeadCodeToC4([row('packages/a/foo.ts', 0)], elements);
    expect(m.size).toBe(0);
  });

  it('system 要素は除外される', () => {
    const sysAndContainer: readonly C4Element[] = [
      { id: 'sys_root', type: 'system', name: 'root' },
      { id: 'pkg_a', type: 'container', name: 'a', boundaryId: 'sys_root' },
    ];
    const m = aggregateDeadCodeToC4([row('packages/a/foo.ts', 80)], sysAndContainer);
    expect(m.get('pkg_a')).toBe(80);
    expect(m.has('sys_root')).toBe(false);
  });

  it('boundaryId チェーンに沿って親要素にも伝播する (viewer 側で level 絞込前提)', () => {
    const hierarchy: readonly C4Element[] = [
      { id: 'pkg_a', type: 'container', name: 'a' },
      { id: 'comp_x', type: 'component', name: 'x', boundaryId: 'pkg_a' },
      { id: 'file::packages/a/foo.ts', type: 'code', name: 'foo.ts', boundaryId: 'comp_x' },
    ];
    const m = aggregateDeadCodeToC4([row('packages/a/foo.ts', 80)], hierarchy);
    expect(m.get('file::packages/a/foo.ts')).toBe(80);
    expect(m.get('comp_x')).toBe(80);
    expect(m.get('pkg_a')).toBe(80);
  });
});
