/**
 * 解析パイプライン → activity_boundary_drift_warnings の結線（T3）のユニットテスト。
 *
 * 判定そのものは trail-activity 側で検証済みなので、ここでは「何を DB へ渡すか」と
 * 「失敗してもパイプラインを止めないか」だけを見る。
 */
import type { Logger } from '../../runtime/Logger';
import type { CodeGraph, CodeGraphNode } from '../CodeGraph.types';
import { recordBoundaryDrift, type BoundaryDriftRecorder } from '../recordBoundaryDrift';

function makeNode(id: string, pkg: string, community: number): CodeGraphNode {
  return {
    id,
    label: id,
    repo: 'test-repo',
    package: pkg,
    fileType: 'code',
    community,
    communityLabel: `c${community}`,
    x: 0,
    y: 0,
    size: 1,
  };
}

/** community=1 に 3 パッケージが混在し dominance < 0.7 になる最小構成。 */
function makeGraph(nodes: readonly CodeGraphNode[]): CodeGraph {
  return {
    generatedAt: '2026-08-02T00:00:00.000Z',
    repositories: [{ id: 'test-repo', label: 'test-repo', path: '/tmp/test-repo' }],
    nodes,
    edges: [],
    communities: { 1: 'c1' },
    godNodes: [],
  };
}

const SPANNING_NODES = [
  makeNode('a1', 'pkg-a', 1),
  makeNode('a2', 'pkg-a', 1),
  makeNode('b1', 'pkg-b', 1),
  makeNode('b2', 'pkg-b', 1),
  makeNode('c1', 'pkg-c', 1),
];

function makeLogger(): { logger: Logger; infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  const logger: Logger = {
    debug: () => {},
    info: (msg) => infos.push(msg),
    warn: () => {},
    error: (msg) => errors.push(msg),
    child: () => logger,
  };
  return { logger, infos, errors };
}

function makeDb(overrides: Partial<BoundaryDriftRecorder> = {}): {
  db: BoundaryDriftRecorder;
  repoIdForName: jest.Mock;
  recordBoundaryDriftWarnings: jest.Mock;
} {
  const repoIdForName = jest.fn().mockReturnValue(7);
  const recordBoundaryDriftWarnings = jest.fn().mockReturnValue(1);
  const db = { repoIdForName, recordBoundaryDriftWarnings, ...overrides } as BoundaryDriftRecorder;
  return { db, repoIdForName, recordBoundaryDriftWarnings };
}

describe('recordBoundaryDrift', () => {
  it('検出した警告を repoId・グラフ生成時刻とともに保存する', () => {
    const { db, repoIdForName, recordBoundaryDriftWarnings } = makeDb();
    const { logger, infos } = makeLogger();
    const warnings: string[] = [];

    const inserted = recordBoundaryDrift({
      repoName: 'test-repo',
      graph: makeGraph(SPANNING_NODES),
      trailDb: db,
      logger,
      warnings,
    });

    expect(repoIdForName).toHaveBeenCalledWith('test-repo');
    expect(recordBoundaryDriftWarnings).toHaveBeenCalledTimes(1);
    const [repoId, detectedAt, detected] = recordBoundaryDriftWarnings.mock.calls[0];
    expect(repoId).toBe(7);
    // detected_at はグラフ生成時刻。解析を再実行しても同じグラフなら重複挿入されない鍵になる。
    expect(detectedAt).toBe('2026-08-02T00:00:00.000Z');
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ kind: 'boundary_spanning', communityId: 1, spanCount: 3 });
    expect(inserted).toBe(1);
    expect(infos.some((m) => m.includes('boundary drift warnings=1'))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('boundary_spanning のコミュニティに stable_key を与える', () => {
    const { db, recordBoundaryDriftWarnings } = makeDb();
    const { logger } = makeLogger();

    recordBoundaryDrift({
      repoName: 'test-repo',
      graph: makeGraph(SPANNING_NODES),
      trailDb: db,
      logger,
      warnings: [],
    });

    const stableKeys = recordBoundaryDriftWarnings.mock.calls[0][3] as ReadonlyMap<number, string>;
    expect([...stableKeys.keys()]).toEqual([1]);
    expect(stableKeys.get(1)).toMatch(/^[0-9a-f]+$/);
  });

  it('警告が無くても保存を呼ぶ（0 件という履歴が残る）', () => {
    const { db, recordBoundaryDriftWarnings } = makeDb();
    const { logger } = makeLogger();

    // 単一パッケージのみ＝境界跨ぎなし。
    recordBoundaryDrift({
      repoName: 'test-repo',
      graph: makeGraph([makeNode('a1', 'pkg-a', 1), makeNode('a2', 'pkg-a', 1)]),
      trailDb: db,
      logger,
      warnings: [],
    });

    expect(recordBoundaryDriftWarnings).toHaveBeenCalledTimes(1);
    expect(recordBoundaryDriftWarnings.mock.calls[0][2]).toEqual([]);
    // 判定対象のノード数を渡す（0 件警告が「健全」か「グラフが空」かの区別に要る）。
    expect(recordBoundaryDriftWarnings.mock.calls[0][4]).toBe(2);
  });

  it('グラフが無ければ DB を触らない', () => {
    const { db, repoIdForName, recordBoundaryDriftWarnings } = makeDb();
    const { logger, infos } = makeLogger();

    expect(
      recordBoundaryDrift({
        repoName: 'test-repo',
        graph: null,
        trailDb: db,
        logger,
        warnings: [],
      }),
    ).toBeNull();
    expect(repoIdForName).not.toHaveBeenCalled();
    expect(recordBoundaryDriftWarnings).not.toHaveBeenCalled();
    expect(infos.some((m) => m.includes('boundary drift skipped'))).toBe(true);
  });

  it('DB が失敗しても throw せず warnings と error ログに残す（fail-open）', () => {
    const { db } = makeDb({
      recordBoundaryDriftWarnings: jest.fn(() => {
        throw new Error('database is locked');
      }) as unknown as BoundaryDriftRecorder['recordBoundaryDriftWarnings'],
    });
    const { logger, errors } = makeLogger();
    const warnings: string[] = [];

    const inserted = recordBoundaryDrift({
      repoName: 'test-repo',
      graph: makeGraph(SPANNING_NODES),
      trailDb: db,
      logger,
      warnings,
    });

    expect(inserted).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('database is locked');
    // silent catch 禁止: repo 名付きで error ログに出ていること。
    expect(errors.some((m) => m.includes('test-repo') && m.includes('boundary drift'))).toBe(true);
  });

  it('閾値を上書きできる（既定では出る警告が出なくなる）', () => {
    const { db, recordBoundaryDriftWarnings } = makeDb();
    const { logger } = makeLogger();

    recordBoundaryDrift({
      repoName: 'test-repo',
      graph: makeGraph(SPANNING_NODES),
      trailDb: db,
      logger,
      warnings: [],
      thresholds: { minSpanCount: 4, maxDominance: 0.7, minCommunityCount: 10 },
    });

    expect(recordBoundaryDriftWarnings.mock.calls[0][2]).toEqual([]);
  });
});
