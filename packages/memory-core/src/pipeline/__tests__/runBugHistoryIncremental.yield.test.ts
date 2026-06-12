import type { MemoryDbConnection } from '../../db/connection/types';

// 孤児化対策の yield (一定間隔で event loop へ譲る) を検証する。
// ingest 系ヘルパと db は mock し、commit ループが YIELD_INTERVAL ごとに
// setImmediate を呼ぶことだけを確認する (実 DB 不要)。
jest.mock('../../ingest/bug-history/parseFixCommit', () => ({
  parseFixCommit: jest.fn(() => ({ package: 'pkg', category: 'logic', subject_summary: 's' })),
}));
jest.mock('../../ingest/bug-history/buildBugEntity', () => ({
  buildBugEntity: jest.fn(() => ({})),
}));
jest.mock('../../ingest/bug-history/linkAffectedFiles', () => ({
  linkAffectedFiles: jest.fn(() => ({ edges_inserted: 0, file_paths: [] })),
}));
jest.mock('../../ingest/bug-history/inferIntroducedBy', () => ({
  inferIntroducedBy: jest.fn(() => ({ edges_inserted: 0, introduced_commit_sha: null })),
}));
jest.mock('../../ingest/bug-history/linkRootCauseEpisode', () => ({
  linkRootCauseEpisode: jest.fn(),
}));
jest.mock('../../ingest/bug-history/persist', () => ({
  upsertBugEntity: jest.fn(),
  upsertCommitEntity: jest.fn(() => 'commitId'),
  upsertBugFix: jest.fn(),
  insertFixesEdge: jest.fn(() => true),
}));
jest.mock('../../canonical/entityId', () => ({
  entityId: jest.fn((kind: string, sha: string) => `${kind}:${sha}`),
}));

import { runBugHistoryIncremental } from '../runBugHistoryIncremental';

interface FakeRow {
  commit_hash: string;
  commit_message: string;
  committed_at: string;
  repo_name: string;
  session_id: string | null;
}

function makeDb(rowCount: number): MemoryDbConnection {
  const rows: FakeRow[] = Array.from({ length: rowCount }, (_, i) => ({
    commit_hash: `hash${i}`,
    commit_message: `fix: change ${i}`,
    committed_at: '2026-01-01T00:00:00.000Z',
    repo_name: 'repo',
    session_id: null,
  }));
  return {
    prepare: (sql: string) => {
      if (sql.includes('memory_pipeline_state')) {
        return {
          get: () => ({ last_processed_at: '1970-01-01T00:00:00.000Z' }),
          free: () => undefined,
        };
      }
      return {
        // stmt.iterate(repoName, lastProcessedAt) は引数を無視して全 fake 行を返す。
        iterate: function* iterate() {
          yield* rows;
        },
        free: () => undefined,
      };
    },
    run: jest.fn(),
  } as unknown as MemoryDbConnection;
}

describe('runBugHistoryIncremental の event loop yield', () => {
  let setImmediateSpy: jest.SpyInstance;

  beforeEach(() => {
    setImmediateSpy = jest.spyOn(global, 'setImmediate');
  });

  afterEach(() => {
    setImmediateSpy.mockRestore();
  });

  it('YIELD_INTERVAL (100) 件ごとに setImmediate で yield する', async () => {
    const result = await runBugHistoryIncremental({
      db: makeDb(250),
      repoName: 'repo',
      repoRoot: '/repo',
    });

    expect(result.items_processed).toBe(250);
    // 100, 200 件目で 2 回 yield する (300 件目は存在しない)。
    expect(setImmediateSpy).toHaveBeenCalledTimes(2);
  });

  it('YIELD_INTERVAL 未満なら yield しない', async () => {
    const result = await runBugHistoryIncremental({
      db: makeDb(40),
      repoName: 'repo',
      repoRoot: '/repo',
    });

    expect(result.items_processed).toBe(40);
    expect(setImmediateSpy).not.toHaveBeenCalled();
  });
});
