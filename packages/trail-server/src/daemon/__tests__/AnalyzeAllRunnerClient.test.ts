import { AnalyzeAllRunnerClient } from '../AnalyzeAllRunnerClient';
import type { TrailDaemonHost } from '../TrailDaemonHost';
import type { SerializableAnalyzeAllConfig } from '../trailDaemonProtocol';

function makeFakeHost(): TrailDaemonHost & { calls: Array<{ method: string; params: unknown }>; replies: Map<string, unknown> } {
  const calls: Array<{ method: string; params: unknown }> = [];
  const replies = new Map<string, unknown>();
  const fake = {
    calls,
    replies,
    call: jest.fn((method: string, params?: unknown) => {
      calls.push({ method, params });
      return Promise.resolve(replies.get(method));
    }),
    on: jest.fn(() => () => {}),
    start: jest.fn(),
    dispose: jest.fn(),
  } as unknown as TrailDaemonHost & {
    calls: Array<{ method: string; params: unknown }>;
    replies: Map<string, unknown>;
  };
  return fake;
}

function makeConfig(): SerializableAnalyzeAllConfig {
  return {
    trailDbPath: '/t',
    gitRoot: '/g',
    stage: 'primary+memory',
    ollamaBaseUrl: 'http://l',
    importAllStatusFilePath: '/i',
    pipelineStatusFilePath: '/p',
    memoryCore: null,
  };
}

describe('AnalyzeAllRunnerClient', () => {
  it('configure() は host.call("configure", config) を発行する', async () => {
    const host = makeFakeHost();
    const cfg = makeConfig();
    const client = new AnalyzeAllRunnerClient(host, cfg);
    await client.configure();
    expect(host.calls).toEqual([{ method: 'configure', params: cfg }]);
  });

  it('runOnce(reason) は host.call("runOnce", { reason }) を発行し reply を返す', async () => {
    const host = makeFakeHost();
    const status = { paused: false } as unknown;
    host.replies.set('runOnce', status);
    const client = new AnalyzeAllRunnerClient(host, makeConfig());
    const got = await client.runOnce('import');
    expect(host.calls).toEqual([{ method: 'runOnce', params: { reason: 'import' } }]);
    expect(got).toBe(status);
  });

  it('start(intervalMs, options) は params をそのまま渡す (戻り値なし)', () => {
    const host = makeFakeHost();
    const client = new AnalyzeAllRunnerClient(host, makeConfig());
    client.start(5000, { runOnStart: true, startupDelayMs: 1000 });
    expect(host.calls).toEqual([
      { method: 'start', params: { intervalMs: 5000, options: { runOnStart: true, startupDelayMs: 1000 } } },
    ]);
  });

  it('pause(by) / resume() / stop() を IPC 呼び出しに変換する', async () => {
    const host = makeFakeHost();
    const status = { paused: true } as unknown;
    host.replies.set('pause', status);
    host.replies.set('resume', status);
    const client = new AnalyzeAllRunnerClient(host, makeConfig());
    await client.pause('user-request');
    await client.resume();
    client.stop();
    expect(host.calls).toEqual([
      { method: 'pause', params: { by: 'user-request' } },
      { method: 'resume', params: undefined },
      { method: 'stop', params: undefined },
    ]);
  });

  it('getStatus / getLastImportResult / dispose は host.call を経由する', async () => {
    const host = makeFakeHost();
    host.replies.set('getStatus', { idle: true });
    host.replies.set('getLastImportResult', null);
    const client = new AnalyzeAllRunnerClient(host, makeConfig());
    await client.getStatus();
    await client.getLastImportResult();
    await client.dispose();
    expect(host.calls.map((c) => c.method)).toEqual(['getStatus', 'getLastImportResult', 'dispose']);
  });
});
