import { CodeGraphApiHandler } from '../CodeGraphApiHandler';
import type { CodeGraphService } from '../../analyze/CodeGraphService';
import type { CodeGraph } from '../../analyze/CodeGraph.types';

function makeRes() {
  const chunks: string[] = [];
  let status = 0;
  let headers: Record<string, string> = {};
  return {
    writeHead(s: number, h: Record<string, string>) {
      status = s;
      headers = h;
    },
    end(body?: string) {
      if (body !== undefined) chunks.push(body);
    },
    get status() {
      return status;
    },
    get body() {
      return chunks.join('');
    },
    get headers() {
      return headers;
    },
  };
}

function makeGraph(repoLabel: string): CodeGraph {
  return {
    generatedAt: '2026-05-16T00:00:00.000Z',
    repositories: [{ id: repoLabel, label: repoLabel, path: `/tmp/${repoLabel}` }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
  };
}

function makeCodeGraphServiceStub(loaded: Record<string, CodeGraph>) {
  const cache = new Map<string, CodeGraph>();
  const svc = {
    getGraph(repoName?: string) {
      const key = repoName ?? 'default-repo';
      return cache.get(key) ?? null;
    },
    async loadFromDb(repoName?: string) {
      const key = repoName ?? 'default-repo';
      const g = loaded[key];
      if (g) {
        cache.set(key, g);
        return g;
      }
      return null;
    },
    invalidate(repoName?: string) {
      if (repoName) cache.delete(repoName);
      else cache.clear();
    },
  };
  return svc as unknown as CodeGraphService;
}

const NOOP_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOGGER,
};

describe('CodeGraphApiHandler.handleGet (current mode)', () => {
  it('repo 指定時は指定 repo のグラフを返す（lazy load）', async () => {
    const dexter = makeGraph('dexter-jp');
    const svc = makeCodeGraphServiceStub({ 'dexter-jp': dexter });
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handleGet(res as never, 'current', 'dexter-jp');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).repositories[0].label).toBe('dexter-jp');
  });

  it('該当 repo がない場合は 404 を返す', async () => {
    const svc = makeCodeGraphServiceStub({});
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handleGet(res as never, 'current', 'missing-repo');
    expect(res.status).toBe(404);
  });

  it('repo 省略時はデフォルト repo を返す', async () => {
    const def = makeGraph('default-repo');
    const svc = makeCodeGraphServiceStub({ 'default-repo': def });
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handleGet(res as never, 'current');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).repositories[0].label).toBe('default-repo');
  });
});

describe('CodeGraphApiHandler.handleQuery/Explain/Path (repo aware)', () => {
  it('handleQuery は repo 指定時に該当 repo のグラフからエンジンを構築する', async () => {
    const dexter = makeGraph('dexter-jp');
    const svc = makeCodeGraphServiceStub({ 'dexter-jp': dexter });
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handleQuery(res as never, 'noop', 'dexter-jp');
    expect(res.status).toBe(200);
  });

  it('handleExplain も repo 指定時に該当 repo のエンジンを使う', async () => {
    const dexter = makeGraph('dexter-jp');
    const svc = makeCodeGraphServiceStub({ 'dexter-jp': dexter });
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handleExplain(res as never, 'no-such-node', 'dexter-jp');
    // engine 構築は成功するが、ノードが無いので 404
    expect(res.status).toBe(404);
  });

  it('handlePath は repo 指定時に該当 repo のエンジンを使う', async () => {
    const dexter = makeGraph('dexter-jp');
    const svc = makeCodeGraphServiceStub({ 'dexter-jp': dexter });
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);

    const res = makeRes();
    await handler.handlePath(res as never, 'a', 'b', 'dexter-jp');
    expect(res.status).toBe(200);
  });

  it('repo に該当 graph がなければ handleQuery は 404', async () => {
    const svc = makeCodeGraphServiceStub({});
    const handler = new CodeGraphApiHandler({} as never, NOOP_LOGGER as never);
    handler.setCodeGraphService(svc);
    const res = makeRes();
    await handler.handleQuery(res as never, 'noop', 'missing-repo');
    expect(res.status).toBe(404);
  });
});
