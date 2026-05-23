/**
 * CodeGraphService.generate() および save() のユニットテスト。
 *
 * analyze() と loadAnalyzeExclude() をモック化して、
 * FS や TypeScript コンパイラを起動せずに generate() フローを通す。
 */

// analyze と loadAnalyzeExclude をモック化（ファイルシステム/TSコンパイラ不要）
jest.mock('@anytime-markdown/trail-core/analyze', () => ({
  analyze: jest.fn(() => ({ nodes: [], edges: [], metadata: { projectRoot: '/tmp/repo', analyzedAt: '2026-01-01', fileCount: 0 } })),
}));
jest.mock('@anytime-markdown/trail-core/analyzeExclude', () => ({
  loadAnalyzeExclude: jest.fn(() => {
    // ignore パッケージ互換の空インスタンスを返す
    const ignore = require('ignore');
    return ignore();
  }),
}));

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { CodeGraphService } from '../CodeGraphService';
import type { CodeGraph, CodeGraphRepository } from '../CodeGraph.types';
import type { TrailGraph } from '@anytime-markdown/trail-core';

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<CodeGraphRepository> = {}): CodeGraphRepository {
  return { id: 'test-repo', label: 'test-repo', path: '/tmp/test-repo', ...overrides };
}

function makeSavedGraph(label: string): CodeGraph {
  return {
    generatedAt: '2026-05-01T00:00:00.000Z',
    repositories: [{ id: label, label, path: `/tmp/${label}` }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
  };
}

function makeTrailDbStub(saved: CodeGraph | null = null): {
  getCurrentCodeGraph: jest.Mock;
  saveCurrentCodeGraph: jest.Mock;
} {
  return {
    getCurrentCodeGraph: jest.fn().mockReturnValue(saved),
    saveCurrentCodeGraph: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// generate() — 基本フロー
// ---------------------------------------------------------------------------

describe('CodeGraphService.generate()', () => {
  let tmpDir: string;

  beforeEach(() => {
    // tsconfig.json が存在しない temp dir を使うことで runAnalyze() のスキップ分岐もテスト
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('単一リポジトリで per-repo の CodeGraph 配列（1 件）を返す', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ path: tmpDir })],
      trailDb: db as never,
    });
    // generate() は per-repo の CodeGraph 配列を返す。リポ 1 件 → 配列長 1。
    const graphs = await svc.generate();
    expect(graphs).toHaveLength(1);
    const graph = graphs[0];

    expect(graph).toMatchObject({
      repositories: expect.any(Array),
      nodes: expect.any(Array),
      edges: expect.any(Array),
      communities: expect.any(Object),
      godNodes: expect.any(Array),
    });
    // per-repo グラフなので repositories は当該リポジトリ 1 件のみ。
    expect(graph.repositories).toHaveLength(1);
    // generatedAt が ISO 形式であること
    expect(graph.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('空 repositories のときは空配列を返し save しない', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [],
      trailDb: db as never,
    });
    const graphs = await svc.generate();
    expect(graphs).toEqual([]);
    expect(db.saveCurrentCodeGraph).not.toHaveBeenCalled();
  });

  it('onProgress コールバックが phase=100 で完了通知される', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ path: tmpDir })],
      trailDb: db as never,
    });

    const calls: Array<[string, number]> = [];
    await svc.generate((phase, pct) => calls.push([phase, pct]));

    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe(100);
  });

  it('generate() 後に getGraph() でキャッシュが取得できる', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'test-repo', label: 'test-repo', path: tmpDir })],
      trailDb: db as never,
    });
    const generated = await svc.generate();
    const cached = svc.getGraph('test-repo');
    // generate() は配列を返すようになったため、cache は配列要素と同一参照になる。
    expect(cached).toBe(generated[0]);
  });

  it('trailDb が設定されているとき saveCurrentCodeGraph が呼ばれる', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ path: tmpDir })],
      trailDb: db as never,
    });
    await svc.generate();
    expect(db.saveCurrentCodeGraph).toHaveBeenCalledTimes(1);
    const [repoName, savedGraph] = db.saveCurrentCodeGraph.mock.calls[0];
    expect(repoName).toBe('test-repo');
    expect(savedGraph).toMatchObject({ repositories: expect.any(Array) });
  });

  it('trailDb が未設定のときは warn ログが出て保存されない', async () => {
    const warnMessages: string[] = [];
    const svc = new CodeGraphService({
      repositories: [makeRepo({ path: tmpDir })],
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn((msg: string) => warnMessages.push(msg)),
        error: jest.fn(),
        child: jest.fn(),
      },
    });
    await svc.generate();
    expect(warnMessages.some((m) => m.includes('trailDb not configured'))).toBe(true);
  });

  it('onProgress なしで呼んでもクラッシュしない', async () => {
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ path: tmpDir })],
      trailDb: db as never,
    });
    await expect(svc.generate()).resolves.toBeDefined();
  });

  it('複数リポジトリをリポジトリ単位で分離して個別保存する', async () => {
    // trailGraphProvider で 2 つのリポジトリのグラフを供給する
    const trailGraphA: TrailGraph = {
      nodes: [
        { id: 'file::packages/a/src/foo.ts', label: 'foo', type: 'file', filePath: 'packages/a/src/foo.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };
    const trailGraphB: TrailGraph = {
      nodes: [
        { id: 'file::packages/b/src/bar.ts', label: 'bar', type: 'file', filePath: 'packages/b/src/bar.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };

    const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-test-b-'));
    try {
      const db = makeTrailDbStub();
      const svc = new CodeGraphService({
        repositories: [
          { id: 'repo-a', label: 'repo-a', path: tmpDir },
          { id: 'repo-b', label: 'repo-b', path: tmpDirB },
        ],
        trailGraphProvider: () => ({ 'repo-a': trailGraphA, 'repo-b': trailGraphB }),
        trailDb: db as never,
      });
      // per-repo 生成: リポ 2 件 → 配列長 2、各要素は単一リポのグラフ。
      const graphs = await svc.generate();
      expect(graphs).toHaveLength(2);

      // 各グラフは「自リポのノードのみ」を含み、他リポのノードは含まない（分離保存）。
      const idsA = graphs[0].nodes.map((n) => n.id);
      const idsB = graphs[1].nodes.map((n) => n.id);
      expect(idsA).toContain('repo-a:packages/a/src/foo');
      expect(idsA).not.toContain('repo-b:packages/b/src/bar');
      expect(idsB).toContain('repo-b:packages/b/src/bar');
      expect(idsB).not.toContain('repo-a:packages/a/src/foo');

      // 各グラフの repositories は自リポ 1 件のみ。
      expect(graphs[0].repositories.map((r) => r.id)).toEqual(['repo-a']);
      expect(graphs[1].repositories.map((r) => r.id)).toEqual(['repo-b']);

      // save はリポごとに 1 回ずつ（計 2 回）、それぞれ自リポ名で呼ばれる。
      expect(db.saveCurrentCodeGraph).toHaveBeenCalledTimes(2);
      const savedRepoNames = db.saveCurrentCodeGraph.mock.calls.map((c: unknown[]) => c[0]);
      expect(savedRepoNames).toEqual(['repo-a', 'repo-b']);

      // getGraph はリポごとに個別キャッシュを返す。
      expect(svc.getGraph('repo-a')).toBe(graphs[0]);
      expect(svc.getGraph('repo-b')).toBe(graphs[1]);
    } finally {
      fs.rmSync(tmpDirB, { recursive: true });
    }
  });

  it('trailGraphProvider がグラフを返すとき analyze() は呼ばれない', async () => {
    const { analyze } = require('@anytime-markdown/trail-core/analyze') as { analyze: jest.Mock };
    analyze.mockClear();

    const trailGraph: TrailGraph = {
      nodes: [],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 0 },
    };
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'repo-x', label: 'repo-x', path: tmpDir })],
      trailGraphProvider: () => ({ 'repo-x': trailGraph }),
      trailDb: db as never,
    });
    await svc.generate();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('c4ElementsProvider がある場合にコミュニティラベルに反映される', async () => {
    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::packages/ui/src/Button.tsx', label: 'Button', type: 'file', filePath: 'packages/ui/src/Button.tsx', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'ui-repo', label: 'ui-repo', path: tmpDir })],
      trailGraphProvider: () => ({ 'ui-repo': trailGraph }),
      c4ElementsProvider: () => [
        { id: 'pkg_ui', type: 'container', name: 'UI Package' },
      ],
      trailDb: db as never,
    });
    const graph = (await svc.generate())[0];
    // community ラベルがある（空でない）
    expect(Object.values(graph.communities).length).toBeGreaterThan(0);
  });

  it('重複するノード ID が seenNodes でフィルタされる', async () => {
    // 同じファイルが 2 回含まれるグラフ（通常は起こらないが念のため）
    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::packages/a/src/dup.ts', label: 'dup', type: 'file', filePath: 'packages/a/src/dup.ts', line: 1 },
        { id: 'file::packages/a/src/dup.ts', label: 'dup', type: 'file', filePath: 'packages/a/src/dup.ts', line: 1 },
      ],
      edges: [],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 1 },
    };
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'dup-repo', label: 'dup-repo', path: tmpDir })],
      trailGraphProvider: () => ({ 'dup-repo': trailGraph }),
      trailDb: db as never,
    });
    const graph = (await svc.generate())[0];
    const dupNodes = graph.nodes.filter((n) => n.id === 'dup-repo:packages/a/src/dup');
    expect(dupNodes).toHaveLength(1);
  });

  it('god nodes が最大 10 件でサイズ降順に選ばれる', async () => {
    // 11 個のノードを作る。size は GraphBuilder がエッジの in-degree で設定する
    const fileNodes = Array.from({ length: 11 }, (_, i) => ({
      id: `file::packages/a/src/f${i}.ts`,
      label: `f${i}`,
      type: 'file' as const,
      filePath: `packages/a/src/f${i}.ts`,
      line: 1,
    }));
    // f0 が最も多くの in-edge を持つようにエッジを作る
    const edges = fileNodes.slice(1).map((n) => ({
      source: n.id,
      target: fileNodes[0].id,
      type: 'import' as const,
    }));
    const trailGraph: TrailGraph = {
      nodes: fileNodes,
      edges,
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 11 },
    };
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'large-repo', label: 'large-repo', path: tmpDir })],
      trailGraphProvider: () => ({ 'large-repo': trailGraph }),
      trailDb: db as never,
    });
    const graph = (await svc.generate())[0];
    expect(graph.godNodes.length).toBeLessThanOrEqual(10);
    // godNodes の先頭は最も size が大きいノードのはず
    if (graph.godNodes.length > 1) {
      const sizes = graph.nodes.reduce((m, n) => { m.set(n.id, n.size); return m; }, new Map<string, number>());
      const firstSize = sizes.get(graph.godNodes[0]) ?? 0;
      const lastSize = sizes.get(graph.godNodes[graph.godNodes.length - 1]) ?? 0;
      expect(firstSize).toBeGreaterThanOrEqual(lastSize);
    }
  });

  it('エッジの dedup: 同じ source/target ペアが 1 回だけ出力される', async () => {
    // 同一ファイルペアを source-level でも symbol-level でも参照
    const trailGraph: TrailGraph = {
      nodes: [
        { id: 'file::packages/a/src/a.ts', label: 'a', type: 'file', filePath: 'packages/a/src/a.ts', line: 1 },
        { id: 'file::packages/b/src/b.ts', label: 'b', type: 'file', filePath: 'packages/b/src/b.ts', line: 1 },
        { id: 'sym::a:fn1', label: 'fn1', type: 'function', filePath: 'packages/a/src/a.ts', line: 5 },
        { id: 'sym::b:fn2', label: 'fn2', type: 'function', filePath: 'packages/b/src/b.ts', line: 5 },
      ],
      edges: [
        { source: 'file::packages/a/src/a.ts', target: 'file::packages/b/src/b.ts', type: 'import' },
        { source: 'sym::a:fn1', target: 'sym::b:fn2', type: 'import' },
      ],
      metadata: { projectRoot: tmpDir, analyzedAt: '2026-01-01', fileCount: 2 },
    };
    const db = makeTrailDbStub();
    const svc = new CodeGraphService({
      repositories: [makeRepo({ id: 'dedup-repo', label: 'dedup-repo', path: tmpDir })],
      trailGraphProvider: () => ({ 'dedup-repo': trailGraph }),
      trailDb: db as never,
    });
    const graph = (await svc.generate())[0];
    const key = (e: { source: string; target: string }) => `${e.source} ${e.target}`;
    const keys = graph.edges.map(key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});

// ---------------------------------------------------------------------------
// runAnalyze() — tsconfig がない場合は undefined を返してスキップ
// ---------------------------------------------------------------------------

describe('CodeGraphService.generate() — runAnalyze() スキップ分岐', () => {
  it('tsconfig.json が存在しないとき解析をスキップして空グラフを生成する', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-notsconfig-'));
    try {
      // tsconfig.json を作らない → runAnalyze() が undefined を返す分岐に入る
      const db = makeTrailDbStub();
      const infoMessages: string[] = [];
      const svc = new CodeGraphService({
        repositories: [makeRepo({ id: 'no-tsconfig', label: 'no-tsconfig', path: tmpDir })],
        trailDb: db as never,
        logger: {
          debug: jest.fn(),
          info: jest.fn((msg: string) => infoMessages.push(msg)),
          warn: jest.fn(),
          error: jest.fn(),
          child: jest.fn(),
        },
      });
      const graph = (await svc.generate())[0];
      expect(graph.nodes).toHaveLength(0);
      expect(infoMessages.some((m) => m.includes('tsconfig not found'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('analyze() が例外をスローしたとき error ログを出して空グラフを継続する', async () => {
    const { analyze } = require('@anytime-markdown/trail-core/analyze') as { analyze: jest.Mock };
    analyze.mockImplementationOnce(() => { throw new Error('TS_CRASH'); });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-analyzecrash-'));
    // tsconfig.json を置いて runAnalyze() 内の analyze() 呼び出しに到達させる
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
    try {
      const db = makeTrailDbStub();
      const errorMessages: string[] = [];
      const svc = new CodeGraphService({
        repositories: [makeRepo({ id: 'crash-repo', label: 'crash-repo', path: tmpDir })],
        trailDb: db as never,
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn((msg: string) => errorMessages.push(msg)),
          child: jest.fn(),
        },
      });
      const graph = (await svc.generate())[0];
      expect(graph.nodes).toHaveLength(0);
      expect(errorMessages.some((m) => m.includes('analyze() failed'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// loadFromDb() エラーパス
// ---------------------------------------------------------------------------

describe('CodeGraphService.loadFromDb() — エラーパス', () => {
  it('getCurrentCodeGraph が例外をスローしたとき warn ログを出し null を返す', async () => {
    const db = {
      getCurrentCodeGraph: jest.fn(() => { throw new Error('DB_ERROR'); }),
      saveCurrentCodeGraph: jest.fn(),
    };
    const warnMessages: string[] = [];
    const svc = new CodeGraphService({
      repositories: [makeRepo()],
      trailDb: db as never,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn((msg: string) => warnMessages.push(msg)),
        error: jest.fn(),
        child: jest.fn(),
      },
    });
    const result = await svc.loadFromDb('test-repo');
    expect(result).toBeNull();
    expect(warnMessages.some((m) => m.includes('DB not ready'))).toBe(true);
  });

  it('getCurrentCodeGraph が null を返したとき cache を delete して null を返す', async () => {
    const db = makeTrailDbStub(null);
    const svc = new CodeGraphService({
      repositories: [makeRepo()],
      trailDb: db as never,
    });
    // 事前に何かキャッシュしておく
    await svc.loadFromDb('nonexistent');
    expect(svc.getGraph('nonexistent')).toBeNull();
  });

  it('trailDb 未設定・キー未設定のとき null を返す', async () => {
    const svc = new CodeGraphService({ repositories: [] });
    expect(await svc.loadFromDb()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// defaultRepoName() — path.basename フォールバック
// ---------------------------------------------------------------------------

describe('CodeGraphService defaultRepoName fallback', () => {
  it('label が空のとき path.basename(path) を使う', async () => {
    const db = makeTrailDbStub(makeSavedGraph('fallback-repo'));
    const svc = new CodeGraphService({
      repositories: [{ id: 'x', label: '', path: '/some/dir/fallback-repo' }],
      trailDb: db as never,
    });
    // label が空のとき、defaultRepoName() は path.basename('/some/dir/fallback-repo') = 'fallback-repo' を返す
    const result = await svc.loadFromDb();
    expect(db.getCurrentCodeGraph).toHaveBeenCalledWith('fallback-repo');
  });
});
