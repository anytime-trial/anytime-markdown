import type {
  HostMessage,
  DaemonMessage,
  SerializableAnalyzeCurrentCodeRequest,
  SerializableAnalyzeReleaseCodeRequest,
  SerializableHttpServerOptions,
  SerializableSetDocsPathRequest,
  SerializableTokenBudgetConfig,
  SerializableTokenBudgetExceededPayload,
} from '../trailDaemonProtocol';

describe('trailDaemonProtocol JSON round-trip', () => {
  it('configure リクエストが JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r1',
      method: 'configure',
      params: {
        trailDbPath: '/a',
        gitRoot: '/b',
        stage: 'primary+memory',
        ollamaBaseUrl: 'http://l',
        importAllStatusFilePath: '/i',
        pipelineStatusFilePath: '/p',
        memoryCore: null,
      },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('log イベントが JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'log',
      payload: { level: 'info', message: 'x', timestamp: '2026-05-28T00:00:00.000Z' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('error response が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r1',
      ok: false,
      error: { message: 'e' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('success response (result 付き) が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r2',
      ok: true,
      result: { status: 'idle' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('analyzeCurrentCode リクエストが JSON round-trip 可', () => {
    const params: SerializableAnalyzeCurrentCodeRequest = {
      analysisRoot: '/workspace/my-repo',
      tsconfigPath: '/workspace/my-repo/tsconfig.json',
      excludeRoot: '/workspace',
      analyzeChildPath: '/ext/dist/analyze-child.js',
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r3',
      method: 'analyzeCurrentCode',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('analyzeCurrentCode リクエスト: optional フィールドは round-trip 後に欠如する', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r4',
      method: 'analyzeCurrentCode',
      params: {
        analysisRoot: '/workspace/python-only',
        // tsconfigPath intentionally omitted (undefined)
        excludeRoot: '/workspace',
      } satisfies SerializableAnalyzeCurrentCodeRequest,
    };
    const roundTripped = JSON.parse(JSON.stringify(msg)) as HostMessage;
    expect(roundTripped).toEqual(msg);
    // The optional field must not appear in the JSON-deserialized payload.
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('tsconfigPath');
  });

  it('analyzeReleaseCode リクエストが JSON round-trip 可', () => {
    const params: SerializableAnalyzeReleaseCodeRequest = {
      gitRoot: '/workspace/my-repo',
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r5',
      method: 'analyzeReleaseCode',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('analyzeCurrentCode 成功レスポンス (result 付き) が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r3',
      ok: true,
      result: {
        repoName: 'my-repo',
        tsconfigPath: '/workspace/my-repo/tsconfig.json',
        fileCount: 42,
        nodeCount: 100,
        edgeCount: 200,
        commitId: 'abc123',
        durationMs: 1234,
        warnings: [],
      },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('analyzeReleaseCode 成功レスポンス (result 付き) が JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'response',
      id: 'r5',
      ok: true,
      result: { releaseCount: 5, durationMs: 999 },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('startHttpServer リクエスト (全フィールド) が JSON round-trip 可', () => {
    const params: SerializableHttpServerOptions = {
      distPath: '/ext/dist',
      trailDbPath: '/workspace/my-repo/.anytime/trail/db/trail.db',
      gitRoot: '/workspace/my-repo',
      memoryDbPath: '/home/user/.anytime/memory.db',
      preferredPort: 19841,
      pythonWasmPath: '/ext/dist/wasm/tree-sitter-python.wasm',
      configPaths: {
        commitCategories: '/workspace/my-repo/.anytime/commit-categories.json',
        toolCategories: '/workspace/my-repo/.anytime/tool-categories.json',
        skillCategories: '/workspace/my-repo/.anytime/skill-categories.json',
        metricsThresholds: '/workspace/my-repo/.anytime/metrics-thresholds.yaml',
      },
      traceDir: '/workspace/my-repo/.anytime/trail/trace',
      excludeRoot: '/workspace/my-repo',
      defaultRepoName: 'my-repo',
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r6',
      method: 'startHttpServer',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('startHttpServer リクエスト (required のみ) が JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r7',
      method: 'startHttpServer',
      params: {
        distPath: '/ext/dist',
        trailDbPath: '/ext/dist/trail.db',
      } satisfies SerializableHttpServerOptions,
    };
    const roundTripped = JSON.parse(JSON.stringify(msg)) as HostMessage;
    expect(roundTripped).toEqual(msg);
    // optional フィールドは JSON に現れない。
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('gitRoot');
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('memoryDbPath');
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('preferredPort');
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('pythonWasmPath');
  });

  it('httpReady イベントが JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'httpReady',
      payload: { port: 19841, url: 'http://localhost:19841' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  // ---- M1 追加: 新メソッドのリクエスト round-trip ----

  it('setDocsPath リクエスト (docsPath あり) が JSON round-trip 可', () => {
    const params: SerializableSetDocsPathRequest = {
      docsPath: '/workspace/docs',
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r-docs-1',
      method: 'setDocsPath',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('setDocsPath リクエスト (docsPath 省略) が JSON round-trip 可 かつ docsPath が消える', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r-docs-2',
      method: 'setDocsPath',
      params: {} satisfies SerializableSetDocsPathRequest,
    };
    const roundTripped = JSON.parse(JSON.stringify(msg)) as HostMessage;
    expect(roundTripped).toEqual(msg);
    expect((roundTripped.params as Record<string, unknown>)).not.toHaveProperty('docsPath');
  });

  it('setTokenBudgetConfig リクエストが JSON round-trip 可', () => {
    const params: SerializableTokenBudgetConfig = {
      dailyLimitTokens: 1_000_000,
      sessionLimitTokens: null,
      alertThresholdPct: 80,
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r-budget-1',
      method: 'setTokenBudgetConfig',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('setTokenBudgetConfig: dailyLimitTokens=null が保持される', () => {
    const params: SerializableTokenBudgetConfig = {
      dailyLimitTokens: null,
      sessionLimitTokens: null,
      alertThresholdPct: 75,
    };
    const roundTripped = JSON.parse(JSON.stringify(params)) as SerializableTokenBudgetConfig;
    expect(roundTripped.dailyLimitTokens).toBeNull();
    expect(roundTripped.sessionLimitTokens).toBeNull();
  });

  // ---- M1 追加: 新 DaemonEvent の round-trip ----

  it('openDocLink イベントが JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'openDocLink',
      payload: { docPath: 'spec/my-doc.md' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('openFile イベントが JSON round-trip 可', () => {
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'openFile',
      payload: { filePath: 'src/main.ts' },
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('tokenBudgetExceeded イベント (全フィールド) が JSON round-trip 可', () => {
    const payload: SerializableTokenBudgetExceededPayload = {
      sessionId: 'abc12345-6789-0000-0000-000000000000',
      sessionTokens: 50_000,
      dailyTokens: 800_000,
      dailyLimitTokens: 1_000_000,
      sessionLimitTokens: null,
      alertThresholdPct: 80,
      turnCount: 42,
      messageCount: 120,
    };
    const msg: DaemonMessage = {
      type: 'event',
      channel: 'tokenBudgetExceeded',
      payload,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('tokenBudgetExceeded: null フィールドが保持される', () => {
    const payload: SerializableTokenBudgetExceededPayload = {
      sessionId: 'sid',
      sessionTokens: 0,
      dailyTokens: 0,
      dailyLimitTokens: null,
      sessionLimitTokens: null,
      alertThresholdPct: 80,
      turnCount: 0,
      messageCount: 0,
    };
    const rt = JSON.parse(JSON.stringify(payload)) as SerializableTokenBudgetExceededPayload;
    expect(rt.dailyLimitTokens).toBeNull();
    expect(rt.sessionLimitTokens).toBeNull();
  });

  // ---- M1 追加: SerializableHttpServerOptions 拡張フィールドの round-trip ----

  it('startHttpServer: chatBridge config が JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r-http-cb',
      method: 'startHttpServer',
      params: {
        distPath: '/ext/dist',
        trailDbPath: '/ext/dist/trail.db',
        chatBridge: {
          memoryDbPath: '/home/user/.anytime/memory.db',
          memoryNativeBinding: '/ext/dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
          staticConfig: {
            baseUrl: 'http://localhost:11434',
            chatModel: 'llama3',
            embedModel: 'nomic-embed-text',
            bm25Limit: 10,
            vecLimit: 5,
            finalLimit: 8,
            rrfK: 60,
          },
        },
      } satisfies SerializableHttpServerOptions,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('startHttpServer: logService config が JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r-http-ls',
      method: 'startHttpServer',
      params: {
        distPath: '/ext/dist',
        trailDbPath: '/ext/dist/trail.db',
        logService: {
          extensionLogsDbPath: '/home/user/.vscode-server/data/extension-logs.db',
        },
      } satisfies SerializableHttpServerOptions,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('startHttpServer: rebuildScheduler config が JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r-http-rs',
      method: 'startHttpServer',
      params: {
        distPath: '/ext/dist',
        trailDbPath: '/ext/dist/trail.db',
        rebuildScheduler: {
          memoryDbPath: '/home/user/.anytime/memory.db',
          intervalMs: 3_600_000,
        },
      } satisfies SerializableHttpServerOptions,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('startHttpServer: tokenBudgetConfig + docsPath が JSON round-trip 可', () => {
    const msg: HostMessage = {
      type: 'request',
      id: 'r-http-full',
      method: 'startHttpServer',
      params: {
        distPath: '/ext/dist',
        trailDbPath: '/ext/dist/trail.db',
        tokenBudgetConfig: {
          dailyLimitTokens: 2_000_000,
          sessionLimitTokens: 500_000,
          alertThresholdPct: 75,
        },
        docsPath: '/Shared/anytime-markdown-docs',
      } satisfies SerializableHttpServerOptions,
    };
    const roundTripped = JSON.parse(JSON.stringify(msg)) as HostMessage;
    expect(roundTripped).toEqual(msg);
  });
});
