import type {
  HostMessage,
  DaemonMessage,
  SerializableAnalyzeCurrentCodeRequest,
  SerializableAnalyzeReleaseCodeRequest,
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

  it('analyzeCurrentCode リクエスト (optional フィールド省略) が JSON round-trip 可', () => {
    const params: SerializableAnalyzeCurrentCodeRequest = {
      analysisRoot: '/workspace/python-only',
      tsconfigPath: undefined,
    };
    const msg: HostMessage = {
      type: 'request',
      id: 'r4',
      method: 'analyzeCurrentCode',
      params,
    };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
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
});
