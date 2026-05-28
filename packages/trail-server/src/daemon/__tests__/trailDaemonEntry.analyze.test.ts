// daemon dispatch の analyzeCurrentCode / analyzeReleaseCode ユニットテスト。
// パイプライン関数を jest.mock で差し替え、IPC メソッドの引数ワイヤリングを検証する。

// jest.mock は巻き上げが必要なため import より先に定義する。
jest.mock('../../analyze/AnalyzePipeline', () => ({
  runAnalyzeCurrentCodePipeline: jest.fn(async () => ({
    repoName: 'test',
    tsconfigPath: '',
    fileCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    commitId: 'abc',
    durationMs: 10,
    warnings: [],
  })),
  runAnalyzeReleaseCodePipeline: jest.fn(async () => ({
    releaseCount: 1,
    durationMs: 5,
  })),
}));

// TrailDatabase / TrailDataServer / CodeGraphService は重い native dep を持つため
// モジュールごと差し替える。
jest.mock('@anytime-markdown/trail-db', () => ({
  TrailDatabase: jest.fn().mockImplementation(() => ({
    saveCurrentGraph: jest.fn(),
    importCurrentCoverage: jest.fn(() => 0),
    deleteReleaseCodeGraphs: jest.fn(),
    analyzeReleaseCodeGraphsForce: jest.fn(async () => 0),
    close: jest.fn(),
  })),
}));

jest.mock('../../server/TrailDataServer', () => ({
  TrailDataServer: jest.fn().mockImplementation(() => ({
    setCodeGraphService: jest.fn(),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    port: 19841,
    // AnalyzePipelineCallbacks の実装
    notifyProgress: jest.fn(),
    notifyCodeGraphProgress: jest.fn(),
    notifyCodeGraphUpdated: jest.fn(),
    notifyModelUpdated: jest.fn(),
    computeAndPersistImportance: jest.fn(async () => null),
  })),
}));

jest.mock('../../analyze/CodeGraphService', () => ({
  CodeGraphService: jest.fn().mockImplementation(() => ({
    getPythonWasmPath: jest.fn(() => undefined),
    analyzeRepoTrailGraph: jest.fn(async () => null),
    generateCodeGraph: jest.fn(async () => null),
  })),
}));

import { _resetForTest, dispatch } from '../trailDaemonEntry';
import { runAnalyzeCurrentCodePipeline, runAnalyzeReleaseCodePipeline } from '../../analyze/AnalyzePipeline';

/** configure() を成功させるための最小設定。 */
const MINIMAL_CFG = {
  trailDbPath: '/tmp/trail.db',
  gitRoot: '/tmp/repo',
  statePath: '/tmp/state',
  stage: 'disabled' as const,
  ollamaBaseUrl: 'http://localhost:11434',
  importAllStatusFilePath: '/tmp/import-status.json',
  pipelineStatusFilePath: '/tmp/pipeline-status.json',
  memoryCore: null,
};

/** startHttpServer() を成功させるための最小オプション。 */
const MINIMAL_HTTP_OPTS = {
  distPath: '/tmp/dist',
  gitRoot: '/tmp/repo',
  preferredPort: 19841,
};

describe('trailDaemonEntry.dispatch — analyzeCurrentCode', () => {
  beforeEach(() => {
    _resetForTest();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
    (runAnalyzeReleaseCodePipeline as jest.Mock).mockClear();
  });

  it('configure 未呼び出しで analyzeCurrentCode が拒否される', async () => {
    await expect(
      dispatch('analyzeCurrentCode', { analysisRoot: '/tmp/repo' }),
    ).rejects.toThrow(/not configured/);
  });

  it('configure 済みだが startHttpServer 未呼び出しで analyzeCurrentCode が拒否される', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await expect(
      dispatch('analyzeCurrentCode', { analysisRoot: '/tmp/repo' }),
    ).rejects.toThrow(/http server not started/);
  });

  it('configure + startHttpServer 済みで analyzeCurrentCode が runAnalyzeCurrentCodePipeline を呼ぶ', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    const result = await dispatch('analyzeCurrentCode', {
      analysisRoot: '/tmp/repo',
      excludeRoot: '/tmp/repo',
      tsconfigPath: '/tmp/repo/tsconfig.json',
    });

    expect(runAnalyzeCurrentCodePipeline).toHaveBeenCalledTimes(1);
    const calledOpts = (runAnalyzeCurrentCodePipeline as jest.Mock).mock.calls[0][0];
    // シリアライズ可能フィールドが正しく渡されているか検証
    expect(calledOpts.analysisRoot).toBe('/tmp/repo');
    expect(calledOpts.excludeRoot).toBe('/tmp/repo');
    expect(calledOpts.tsconfigPath).toBe('/tmp/repo/tsconfig.json');
    // daemon 保有の非シリアライズ要素が含まれているか検証
    expect(calledOpts.trailDb).toBeDefined();
    expect(calledOpts.codeGraphService).toBeDefined();
    expect(calledOpts.callbacks).toBeDefined();
    expect(typeof calledOpts.callbacks.notifyProgress).toBe('function');
    expect(calledOpts.logger).toBeDefined();
    // 戻り値が呼び出し元に伝播しているか
    expect((result as { repoName: string }).repoName).toBe('test');
  });

  it('analyzeCurrentCode opts に analyzeChildPath が渡される', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    await dispatch('analyzeCurrentCode', {
      analysisRoot: '/tmp/repo',
      analyzeChildPath: '/tmp/analyze-child.js',
    });

    const calledOpts = (runAnalyzeCurrentCodePipeline as jest.Mock).mock.calls[0][0];
    expect(calledOpts.analyzeChildPath).toBe('/tmp/analyze-child.js');
  });
});

describe('trailDaemonEntry.dispatch — analyzeReleaseCode', () => {
  beforeEach(() => {
    _resetForTest();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
    (runAnalyzeReleaseCodePipeline as jest.Mock).mockClear();
  });

  it('configure 未呼び出しで analyzeReleaseCode が拒否される', async () => {
    await expect(
      dispatch('analyzeReleaseCode', { gitRoot: '/tmp/repo' }),
    ).rejects.toThrow(/not configured/);
  });

  it('configure 済みだが startHttpServer 未呼び出しで analyzeReleaseCode が拒否される', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await expect(
      dispatch('analyzeReleaseCode', { gitRoot: '/tmp/repo' }),
    ).rejects.toThrow(/http server not started/);
  });

  it('configure + startHttpServer 済みで analyzeReleaseCode が runAnalyzeReleaseCodePipeline を呼ぶ', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    const result = await dispatch('analyzeReleaseCode', {
      gitRoot: '/tmp/repo',
    });

    expect(runAnalyzeReleaseCodePipeline).toHaveBeenCalledTimes(1);
    const calledOpts = (runAnalyzeReleaseCodePipeline as jest.Mock).mock.calls[0][0];
    // シリアライズ可能フィールドが正しく渡されているか
    expect(calledOpts.gitRoot).toBe('/tmp/repo');
    // daemon 保有の非シリアライズ要素が含まれているか
    expect(calledOpts.trailDb).toBeDefined();
    expect(calledOpts.codeGraphService).toBeDefined();
    // 戻り値が呼び出し元に伝播しているか
    expect((result as { releaseCount: number }).releaseCount).toBe(1);
  });
});
