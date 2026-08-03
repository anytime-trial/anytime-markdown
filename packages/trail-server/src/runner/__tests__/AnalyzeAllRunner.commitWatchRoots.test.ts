/**
 * 配線テスト: `commitWatchRoots`（設計書リポジトリ等、コミット取込だけを行う追加
 * リポジトリ）が CommitResolver / CommitFilesBackfiller にだけ届き、コード解析側
 * （CodeGraphBuilder / ReleaseResolver / CoverageImporter）へは漏れないこと。
 *
 * 背景: 設計書リポジトリが監視対象から外れていた期間、commit 取込が止まり
 * check_alignment が全件 stale を返し続けた。取込対象の配線は「静かに落ちる」ため
 * 構築時の引数を直接検査する。
 */
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AnalyzeAllRunner, mergeUnique } from '../AnalyzeAllRunner';

const constructorArgs: Record<string, unknown[]> = {};

function recordConstructor(id: string) {
  return jest.fn().mockImplementation((opts: unknown) => {
    (constructorArgs[id] ??= []).push(opts);
    return {
      id,
      tier: 2,
      subscribes: [],
      emits: [],
      onEvent: async () => undefined,
      onRunStart: async () => undefined,
      onRunEnd: async () => undefined,
      getCommitsResolved: () => 0,
    };
  });
}

jest.mock('../../lep/analyzers/primary/CommitResolver', () => ({
  CommitResolver: recordConstructor('CommitResolver'),
}));
jest.mock('../../lep/analyzers/primary/CommitFilesBackfiller', () => ({
  CommitFilesBackfiller: recordConstructor('CommitFilesBackfiller'),
}));
jest.mock('../../lep/analyzers/primary/CodeGraphBuilder', () => ({
  CodeGraphBuilder: recordConstructor('CodeGraphBuilder'),
}));
jest.mock('../../lep/analyzers/primary/ReleaseResolver', () => ({
  ReleaseResolver: recordConstructor('ReleaseResolver'),
}));

const CODE_ROOT = '/anytime-markdown';
const DOCS_ROOT = '/Shared/anytime-markdown-docs';

function makeFakeTrailDb(): TrailDatabase {
  return { save: jest.fn() } as unknown as TrailDatabase;
}

function optsFor(id: string): { gitRoots?: readonly string[] } {
  const recorded = constructorArgs[id];
  expect(recorded).toHaveLength(1);
  return recorded[0] as { gitRoots?: readonly string[] };
}

describe('AnalyzeAllRunner の commitWatchRoots 配線', () => {
  beforeEach(() => {
    for (const key of Object.keys(constructorArgs)) delete constructorArgs[key];
  });

  it('commit 取込側にだけ追加リポジトリを渡す', () => {
    new AnalyzeAllRunner({
      logSink: { appendLine: () => undefined },
      trailDb: makeFakeTrailDb(),
      gitRoots: [CODE_ROOT],
      commitWatchRoots: [DOCS_ROOT],
      stage: 'primary',
    });

    expect(optsFor('CommitResolver').gitRoots).toEqual([CODE_ROOT, DOCS_ROOT]);
    expect(optsFor('CommitFilesBackfiller').gitRoots).toEqual([CODE_ROOT, DOCS_ROOT]);
    // コード解析側は従来どおり gitRoots のみ（gitRoots[0] を primary とみなす既存挙動を保つ）
    expect(optsFor('CodeGraphBuilder').gitRoots).toEqual([CODE_ROOT]);
    expect(optsFor('ReleaseResolver').gitRoots).toEqual([CODE_ROOT]);
  });

  it('commitWatchRoots 未指定なら従来どおり gitRoots のみを渡す', () => {
    new AnalyzeAllRunner({
      logSink: { appendLine: () => undefined },
      trailDb: makeFakeTrailDb(),
      gitRoots: [CODE_ROOT],
      stage: 'primary',
    });

    expect(optsFor('CommitResolver').gitRoots).toEqual([CODE_ROOT]);
  });
});

describe('mergeUnique', () => {
  it('順序を保ち、空文字と重複を落とす', () => {
    expect(mergeUnique(['/a', '/b'], ['/b', '  ', '/c'])).toEqual(['/a', '/b', '/c']);
  });

  it('前後の空白を落として重複判定する', () => {
    expect(mergeUnique(['/a'], [' /a '])).toEqual(['/a']);
  });
});
