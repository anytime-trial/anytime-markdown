import type { IKnowledgeBaseSnapshotter, KbShrinkAlert, TrailGraph } from '@anytime-markdown/trail-core';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

import type { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

const TS = '2026-07-16T10:00:00.000Z';

const makeCodeGraph = (nodeCount: number, communities: Record<number, string> = { 0: 'Community A' }): CodeGraph => ({
  generatedAt: TS,
  repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node${i}`,
    repo: 'repo1',
    package: 'pkg',
    fileType: 'code' as const,
    community: 0,
    communityLabel: 'c0',
    x: 0,
    y: 0,
    size: 1,
  })),
  edges: [],
  communities,
  godNodes: [],
});

const makeTrailGraph = (nodeCount: number): TrailGraph =>
  ({
    nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: `t${i}` })),
    edges: [],
    metadata: { projectRoot: '/repo1', analyzedAt: TS },
  }) as unknown as TrailGraph;

const makeCommunities = (count: number): Record<number, string> =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [i, `Community ${i}`]));

function makeFakeSnapshotter(): { calls: string[]; snap: IKnowledgeBaseSnapshotter } {
  const calls: string[] = [];
  const snap: IKnowledgeBaseSnapshotter = {
    snapshotBeforeDestructiveWrite: (trigger) => {
      calls.push(trigger);
      return { created: true };
    },
    listSnapshots: () => [],
    restoreSnapshot: () => {
      throw new Error('unused');
    },
  };
  return { calls, snap };
}

const kbShrinkEvents = (db: TrailDatabase) =>
  db
    .listEmergencyEvents()
    .filter((e) => e.event === 'anomaly_detected' && (JSON.parse(e.detailJson) as { kind?: string }).kind === 'kb_shrink');

describe('TrailDatabase KB persistence (Pre-write Snapshot + Shrink Audit)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe('Pre-write Snapshot の発火', () => {
    it('破壊的書込 5 経路それぞれで snapshotBeforeDestructiveWrite が呼ばれる', () => {
      const { calls, snap } = makeFakeSnapshotter();
      db.setKnowledgeBaseSnapshotter(snap);

      db.saveCurrentGraph(makeTrailGraph(1), '/tsconfig.json', 'c'.repeat(40), 'repo1');
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(1));
      db.upsertCurrentCodeGraphCommunities('repo1', [{ community_id: 0, name: 'A', summary: 's' }]);
      db.deleteCurrentCodeGraphs();
      db.deleteReleaseCodeGraphs();

      expect(calls).toEqual([
        'current_graphs',
        'current_code_graphs',
        'current_code_graph_communities',
        'current_code_graphs',
        'release_code_graphs',
      ]);
    });

    it('in-memory（snapshotter 未注入）でも throw せず動作し、一覧は空を返す', () => {
      expect(() => db.saveCurrentCodeGraph('repo1', makeCodeGraph(2))).not.toThrow();
      expect(db.listKnowledgeBaseSnapshots()).toEqual([]);
    });

    it('snapshotter が throw しても書込は成功する（fail-open）', () => {
      const broken: IKnowledgeBaseSnapshotter = {
        snapshotBeforeDestructiveWrite: () => {
          throw new Error('disk full');
        },
        listSnapshots: () => [],
        restoreSnapshot: () => {
          throw new Error('unused');
        },
      };
      db.setKnowledgeBaseSnapshotter(broken);
      expect(() => db.saveCurrentCodeGraph('repo1', makeCodeGraph(3))).not.toThrow();
      expect(db.getCurrentCodeGraph('repo1')?.nodes).toHaveLength(3);
    });
  });

  describe('Shrink Audit', () => {
    it('current_code_graphs の総数が 50% 以上減少すると emergency_log と onKbShrinkAlert に警告が出る', () => {
      const alerts: KbShrinkAlert[] = [];
      db.setKbShrinkAlertHandler((a) => alerts.push(a));

      db.saveCurrentCodeGraph('repo1', makeCodeGraph(100));
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(10));

      const events = kbShrinkEvents(db);
      expect(events).toHaveLength(1);
      const detail = JSON.parse(events[0].detailJson) as KbShrinkAlert & { kind: string };
      expect(detail.table).toBe('current_code_graphs');
      expect(detail.before).toBe(100);
      expect(detail.after).toBe(10);
      expect(events[0].actor).toBe('agent');

      expect(alerts).toHaveLength(1);
      expect(alerts[0].lossRate).toBeCloseTo(0.9);
      expect(alerts[0].repoName).toBe('repo1');
    });

    it('current_graphs（C4 モデル）の縮小も検知する', () => {
      const alerts: KbShrinkAlert[] = [];
      db.setKbShrinkAlertHandler((a) => alerts.push(a));

      db.saveCurrentGraph(makeTrailGraph(50), '/t', 'c'.repeat(40), 'repo1');
      db.saveCurrentGraph(makeTrailGraph(5), '/t', 'c'.repeat(40), 'repo1');

      expect(alerts).toHaveLength(1);
      expect(alerts[0].table).toBe('current_graphs');
    });

    it('current_code_graph_communities の行数縮小も検知する', () => {
      const alerts: KbShrinkAlert[] = [];
      db.setKbShrinkAlertHandler((a) => alerts.push(a));

      db.saveCurrentCodeGraph('repo1', makeCodeGraph(100, makeCommunities(25)));
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(100, makeCommunities(5)));

      expect(alerts).toHaveLength(1);
      expect(alerts[0].table).toBe('current_code_graph_communities');
      expect(alerts[0].before).toBe(25);
      expect(alerts[0].after).toBe(5);
    });

    it('50% 未満の減少では警告しない', () => {
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(100));
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(60));
      expect(kbShrinkEvents(db)).toHaveLength(0);
    });

    it('書込前総数が 20 未満なら警告しない（小規模グラフの誤警報防止）', () => {
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(10));
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(1));
      expect(kbShrinkEvents(db)).toHaveLength(0);
    });

    it('増加・横ばいでは警告しない', () => {
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(50));
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(80));
      expect(kbShrinkEvents(db)).toHaveLength(0);
    });

    it('delete 系（意図的全消去）では警告しない', () => {
      db.saveCurrentCodeGraph('repo1', makeCodeGraph(100));
      db.deleteCurrentCodeGraphs();
      db.deleteReleaseCodeGraphs();
      expect(kbShrinkEvents(db)).toHaveLength(0);
    });
  });

  describe('復元 API', () => {
    it('snapshotter 未解決（in-memory）の restoreKnowledgeBaseSnapshot は throw する', () => {
      expect(() => db.restoreKnowledgeBaseSnapshot(1)).toThrow(/snapshot/i);
    });
  });
});
