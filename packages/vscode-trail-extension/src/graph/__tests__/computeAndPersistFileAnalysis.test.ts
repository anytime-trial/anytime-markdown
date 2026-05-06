/**
 * computeAndPersistFileAnalysis のユニットテスト。
 *
 * TrailDatabase の実装は最小限のモックに置き換え、
 * シグナル計算・ファイル行生成・ウォッシュ方式保存の動作を検証する。
 */

import { computeAndPersistFileAnalysis } from '../computeAndPersistFileAnalysis';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { FileAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

// ---------------------------------------------------------------------------
// ヘルパー型
// ---------------------------------------------------------------------------

type MockTrailDb = {
  getCurrentCodeGraph: jest.Mock;
  getCurrentCoverage: jest.Mock;
  getCommitFilesChurnSince: jest.Mock;
  clearCurrentFileAnalysis: jest.Mock;
  upsertCurrentFileAnalysis: jest.Mock;
  clearCurrentFunctionAnalysis: jest.Mock;
  upsertCurrentFunctionAnalysis: jest.Mock;
};

// ---------------------------------------------------------------------------
// ファクトリ
// ---------------------------------------------------------------------------

function makeMinimalCodeGraph(overrides: Partial<CodeGraph> = {}): CodeGraph {
  return {
    generatedAt: '2026-05-05T00:00:00.000Z',
    repositories: [{ id: 'repo', label: 'repo', path: '/root' }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
    ...overrides,
  };
}

function makeMockDb(overrides: Partial<MockTrailDb> = {}): MockTrailDb {
  return {
    getCurrentCodeGraph: jest.fn().mockReturnValue(null),
    getCurrentCoverage: jest.fn().mockReturnValue([]),
    getCommitFilesChurnSince: jest.fn().mockReturnValue(new Map()),
    clearCurrentFileAnalysis: jest.fn(),
    upsertCurrentFileAnalysis: jest.fn(),
    clearCurrentFunctionAnalysis: jest.fn(),
    upsertCurrentFunctionAnalysis: jest.fn(),
    ...overrides,
  };
}

const ANALYSIS_ROOT = '/root';
const REPO_NAME = 'repo';

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('computeAndPersistFileAnalysis', () => {
  it('scored が空でコードグラフなしのとき、行数 0 で洗い替えが呼ばれる', async () => {
    const db = makeMockDb();
    const result = await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      lineCountByFile: new Map(),
    });

    expect(result.fileRows).toBe(0);
    expect(result.functionRows).toBe(0);
    // 洗い替えメソッドが呼ばれること
    expect(db.clearCurrentFileAnalysis).toHaveBeenCalledWith(REPO_NAME);
    expect(db.upsertCurrentFileAnalysis).toHaveBeenCalledWith([]);
    expect(db.clearCurrentFunctionAnalysis).toHaveBeenCalledWith(REPO_NAME);
    expect(db.upsertCurrentFunctionAnalysis).toHaveBeenCalledWith([]);
  });

  it('CodeGraph に孤立ノード 1 件 → orphan=true, deadCodeScore=45', async () => {
    // ノード "repo:packages/core/src/a" が存在し in-degree=0（orphan）。
    // lineCountByFile に対応する .ts エントリがあるとき、拡張子復元して登録する。
    const graph = makeMinimalCodeGraph({
      nodes: [
        {
          id: 'repo:packages/core/src/a',
          label: 'a',
          repo: 'repo',
          package: 'core',
          fileType: 'code',
          community: 0,
          communityLabel: 'c0',
          x: 0,
          y: 0,
          size: 0,
        },
      ],
      edges: [],
    });

    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
    });

    let capturedRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedRows = rows;
    });

    const result = await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      lineCountByFile: new Map([['packages/core/src/a.ts', 12]]),
    });

    // CodeGraph ノード由来のファイルが 1 件追加される
    expect(result.fileRows).toBe(1);
    expect(capturedRows).toHaveLength(1);

    const row = capturedRows[0];
    // .ts 拡張子が復元されたパスで登録される
    expect(row.filePath).toBe('packages/core/src/a.ts');
    expect(row.lineCount).toBe(12);
    expect(row.signals.orphan).toBe(true);
    // functionCount=0 なので fanInZero は false
    expect(row.signals.fanInZero).toBe(false);
    // ノードが 1 件だけ → コミュニティサイズ=1（≤3）→ isolatedCommunity=true
    expect(row.signals.isolatedCommunity).toBe(true);
    // deadCodeScore = orphan(45) + isolatedCommunity(5) = 50
    expect(row.deadCodeScore).toBe(50);
  });

  it('CodeGraph node が lineCountByFile に対応エントリを持たない場合は skip', async () => {
    // stale な node や doc 等は登録対象外
    const graph = makeMinimalCodeGraph({
      nodes: [
        {
          id: 'repo:packages/stale/removed',
          label: 'removed',
          repo: 'repo',
          package: 'stale',
          fileType: 'code',
          community: 0,
          communityLabel: 'c0',
          x: 0, y: 0, size: 0,
        },
        {
          id: 'repo:packages/docs/README',
          label: 'README',
          repo: 'repo',
          package: 'docs',
          fileType: 'document',
          community: 0,
          communityLabel: 'c0',
          x: 0, y: 0, size: 0,
        },
      ],
      edges: [],
    });
    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
    });

    let capturedRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedRows = rows;
    });

    const result = await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      // どちらの node にも対応するエントリが無い
      lineCountByFile: new Map(),
    });

    expect(result.fileRows).toBe(0);
    expect(capturedRows).toHaveLength(0);
  });

  it('scored ありのとき functionRows に全関数が含まれる', async () => {
    const fn: ScoredFunction = {
      id: 'file::/root/packages/core/src/foo.ts::myFunc',
      name: 'myFunc',
      filePath: '/root/packages/core/src/foo.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
      metrics: {
        fanIn: 3,
        cognitiveComplexity: 5,
        cyclomaticComplexity: 4,
        dataMutationScore: 1,
        sideEffectScore: 0,
        lineCount: 10,
      },
      importanceScore: 60,
    };

    const db = makeMockDb();

    const result = await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [fn],
      lineCountByFile: new Map(),
    });

    expect(result.functionRows).toBe(1);

    const fnRows = db.upsertCurrentFunctionAnalysis.mock.calls[0][0];
    expect(fnRows).toHaveLength(1);
    expect(fnRows[0].functionName).toBe('myFunc');
    // filePath は analysisRoot からの相対パス
    expect(fnRows[0].filePath).toBe('packages/core/src/foo.ts');
    expect(fnRows[0].importanceScore).toBe(60);
    expect(fnRows[0].fanIn).toBe(3);
    // fanIn>0 なので signalFanInZero=false
    expect(fnRows[0].signalFanInZero).toBe(false);
  });

  it('fanIn=0 の関数は signalFanInZero=true かつファイル行の fanInZero=true', async () => {
    const fn: ScoredFunction = {
      id: 'file::/root/packages/core/src/bar.ts::unused',
      name: 'unused',
      filePath: '/root/packages/core/src/bar.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
      metrics: {
        fanIn: 0,
        cognitiveComplexity: 1,
        cyclomaticComplexity: 1,
        dataMutationScore: 0,
        sideEffectScore: 0,
        lineCount: 5,
      },
      importanceScore: 10,
    };

    const db = makeMockDb();
    let capturedFileRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedFileRows = rows;
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [fn],
      lineCountByFile: new Map(),
    });

    const fnRows = db.upsertCurrentFunctionAnalysis.mock.calls[0][0];
    expect(fnRows[0].signalFanInZero).toBe(true);

    const fileRow = capturedFileRows.find((r) => r.filePath === 'packages/core/src/bar.ts');
    expect(fileRow).toBeDefined();
    expect(fileRow!.signals.fanInZero).toBe(true);
    // deadCodeScore には fanInZero(25) が含まれる
    expect(fileRow!.deadCodeScore).toBe(25);
  });

  it('チャーン情報があり churn=0 → noRecentChurn=true', async () => {
    const fn: ScoredFunction = {
      id: 'file::/root/packages/core/src/old.ts::oldFunc',
      name: 'oldFunc',
      filePath: '/root/packages/core/src/old.ts',
      startLine: 1,
      endLine: 3,
      language: 'typescript',
      metrics: { fanIn: 1, cognitiveComplexity: 0, cyclomaticComplexity: 1, dataMutationScore: 0, sideEffectScore: 0, lineCount: 3 },
      importanceScore: 5,
    };

    const churnMap = new Map([['packages/core/src/old.ts', 0]]);
    const db = makeMockDb({
      getCommitFilesChurnSince: jest.fn().mockReturnValue(churnMap),
    });

    let capturedFileRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedFileRows = rows;
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [fn],
      lineCountByFile: new Map(),
    });

    const fileRow = capturedFileRows.find((r) => r.filePath === 'packages/core/src/old.ts');
    expect(fileRow).toBeDefined();
    expect(fileRow!.signals.noRecentChurn).toBe(true);
    // deadCodeScore には noRecentChurn(15) が含まれる
    expect(fileRow!.deadCodeScore).toBeGreaterThanOrEqual(15);
  });

  it('カバレッジ 0% → zeroCoverage=true', async () => {
    const fn: ScoredFunction = {
      id: 'file::/root/packages/core/src/uncovered.ts::uncoveredFunc',
      name: 'uncoveredFunc',
      filePath: '/root/packages/core/src/uncovered.ts',
      startLine: 1,
      endLine: 3,
      language: 'typescript',
      metrics: { fanIn: 1, cognitiveComplexity: 0, cyclomaticComplexity: 1, dataMutationScore: 0, sideEffectScore: 0, lineCount: 3 },
      importanceScore: 5,
    };

    const db = makeMockDb({
      getCurrentCoverage: jest.fn().mockReturnValue([
        {
          repo_name: REPO_NAME,
          package: 'core',
          file_path: '/root/packages/core/src/uncovered.ts',
          lines_pct: 0,
          lines_total: 10,
          lines_covered: 0,
          statements_total: 0,
          statements_covered: 0,
          statements_pct: 0,
          functions_total: 0,
          functions_covered: 0,
          functions_pct: 0,
          branches_total: 0,
          branches_covered: 0,
          branches_pct: 0,
          updated_at: '',
        },
      ]),
    });

    let capturedFileRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedFileRows = rows;
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [fn],
      lineCountByFile: new Map(),
    });

    const fileRow = capturedFileRows.find((r) => r.filePath === 'packages/core/src/uncovered.ts');
    expect(fileRow).toBeDefined();
    expect(fileRow!.signals.zeroCoverage).toBe(true);
    expect(fileRow!.deadCodeScore).toBeGreaterThanOrEqual(10);
  });

  it('チャーン情報が存在しない（hasHistory=false）→ noRecentChurn=false（false negative 防止）', async () => {
    const fn: ScoredFunction = {
      id: 'file::/root/packages/core/src/new.ts::newFunc',
      name: 'newFunc',
      filePath: '/root/packages/core/src/new.ts',
      startLine: 1,
      endLine: 3,
      language: 'typescript',
      metrics: { fanIn: 1, cognitiveComplexity: 0, cyclomaticComplexity: 1, dataMutationScore: 0, sideEffectScore: 0, lineCount: 3 },
      importanceScore: 5,
    };

    // churnMap が空 → ファイルはマップに存在しない（hasHistory=false）
    const db = makeMockDb({
      getCommitFilesChurnSince: jest.fn().mockReturnValue(new Map()),
    });

    let capturedFileRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => {
      capturedFileRows = rows;
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [fn],
      lineCountByFile: new Map(),
    });

    const fileRow = capturedFileRows.find((r) => r.filePath === 'packages/core/src/new.ts');
    expect(fileRow).toBeDefined();
    // コミット履歴自体がない場合は noRecentChurn=false（データなしは false positiveにしない）
    expect(fileRow!.signals.noRecentChurn).toBe(false);
  });
});
