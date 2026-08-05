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
  // scope の正規化はモックせず実体と同じ挙動を持たせる（undefined→all / 配列→tags）。
  // ここを jest.fn() で潰すと、daemon が scope を渡していなくてもテストが通ってしまう。
  toAnalyzeReleaseScope: (tags: readonly string[] | undefined) =>
    tags === undefined ? { kind: 'all' } : { kind: 'tags', tags },
}));

// TrailDatabase / TrailDataServer / CodeGraphService は重い native dep を持つため
// モジュールごと差し替える。
jest.mock('@anytime-markdown/trail-db', () => ({
  TrailDatabase: jest.fn().mockImplementation(() => ({
    init: jest.fn(async () => {}),
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
    setAnalyzeAllRunner: jest.fn(),
    setLogService: jest.fn(),
    setChatBridge: jest.fn(),
    setTokenBudgetConfig: jest.fn(),
    setDocsPath: jest.fn(),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    port: 19841,
    // AnalyzePipelineCallbacks の実装
    notifyProgress: jest.fn(),
    notifyCodeGraphProgress: jest.fn(),
    notifyCodeGraphUpdated: jest.fn(),
    notifyModelUpdated: jest.fn(),
    notifySessionsUpdated: jest.fn(),
    // callback slots (M1: daemon が wire するプロパティ)
    onOpenDocLink: undefined as unknown,
    onOpenFile: undefined as unknown,
    onTokenBudgetExceeded: undefined as unknown,
    onAnalyzeCurrentCode: undefined as unknown,
    onAnalyzeReleaseCode: undefined as unknown,
    onAnalyzeAll: undefined as unknown,
  })),
}));

jest.mock('../../analyze/CodeGraphService', () => ({
  CodeGraphService: jest.fn().mockImplementation(() => ({
    getPythonWasmPath: jest.fn(() => undefined),
    analyzeRepoTrailGraph: jest.fn(async () => null),
    generateCodeGraph: jest.fn(async () => null),
  })),
}));

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _getAnalyzeAllRunnerForTest, _resetForTest, dispatch } from '../trailDaemonEntry';
import { runAnalyzeCurrentCodePipeline, runAnalyzeReleaseCodePipeline } from '../../analyze/AnalyzePipeline';
import { TrailDataServer } from '../../server/TrailDataServer';

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

/**
 * better-sqlite3 の native binding。既定値は `distPath/node_modules/...` を指すが、
 * テストの distPath は実在しないため repo の実体を明示的に渡す。
 */
const BETTER_SQLITE3_BINDING = require.resolve('better-sqlite3/build/Release/better_sqlite3.node');

/** startHttpServer() を成功させるための最小オプション。 */
const MINIMAL_HTTP_OPTS = {
  distPath: '/tmp/dist',
  trailDbPath: '/tmp/trail.db',
  gitRoot: '/tmp/repo',
  preferredPort: 19841,
};

describe('trailDaemonEntry.dispatch — analyzeCurrentCode', () => {
  beforeEach(() => {
    _resetForTest();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
    (runAnalyzeReleaseCodePipeline as jest.Mock).mockClear();
  });

  it('startHttpServer 未呼び出しで analyzeCurrentCode が拒否される', async () => {
    await expect(
      dispatch('analyzeCurrentCode', { analysisRoot: '/tmp/repo' }),
    ).rejects.toThrow(/http server not started/);
  });

  it('configure 済みでも startHttpServer 未呼び出しなら analyzeCurrentCode は拒否される', async () => {
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

  it('analyzeCurrentCode opts に呼び出し元の analyzeChildPath が渡される', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    await dispatch('analyzeCurrentCode', {
      analysisRoot: '/tmp/repo',
      analyzeChildPath: '/tmp/analyze-child.js',
    });

    const calledOpts = (runAnalyzeCurrentCodePipeline as jest.Mock).mock.calls[0][0];
    expect(calledOpts.compute).toEqual({ kind: 'child', analyzeChildPath: '/tmp/analyze-child.js' });
  });

  it('analyzeChildPath 省略時も daemon 自身の dist へフォールバックする（in-host へ落とさない）', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    await dispatch('analyzeCurrentCode', { analysisRoot: '/tmp/repo' });

    const calledOpts = (runAnalyzeCurrentCodePipeline as jest.Mock).mock.calls[0][0];
    expect(calledOpts.compute).toEqual({
      kind: 'child',
      analyzeChildPath: expect.stringMatching(/analyze-child\.js$/),
    });
  });
});

