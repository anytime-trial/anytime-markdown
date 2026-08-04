import { computeAuthorHeatmap, selectTopSessions } from '../computeAuthorHeatmap';
import type { FileSessionCommitRow } from '../types';

const toNodeId = (filePath: string): string => `r:${filePath.replace(/\.tsx?$/, '')}`;

function row(
  filePath: string,
  sessionId: string,
  commitHash: string,
  committedAt: string,
): FileSessionCommitRow {
  return { filePath, sessionId, commitHash, committedAt };
}

describe('computeAuthorHeatmap', () => {
  it('空入力で空配列を返す', () => {
    expect(computeAuthorHeatmap([], { toNodeId })).toEqual([]);
  });

  it('ファイルパスをノード ID へ写して集計する', () => {
    const entries = computeAuthorHeatmap(
      [row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z')],
      { toNodeId },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].nodeId).toBe('r:a');
  });

  it('同一コミットが複数行に現れてもコミット数を重複計上しない', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('a.ts', 's1', 'c2', '2026-01-02T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries[0].commitCount).toBe(2);
  });

  it('最終編集は committedAt が最大の行のセッションになる', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-03T00:00:00.000Z'),
        row('a.ts', 's2', 'c2', '2026-01-01T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries[0].lastEditorSessionId).toBe('s1');
    expect(entries[0].lastEditedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('committedAt が同値なら commitHash 昇順で決定論的に決まる（行順に依存しない）', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const forward = computeAuthorHeatmap(
      [row('a.ts', 's1', 'c9', at), row('a.ts', 's2', 'c1', at)],
      { toNodeId },
    );
    const reversed = computeAuthorHeatmap(
      [row('a.ts', 's2', 'c1', at), row('a.ts', 's1', 'c9', at)],
      { toNodeId },
    );
    expect(forward[0].lastEditorSessionId).toBe('s2');
    expect(reversed[0].lastEditorSessionId).toBe('s2');
  });

  it('単一セッションが占有するノードは topSessionShare が 1 になる', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('a.ts', 's1', 'c2', '2026-01-02T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries[0].topSessionShare).toBe(1);
    expect(entries[0].sessionCount).toBe(1);
  });

  it('複数セッションの比率を主セッションのコミット比で出す', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('a.ts', 's1', 'c2', '2026-01-02T00:00:00.000Z'),
        row('a.ts', 's1', 'c3', '2026-01-03T00:00:00.000Z'),
        row('a.ts', 's2', 'c4', '2026-01-04T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries[0].sessionCount).toBe(2);
    expect(entries[0].topSessionShare).toBeCloseTo(0.75, 5);
    expect(entries[0].lastEditorSessionId).toBe('s2');
  });

  it('sessionId が空の行を最終編集者にも集計にも入れない', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('a.ts', '   ', 'c2', '2026-12-31T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries[0].lastEditorSessionId).toBe('s1');
    expect(entries[0].commitCount).toBe(1);
  });

  it('isKnownNode に外れるノードを落とす', () => {
    const entries = computeAuthorHeatmap(
      [
        row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('b.ts', 's1', 'c2', '2026-01-02T00:00:00.000Z'),
      ],
      { toNodeId, isKnownNode: (id) => id === 'r:a' },
    );
    expect(entries.map((e) => e.nodeId)).toEqual(['r:a']);
  });

  it('属人度の降順に並ぶ', () => {
    const entries = computeAuthorHeatmap(
      [
        row('shared.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
        row('shared.ts', 's2', 'c2', '2026-01-02T00:00:00.000Z'),
        row('owned.ts', 's3', 'c3', '2026-01-03T00:00:00.000Z'),
        row('owned.ts', 's3', 'c4', '2026-01-04T00:00:00.000Z'),
      ],
      { toNodeId },
    );
    expect(entries.map((e) => e.nodeId)).toEqual(['r:owned', 'r:shared']);
  });
});

describe('selectTopSessions', () => {
  const entries = computeAuthorHeatmap(
    [
      row('a.ts', 's1', 'c1', '2026-01-01T00:00:00.000Z'),
      row('b.ts', 's1', 'c2', '2026-01-02T00:00:00.000Z'),
      row('c.ts', 's2', 'c3', '2026-01-03T00:00:00.000Z'),
      row('d.ts', 's3', 'c4', '2026-01-04T00:00:00.000Z'),
    ],
    { toNodeId },
  );

  it('担当ノード数の多い順に limit 件だけ返す', () => {
    expect(selectTopSessions(entries, 1)).toEqual(['s1']);
  });

  it('同数はセッション ID 昇順で決定論的に並ぶ', () => {
    expect(selectTopSessions(entries, 3)).toEqual(['s1', 's2', 's3']);
  });

  it('limit が 0 以下なら空配列を返す', () => {
    expect(selectTopSessions(entries, 0)).toEqual([]);
    expect(selectTopSessions(entries, -5)).toEqual([]);
  });

  it('limit が件数を超えても全件までしか返さない', () => {
    expect(selectTopSessions(entries, 99)).toHaveLength(3);
  });
});
