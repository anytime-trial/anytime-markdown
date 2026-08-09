import { computeSessionCoupling } from '../../temporalCoupling/computeSessionCoupling';
import { computeTemporalCoupling } from '../../temporalCoupling/computeTemporalCoupling';
import type {
  CommitFileRow,
  ComputeTemporalCouplingOptions,
  SessionFileRow,
} from '../../temporalCoupling/types';

const looseOptions: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('temporalCoupling integration: commit-grain vs session-grain divergence', () => {
  it('captures coupling that commit-grain misses (探索的編集 → 一部しかコミットしないケース)', () => {
    // Scenario: 1 セッションで 4 ファイルを編集したが、最終的に 2 ファイルだけコミット。
    //   session edit: a.ts, b.ts, c.ts, d.ts
    //   committed   : a.ts, b.ts
    // commit 粒度では a/b ペアしか出てこないが、セッション粒度では a/b/c/d 全ペアが見える。
    const sessionRows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'a.ts' },
      { sessionId: 's1', filePath: 'b.ts' },
      { sessionId: 's1', filePath: 'c.ts' },
      { sessionId: 's1', filePath: 'd.ts' },
    ];
    const commitRows: CommitFileRow[] = [
      { commitHash: 'h1', filePath: 'a.ts' },
      { commitHash: 'h1', filePath: 'b.ts' },
    ];

    const sessionEdges = computeSessionCoupling(sessionRows, looseOptions);
    const commitEdges = computeTemporalCoupling(commitRows, looseOptions);

    // session 粒度: 4C2 = 6 ペア
    expect(sessionEdges).toHaveLength(6);
    // commit 粒度: 1 ペア
    expect(commitEdges).toHaveLength(1);
    expect(commitEdges[0]).toMatchObject({ source: 'a.ts', target: 'b.ts' });

    // セッション粒度のすべてのペアの jaccard は 1.0（1 セッションのみで全ファイル共編集）
    for (const e of sessionEdges) {
      expect(e.jaccard).toBe(1.0);
    }
  });

  it('produces equivalent edges when the same partition data is given as commit or session rows', () => {
    // 同じパーティション集合を commitHash と sessionId に流し込めば、結果も等価。
    const partitionRows: Array<readonly [string, string]> = [
      ['p1', 'core.ts'],
      ['p1', 'utils.ts'],
      ['p2', 'core.ts'],
      ['p2', 'utils.ts'],
      ['p3', 'core.ts'],
      ['p3', 'utils.ts'],
      ['p3', 'consumer.ts'],
    ];
    const commitRows: CommitFileRow[] = partitionRows.map(([k, f]) => ({
      commitHash: k,
      filePath: f,
    }));
    const sessionRows: SessionFileRow[] = partitionRows.map(([k, f]) => ({
      sessionId: k,
      filePath: f,
    }));

    const commitEdges = computeTemporalCoupling(commitRows, looseOptions);
    const sessionEdges = computeSessionCoupling(sessionRows, looseOptions);

    // 同一の partition 集合 → 同じ pair 集合・同じ jaccard
    expect(sessionEdges.length).toBe(commitEdges.length);
    const norm = (
      e: { source: string; target: string; coChangeCount: number; jaccard: number },
    ) => ({
      source: e.source,
      target: e.target,
      coChangeCount: e.coChangeCount,
      jaccard: e.jaccard,
    });
    expect(sessionEdges.map(norm)).toEqual(commitEdges.map(norm));
  });
});