describe('trailDaemonEntry.dispatch — import pipeline wiring (trailDb)', () => {
  beforeEach(() => _resetForTest());

  // 回帰: bb0a0345 で HTTP server を configure から切り離した際、import パイプラインの
  // trailDb 配線が落ち、SessionImporter 等の Layer 1/2 が一切走らなくなった
  // (trail.db が 0 件のまま)。configure → startHttpServer の順で httpTrailDb を共有し、
  // 取込が有効化されることを保証する。
  const CFG = { ...MINIMAL_CFG, stage: 'primary' as const };

  it('configure 単体では import パイプラインは無効 (httpTrailDb 未構築)', async () => {
    await dispatch('configure', CFG);
    expect(_getAnalyzeAllRunnerForTest()?.importEnabled).toBe(false);
  });

  it('startHttpServer 後に import パイプラインが有効化される (trailDb 共有)', async () => {
    await dispatch('configure', CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);
    expect(_getAnalyzeAllRunnerForTest()?.importEnabled).toBe(true);
  });
});

describe('trailDaemonEntry.dispatch — Wave 1/2/4 実行台帳の配線', () => {
  let dir: string;

  beforeEach(() => {
    _resetForTest();
    dir = mkdtempSync(join(tmpdir(), 'daemon-run-ledger-'));
  });
  afterEach(async () => {
    // memory-core.db の接続を閉じてから temp dir を消す (WAL が残ると後続で開けない)。
    await dispatch('dispose', {});
    rmSync(dir, { recursive: true, force: true });
  });

  // 回帰: Wave 1/2/4 を pipeline_runs へ記録する openPipelineRunLedger は cli.ts でしか
  // 注入されておらず、production 経路である daemon では落ちていた。Wave は走るのに台帳は
  // wave='memory' と 'system' しか埋まらず、Trail Pipeline の Runs 画面では sources /
  // primary / derived が恒久的に空 = 「パイプラインが動作していない」に見えた (2026-08-05)。
  // 台帳の書き込みは fail-open で失敗しても ingest が成功するため、配線の有無を直接検査する。
  const CFG = { ...MINIMAL_CFG, stage: 'primary' as const };

  it('logService 付き startHttpServer 後に実行台帳が配線される', async () => {
    await dispatch('configure', CFG);
    await dispatch('startHttpServer', {
      ...MINIMAL_HTTP_OPTS,
      memoryDbPath: join(dir, 'memory-core.db'),
      logService: { nativeBinding: BETTER_SQLITE3_BINDING },
    });
    expect(_getAnalyzeAllRunnerForTest()?.runLedgerEnabled).toBe(true);
  });

  it('logService 無しでは配線されない (memory-core.db 接続が無いため)', async () => {
    await dispatch('configure', CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);
    expect(_getAnalyzeAllRunnerForTest()?.runLedgerEnabled).toBe(false);
  });

  // dispose は接続を閉じるがプロセスは終わらない。ファクトリを残すと、次の
  // startHttpServer (logService 無し) が閉じた接続の台帳を注入し、runLedgerEnabled が
  // true を返したまま 1 行も記録されない = 配線検査用の getter が嘘をつく。
  it('dispose 後に再起動すると台帳の配線も落ちる (閉じた接続を持ち越さない)', async () => {
    await dispatch('configure', CFG);
    await dispatch('startHttpServer', {
      ...MINIMAL_HTTP_OPTS,
      memoryDbPath: join(dir, 'memory-core.db'),
      logService: { nativeBinding: BETTER_SQLITE3_BINDING },
    });
    expect(_getAnalyzeAllRunnerForTest()?.runLedgerEnabled).toBe(true);

    await dispatch('dispose', {});
    await dispatch('configure', CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);
    expect(_getAnalyzeAllRunnerForTest()?.runLedgerEnabled).toBe(false);
  });
});

