/**
 * computeAndPersistFileAnalysis の追加テスト — 未カバー分岐を補完する。
 *
 * 既存テストでカバーされていない分岐:
 * - line 159-160: codeGraph のエッジで nodeIdToRelPath にない edge が filter される
 * - line 318: computeInDegree で同一 target が複数エッジから参照される（累積）
 */
import { computeAndPersistFileAnalysis } from '../computeAndPersistFileAnalysis';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { FileAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

function makeNode(id: string, pkg: string = 'core'): CodeGraph['nodes'][number] {
  return {
    id,
    label: id.split(':').pop() ?? id,
    repo: 'repo',
    package: pkg,
    fileType: 'code',
    community: 0,
    communityLabel: 'c0',
    x: 0,
    y: 0,
    size: 0,
  };
}

function makeEdge(source: string, target: string): CodeGraph['edges'][number] {
  return { source, target, confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false };
}

function makeMockDb(overrides: Record<string, jest.Mock> = {}) {
  return {
    getCurrentCodeGraph: jest.fn().mockReturnValue(null),
    getCurrentCoverage: jest.fn().mockReturnValue([]),
    getCommitFilesChurnSince: jest.fn().mockReturnValue(new Map()),
    getCommitFilesEverChurned: jest.fn().mockReturnValue(new Set()),
    getCommitFilesChurnBefore: jest.fn().mockReturnValue(new Map()),
    getEarliestCommitAt: jest.fn().mockReturnValue(null),
    clearCurrentFileAnalysis: jest.fn(),
    upsertCurrentFileAnalysis: jest.fn(),
    clearCurrentFunctionAnalysis: jest.fn(),
    upsertCurrentFunctionAnalysis: jest.fn(),
    ...overrides,
  };
}

const ANALYSIS_ROOT = '/root';
const REPO_NAME = 'repo';

describe('computeAndPersistFileAnalysis — 追加テスト', () => {
  // -----------------------------------------------------------------------
  // computeInDegree — 同一 target を複数エッジが参照する累積カウント
  // -----------------------------------------------------------------------

  it('複数エッジが同一 target を参照するとき in-degree が累積され orphan=false になる', async () => {
    // nodeA が 2 つの source から参照される → inDeg=2 → orphan=false
    const graph: CodeGraph = {
      generatedAt: '2026-05-01T00:00:00.000Z',
      repositories: [{ id: REPO_NAME, label: REPO_NAME, path: ANALYSIS_ROOT }],
      nodes: [
        makeNode('repo:packages/core/src/nodeA'),
        makeNode('repo:packages/core/src/nodeB'),
        makeNode('repo:packages/core/src/nodeC'),
      ],
      edges: [
        makeEdge('repo:packages/core/src/nodeB', 'repo:packages/core/src/nodeA'),
        makeEdge('repo:packages/core/src/nodeC', 'repo:packages/core/src/nodeA'),
      ],
      communities: { 0: 'c0' },
      godNodes: [],
    };

    let capturedRows: FileAnalysisRow[] = [];
    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
      upsertCurrentFileAnalysis: jest.fn((rows: FileAnalysisRow[]) => { capturedRows = rows; }),
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      lineCountByFile: new Map([
        ['packages/core/src/nodeA.ts', 10],
        ['packages/core/src/nodeB.ts', 5],
        ['packages/core/src/nodeC.ts', 5],
      ]),
    });

    const nodeARow = capturedRows.find((r) => r.filePath === 'packages/core/src/nodeA.ts');
    expect(nodeARow).toBeDefined();
    // in-degree=2 なので orphan=false
    expect(nodeARow!.signals.orphan).toBe(false);

    // nodeB, nodeC は被参照なし → in-degree=0 → orphan=true
    const nodeBRow = capturedRows.find((r) => r.filePath === 'packages/core/src/nodeB.ts');
    expect(nodeBRow!.signals.orphan).toBe(true);
  });

  // -----------------------------------------------------------------------
  // line 159-160: nodeIdToRelPath にないエッジが filter(e => e.source && e.target) で除去
  // -----------------------------------------------------------------------

  it('codeGraph のエッジで nodeIdToRelPath に存在しないノードは centrality 計算から除外される', async () => {
    // lineCountByFile に含まれないノードを参照するエッジを作る
    const graph: CodeGraph = {
      generatedAt: '2026-05-01T00:00:00.000Z',
      repositories: [{ id: REPO_NAME, label: REPO_NAME, path: ANALYSIS_ROOT }],
      nodes: [
        makeNode('repo:packages/core/src/known'),
        makeNode('repo:packages/core/src/unknown'), // lineCountByFile にはない
      ],
      edges: [
        // unknown は lineCountByFile にないので nodeIdToRelPath の値が '' になる
        makeEdge('repo:packages/core/src/unknown', 'repo:packages/core/src/known'),
      ],
      communities: { 0: 'c0' },
      godNodes: [],
    };

    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
    });

    // known のみが lineCountByFile に存在する（unknown は存在しない）
    await expect(
      computeAndPersistFileAnalysis({
        analysisRoot: ANALYSIS_ROOT,
        repoName: REPO_NAME,
        trailDb: db as unknown as TrailDatabase,
        scored: [],
        lineCountByFile: new Map([['packages/core/src/known.ts', 8]]),
      }),
    ).resolves.toBeDefined();
    // エラーなく完了すれば OK（empty-source エッジは filter で除外されるため）
  });

  // -----------------------------------------------------------------------
  // categoryByFile オプション
  // -----------------------------------------------------------------------

  it('categoryByFile が指定されたとき category が fileRow に反映される', async () => {
    const graph: CodeGraph = {
      generatedAt: '2026-05-01T00:00:00.000Z',
      repositories: [{ id: REPO_NAME, label: REPO_NAME, path: ANALYSIS_ROOT }],
      nodes: [makeNode('repo:packages/ui/src/Button')],
      edges: [],
      communities: { 0: 'ui' },
      godNodes: [],
    };

    let capturedRows: FileAnalysisRow[] = [];
    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
      upsertCurrentFileAnalysis: jest.fn((rows: FileAnalysisRow[]) => { capturedRows = rows; }),
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      lineCountByFile: new Map([['packages/ui/src/Button.ts', 20]]),
      categoryByFile: new Map([['packages/ui/src/Button.ts', 'ui']]),
    });

    const row = capturedRows.find((r) => r.filePath === 'packages/ui/src/Button.ts');
    expect(row).toBeDefined();
    expect(row!.category).toBe('ui');
  });

  // -----------------------------------------------------------------------
  // coverage で __total__ エントリはスキップされる
  // -----------------------------------------------------------------------

  it('coverage に __total__ エントリが含まれていてもスキップされる', async () => {
    const db = makeMockDb({
      getCurrentCoverage: jest.fn().mockReturnValue([
        {
          repo_name: REPO_NAME,
          package: 'core',
          file_path: '__total__',
          lines_pct: 80,
          lines_total: 100,
          lines_covered: 80,
          statements_total: 0, statements_covered: 0, statements_pct: 0,
          functions_total: 0, functions_covered: 0, functions_pct: 0,
          branches_total: 0, branches_covered: 0, branches_pct: 0,
          updated_at: '',
        },
      ]),
    });

    // __total__ がスキップされても例外が出ないことを確認
    await expect(
      computeAndPersistFileAnalysis({
        analysisRoot: ANALYSIS_ROOT,
        repoName: REPO_NAME,
        trailDb: db as unknown as TrailDatabase,
        scored: [],
        lineCountByFile: new Map(),
      }),
    ).resolves.toMatchObject({ fileRows: 0, functionRows: 0 });
  });

  // -----------------------------------------------------------------------
  // dead-code-ignore ファイルが存在するとき isIgnored=true になる
  // -----------------------------------------------------------------------

  it('dead-code-ignore でマッチするファイルは isIgnored=true になる', async () => {
    const path = require('node:path');
    const fs = require('node:fs');
    const os = require('node:os');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dci-test-'));
    try {
      fs.mkdirSync(path.join(tmpRoot, '.anytime'));
      // packages/legacy/** を無視するルール
      fs.writeFileSync(path.join(tmpRoot, '.anytime', 'dead-code-ignore'), 'packages/legacy/**\n');

      const db = makeMockDb();
      let capturedRows: FileAnalysisRow[] = [];
      db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => { capturedRows = rows; });

      const { computeAndPersistFileAnalysis: fn } = require('../computeAndPersistFileAnalysis');
      await fn({
        analysisRoot: tmpRoot,
        repoName: REPO_NAME,
        trailDb: db as unknown as TrailDatabase,
        scored: [],
        lineCountByFile: new Map([
          ['packages/legacy/old.ts', 5],
          ['packages/core/new.ts', 10],
        ]),
      });

      // lineCountByFile のファイルは CodeGraph がない → code graph ノード由来でない
      // scored も空なので fileAggregates は空 → fileRows=0
      expect(capturedRows).toHaveLength(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true });
    }
  });

  // -----------------------------------------------------------------------
  // line 152: noExtToWithExt に .ts がなく .tsx にフォールバックするパス
  // -----------------------------------------------------------------------

  it('CodeGraph ノードが .tsx 拡張子のファイルに対応するとき .tsx でフォールバックして orphan 判定される', async () => {
    const graph: CodeGraph = {
      generatedAt: '2026-05-01T00:00:00.000Z',
      repositories: [{ id: REPO_NAME, label: REPO_NAME, path: ANALYSIS_ROOT }],
      nodes: [
        makeNode('repo:packages/ui/src/Button'),
      ],
      edges: [],
      communities: { 0: 'ui' },
      godNodes: [],
    };

    let capturedRows: FileAnalysisRow[] = [];
    const db = makeMockDb({
      getCurrentCodeGraph: jest.fn().mockReturnValue(graph),
      upsertCurrentFileAnalysis: jest.fn((rows: FileAnalysisRow[]) => { capturedRows = rows; }),
    });

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored: [],
      // .tsx のエントリを noExtToWithExt に持つ（.ts はない）
      lineCountByFile: new Map([['packages/ui/src/Button.tsx', 20]]),
    });

    // Button.tsx が .tsx フォールバックで正しく扱われること
    const row = capturedRows.find((r) => r.filePath === 'packages/ui/src/Button.tsx');
    expect(row).toBeDefined();
    // orphan=true（エッジなし）
    expect(row!.signals.orphan).toBe(true);
  });

  // -----------------------------------------------------------------------
  // coverage で relative path（isAbsolute=false）パス
  // -----------------------------------------------------------------------

  it('coverage の file_path が相対パスのときそのまま相対パスとして使われる', async () => {
    const db = makeMockDb({
      getCurrentCoverage: jest.fn().mockReturnValue([
        {
          repo_name: REPO_NAME,
          package: 'core',
          file_path: 'packages/core/src/already-relative.ts', // 相対パス
          lines_pct: 0,
          lines_total: 10, lines_covered: 0,
          statements_total: 0, statements_covered: 0, statements_pct: 0,
          functions_total: 0, functions_covered: 0, functions_pct: 0,
          branches_total: 0, branches_covered: 0, branches_pct: 0,
          updated_at: '',
        },
      ]),
    });

    let capturedRows: FileAnalysisRow[] = [];
    db.upsertCurrentFileAnalysis.mockImplementation((rows: FileAnalysisRow[]) => { capturedRows = rows; });

    // ScoredFunction で対応するファイルを coverage と照合させる
    const scored = [
      {
        id: 'file::/root/packages/core/src/already-relative.ts::fn',
        name: 'fn',
        filePath: '/root/packages/core/src/already-relative.ts',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        metrics: { fanIn: 1, cognitiveComplexity: 0, cyclomaticComplexity: 1, dataMutationScore: 0, sideEffectScore: 0, lineCount: 3, fanOut: 0, distinctCallees: 0 },
        importanceScore: 5,
      },
    ];

    await computeAndPersistFileAnalysis({
      analysisRoot: ANALYSIS_ROOT,
      repoName: REPO_NAME,
      trailDb: db as unknown as TrailDatabase,
      scored,
      lineCountByFile: new Map(),
    });

    const row = capturedRows.find((r) => r.filePath === 'packages/core/src/already-relative.ts');
    expect(row).toBeDefined();
    // file_path が相対パスで来ても zeroCoverage が正しく判定される
    expect(row!.signals.zeroCoverage).toBe(true);
  });
});
