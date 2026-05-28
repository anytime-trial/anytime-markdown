import { AnalyzeCommandClient } from '../AnalyzeCommandClient';
import type { TrailDaemonHost } from '../TrailDaemonHost';
import type {
  SerializableAnalyzeCurrentCodeRequest,
  SerializableAnalyzeReleaseCodeRequest,
} from '../trailDaemonProtocol';

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

function makeCurrentReq(): SerializableAnalyzeCurrentCodeRequest {
  return { analysisRoot: '/repo', tsconfigPath: '/repo/tsconfig.json' };
}

function makeReleaseReq(): SerializableAnalyzeReleaseCodeRequest {
  return { gitRoot: '/repo' };
}

describe('AnalyzeCommandClient', () => {
  it('analyzeCurrentCode(req) は host.call("analyzeCurrentCode", req) を一度だけ発行し reply を返す', async () => {
    const host = makeFakeHost();
    const result = { nodes: 42 };
    host.replies.set('analyzeCurrentCode', result);
    const client = new AnalyzeCommandClient(host);
    const got = await client.analyzeCurrentCode(makeCurrentReq());
    expect(host.calls).toEqual([{ method: 'analyzeCurrentCode', params: makeCurrentReq() }]);
    expect(got).toBe(result);
  });

  it('analyzeReleaseCode(req) は host.call("analyzeReleaseCode", req) を一度だけ発行し reply を返す', async () => {
    const host = makeFakeHost();
    const result = { releases: 3 };
    host.replies.set('analyzeReleaseCode', result);
    const client = new AnalyzeCommandClient(host);
    const got = await client.analyzeReleaseCode(makeReleaseReq());
    expect(host.calls).toEqual([{ method: 'analyzeReleaseCode', params: makeReleaseReq() }]);
    expect(got).toBe(result);
  });

  it('host.call がエラーを返す場合、rejected promise として伝播する', async () => {
    const host = makeFakeHost();
    const err = new Error('daemon crashed');
    (host.call as jest.Mock).mockRejectedValueOnce(err);
    const client = new AnalyzeCommandClient(host);
    await expect(client.analyzeCurrentCode(makeCurrentReq())).rejects.toThrow('daemon crashed');
  });
});