describe('trailDaemonEntry.dispatch — analyzeReleaseCode', () => {
  beforeEach(() => {
    _resetForTest();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
    (runAnalyzeReleaseCodePipeline as jest.Mock).mockClear();
  });

  it('startHttpServer 未呼び出しで analyzeReleaseCode が拒否される', async () => {
    await expect(
      dispatch('analyzeReleaseCode', { gitRoot: '/tmp/repo' }),
    ).rejects.toThrow(/http server not started/);
  });

  it('configure 済みでも startHttpServer 未呼び出しなら analyzeReleaseCode は拒否される', async () => {
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
    // tags 未指定は全量洗い替え
    expect(calledOpts.scope).toEqual({ kind: 'all' });
    // 戻り値が呼び出し元に伝播しているか
    expect((result as { releaseCount: number }).releaseCount).toBe(1);
  });

  // IPC 層で tags を落とすと、部分生成の要求が全量洗い替えとして実行される。
  it('analyzeReleaseCode は request の tags を scope へ通す', async () => {
    await dispatch('configure', MINIMAL_CFG);
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    await dispatch('analyzeReleaseCode', {
      gitRoot: '/tmp/repo',
      tags: ['v1.19.1'],
    });

    const calledOpts = (runAnalyzeReleaseCodePipeline as jest.Mock).mock.calls[0][0];
    expect(calledOpts.scope).toEqual({ kind: 'tags', tags: ['v1.19.1'] });
  });
});

describe('trailDaemonEntry.dispatch — startHttpServer の configure 非依存', () => {
  beforeEach(() => {
    _resetForTest();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
    (runAnalyzeReleaseCodePipeline as jest.Mock).mockClear();
  });

  it('configure 未呼び出しでも startHttpServer が成功する (stage=disabled 相当)', async () => {
    await expect(
      dispatch('startHttpServer', MINIMAL_HTTP_OPTS),
    ).resolves.toBeUndefined();
  });

  it('startHttpServer 単独で analyzeCurrentCode が runAnalyzeCurrentCodePipeline を呼ぶ', async () => {
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    const result = await dispatch('analyzeCurrentCode', {
      analysisRoot: '/tmp/repo',
    });

    expect(runAnalyzeCurrentCodePipeline).toHaveBeenCalledTimes(1);
    expect((result as { repoName: string }).repoName).toBe('test');
  });
});

describe('trailDaemonEntry — HTTP 経路 (server.onAnalyzeCurrentCode)', () => {
  beforeEach(() => {
    _resetForTest();
    (TrailDataServer as unknown as jest.Mock).mockClear();
    (runAnalyzeCurrentCodePipeline as jest.Mock).mockClear();
  });

  /** startHttpServer が構築した TrailDataServer モックインスタンスを取り出す。 */
  function httpArm(): (req: { workspacePath?: string; tsconfigPath?: string }) => Promise<unknown> {
    const instance = (TrailDataServer as unknown as jest.Mock).mock.results.at(-1)?.value as {
      onAnalyzeCurrentCode?: (req: { workspacePath?: string; tsconfigPath?: string }) => Promise<unknown>;
    };
    if (!instance?.onAnalyzeCurrentCode) {
      throw new Error('onAnalyzeCurrentCode is not wired');
    }
    return instance.onAnalyzeCurrentCode;
  }

  // 回帰: HTTP 経路 (MCP analyze_current_code → TrailDataServer) だけが解析方式を渡して
  // おらず、バンドル済み拡張では dist に存在しない computeAnalysis.js への動的 import へ
  // 黙って縮退し、analyze_current_code が必ず失敗していた。IPC 経路は渡していたため、
  // コマンドパレット経由では再現せず HTTP 経路のみで顕在化した。
  it('HTTP 経路でも TS 解析を analyze-child へ隔離する', async () => {
    await dispatch('startHttpServer', MINIMAL_HTTP_OPTS);

    await httpArm()({ workspacePath: '/tmp/repo', tsconfigPath: '/tmp/repo/tsconfig.json' });

    expect(runAnalyzeCurrentCodePipeline).toHaveBeenCalledTimes(1);
    const calledOpts = (runAnalyzeCurrentCodePipeline as jest.Mock).mock.calls[0][0];
    expect(calledOpts.compute).toEqual({
      kind: 'child',
      analyzeChildPath: expect.stringMatching(/analyze-child\.js$/),
    });
  });
});
