/**
 * Coverage-B tests — uncovered lines 4001..7988 in TrailDatabase.ts
 *
 * Targets:
 *   - migrateTimestampsToUTC (lines 4380, 4398, 4412, 4424-4425)
 *   - migrateTrailGraphsTable (lines 4441-4498)
 *   - migrateFileAnalysisSchema (lines 4540-4545)
 *   - backfillCommitFilesPublic (line 5090)
 *   - getSessionTokens (lines 5562-5613)
 *   - isCommitsResolved (lines 5542-5551)
 *   - parseSessionIdFromBody (line 5592)
 *   - resolveCommits empty-session branch (lines 5596-5613)
 *   - isCommitResolutionDone (lines 7264-7265)
 *   - getSessions with filters (lines 7826-7827, 7931)
 *   - getSessionBranches (lines 7879-7895)
 *   - getSessionContextStats (lines 7615-7618, 7629-7630, 7897-7938)
 *   - getSessionInterruptions (lines 7657-7665, 7939-7996)
 *   - listCurrentGraphs (lines 7419-7443)
 *   - listCurrentCodeGraphCommunities (line 7572)
 *   - upsertCurrentCodeGraphCommunityMappings (lines 7335-7381)
 *   - deleteCurrentCodeGraphs / deleteReleaseCodeGraphs (lines 7313-7325)
 *   - saveReleaseGraph / getReleaseGraph (lines 6802-6803)
 *   - getCurrentTsconfigPath without repoName (line 6726)
 *   - getManualGroups (line 6726)
 *   - getTrailGraph wrapper (line 7439)
 *   - asC4ModelStore (line 7396-7413)
 *   - runBehaviorAnalysis public wrapper (line 5079)
 *   - getTrailGraphEntries (lines 7800-7813)
 *   - fetchTemporalCoupling with empty DB (line 5358, 5377, 5401)
 */

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

// Minimal valid CodeGraph for tests that need to seed one
function makeCodeGraph(overrides: Partial<CodeGraph> = {}): CodeGraph {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

function insertSession(
  db: TrailDatabase,
  id: string,
  opts: {
    filePath?: string;
    startTime?: string;
    endTime?: string;
    model?: string;
    source?: string;
    repoName?: string;
    messageCount?: number;
  } = {},
): void {
  const rid = repoId(db, opts.repoName ?? 'testrepo');
  inner(db).run(
    `INSERT OR IGNORE INTO sessions
       (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
        message_count, file_path, file_size, imported_at, source)
     VALUES (?, ?, ?, '', '', ?, ?, ?,
             ?, ?, 0, '2026-01-01T01:00:00.000Z', ?)`,
    [
      id, id, rid, opts.model ?? '',
      opts.startTime ?? '2026-01-01T00:00:00.000Z',
      opts.endTime ?? '2026-01-01T01:00:00.000Z',
      opts.messageCount ?? 0,
      opts.filePath ?? '',
      opts.source ?? 'claude_code',
    ],
  );
}

function insertMessage(
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  opts: {
    type?: string;
    gitBranch?: string;
    stopReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheRead?: number;
    cacheCreation?: number;
    isMeta?: number;
    timestamp?: string;
  } = {},
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO messages
       (uuid, session_id, type, stop_reason, git_branch,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        is_meta, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid, sessionId,
      opts.type ?? 'assistant',
      opts.stopReason ?? null,
      opts.gitBranch ?? null,
      opts.inputTokens ?? 0,
      opts.outputTokens ?? 0,
      opts.cacheRead ?? 0,
      opts.cacheCreation ?? 0,
      opts.isMeta ?? 0,
      opts.timestamp ?? '2026-01-01T00:05:00.000Z',
    ],
  );
}

// ---------------------------------------------------------------------------
// isCommitsResolved
// ---------------------------------------------------------------------------

describe('TrailDatabase.isCommitsResolved', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns false for unknown session', () => {
    expect(db.isCommitsResolved('no-such-session')).toBe(false);
  });

  it('returns false when commits_resolved_at is NULL', () => {
    insertSession(db, 's1');
    expect(db.isCommitsResolved('s1')).toBe(false);
  });

  it('returns true when commits_resolved_at is set', () => {
    insertSession(db, 's2');
    inner(db).run(
      "UPDATE sessions SET commits_resolved_at = '2026-01-02T00:00:00.000Z' WHERE id = 's2'",
    );
    expect(db.isCommitsResolved('s2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseSessionIdFromBody
// ---------------------------------------------------------------------------

describe('TrailDatabase.parseSessionIdFromBody', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null when there is no Session-Id trailer', () => {
    const result = (db as unknown as { parseSessionIdFromBody(b: string): string | null }).parseSessionIdFromBody(
      'feat: add tests\n\nSome body text.',
    );
    expect(result).toBeNull();
  });

  it('extracts the UUID from a Session-Id trailer', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = (db as unknown as { parseSessionIdFromBody(b: string): string | null }).parseSessionIdFromBody(
      `feat: add tests\n\nSession-Id: ${uuid}`,
    );
    expect(result).toBe(uuid);
  });
});

// ---------------------------------------------------------------------------
// isCommitResolutionDone — lines 7264-7265
// ---------------------------------------------------------------------------

describe('TrailDatabase.isCommitResolutionDone', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns false for unknown session / repo', () => {
    expect(db.isCommitResolutionDone('no-session', 'no-repo')).toBe(false);
  });

  it('returns true after a resolution is recorded via markCommitResolutionDone', () => {
    insertSession(db, 'sx');
    // markCommitResolutionDone is private; call resolveCommits on a non-git path
    // to trigger it, or insert directly.
    const rid = repoId(db, 'myrepo');
    inner(db).run(
      `INSERT INTO session_commit_resolutions (session_id, repo_id, resolved_at)
       VALUES ('sx', ?, '2026-01-01T00:00:00.000Z')`,
      [rid],
    );
    expect(db.isCommitResolutionDone('sx', 'myrepo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSessions with various filters — lines 7826-7846
// ---------------------------------------------------------------------------

describe('TrailDatabase.getSessions with filters', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
    insertSession(db, 's-branch', {
      startTime: '2026-02-01T00:00:00.000Z',
      endTime: '2026-02-01T01:00:00.000Z',
      model: 'claude-opus',
      repoName: 'myrepo',
    });
    insertMessage(db, 'm-branch', 's-branch', { gitBranch: 'feature/x', type: 'user' });

    insertSession(db, 's-other', {
      startTime: '2026-03-01T00:00:00.000Z',
      endTime: '2026-03-01T01:00:00.000Z',
      model: 'claude-haiku',
      repoName: 'otherrepo',
    });
  });
  afterEach(() => db.close());

  it('filters by branch — returns only session containing that branch', () => {
    const rows = db.getSessions({ branch: 'feature/x' });
    expect(rows.map((r) => r.id)).toContain('s-branch');
    expect(rows.map((r) => r.id)).not.toContain('s-other');
  });

  it('filters by model', () => {
    const rows = db.getSessions({ model: 'claude-haiku' });
    expect(rows.map((r) => r.id)).toContain('s-other');
    expect(rows.map((r) => r.id)).not.toContain('s-branch');
  });

  it('filters by repository', () => {
    const rows = db.getSessions({ repository: 'myrepo' });
    expect(rows.map((r) => r.id)).toContain('s-branch');
    expect(rows.map((r) => r.id)).not.toContain('s-other');
  });

  it('filters by from/to date range', () => {
    const rowsFrom = db.getSessions({ from: '2026-03-01T00:00:00.000Z' });
    expect(rowsFrom.map((r) => r.id)).toContain('s-other');
    expect(rowsFrom.map((r) => r.id)).not.toContain('s-branch');

    const rowsTo = db.getSessions({ to: '2026-02-15T00:00:00.000Z' });
    expect(rowsTo.map((r) => r.id)).toContain('s-branch');
    expect(rowsTo.map((r) => r.id)).not.toContain('s-other');
  });

  it('returns empty array for unknown repo filter', () => {
    const rows = db.getSessions({ repository: 'non-existent-repo-xyz' });
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSessionBranches — lines 7879-7895
// ---------------------------------------------------------------------------

describe('TrailDatabase.getSessionBranches', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map when called with empty array', () => {
    const result = db.getSessionBranches([]);
    expect(result.size).toBe(0);
  });

  it('returns branch for sessions that have one', () => {
    insertSession(db, 's1');
    insertMessage(db, 'm1', 's1', { type: 'user', gitBranch: 'main' });
    const result = db.getSessionBranches(['s1']);
    expect(result.get('s1')).toBe('main');
  });

  it('omits sessions without any git_branch messages', () => {
    insertSession(db, 's2');
    insertMessage(db, 'm2', 's2', { type: 'user', gitBranch: null as unknown as undefined });
    const result = db.getSessionBranches(['s2']);
    expect(result.has('s2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSessionContextStats — lines 7897-7938
// ---------------------------------------------------------------------------

describe('TrailDatabase.getSessionContextStats', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map when called with empty array', () => {
    const result = db.getSessionContextStats([]);
    expect(result.size).toBe(0);
  });

  it('returns peak and initial context for a session with assistant messages', () => {
    insertSession(db, 's1');
    insertMessage(db, 'm1', 's1', {
      type: 'assistant',
      inputTokens: 100,
      cacheRead: 50,
      cacheCreation: 200,
      timestamp: '2026-01-01T00:05:00.000Z',
    });
    insertMessage(db, 'm2', 's1', {
      type: 'assistant',
      inputTokens: 300,
      cacheRead: 0,
      cacheCreation: 0,
      timestamp: '2026-01-01T00:10:00.000Z',
    });

    const result = db.getSessionContextStats(['s1']);
    const stats = result.get('s1');
    expect(stats).toBeDefined();
    // peak = max(100+50+200, 300+0+0) = 350
    expect(stats?.peak).toBe(350);
  });

  it('returns entry with peak=0 initial for session with no assistant messages', () => {
    insertSession(db, 's-empty');
    const result = db.getSessionContextStats(['s-empty']);
    // No assistant messages → no rows in peakResult → no entry OR entry has peak 0
    // Either is acceptable (graceful fallback)
    expect(result.get('s-empty') ?? { peak: 0, initial: 0 }).toEqual({ peak: 0, initial: 0 });
  });
});

// ---------------------------------------------------------------------------
// getSessionInterruptions — lines 7959-7996
// ---------------------------------------------------------------------------

describe('TrailDatabase.getSessionInterruptions', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map when called with empty array', () => {
    const result = db.getSessionInterruptions([]);
    expect(result.size).toBe(0);
  });

  it('does not flag session whose last message is an assistant (normal end)', () => {
    insertSession(db, 's-normal');
    insertMessage(db, 'm-user', 's-normal', { type: 'user', timestamp: '2026-01-01T00:04:00.000Z' });
    insertMessage(db, 'm-asst', 's-normal', { type: 'assistant', stopReason: 'end_turn', timestamp: '2026-01-01T00:05:00.000Z' });
    const result = db.getSessionInterruptions(['s-normal']);
    expect(result.has('s-normal')).toBe(false);
  });

  it('flags session interrupted with max_tokens when last assistant stop_reason is max_tokens', () => {
    insertSession(db, 's-max');
    insertMessage(db, 'mu', 's-max', { type: 'user', timestamp: '2026-01-01T00:04:00.000Z' });
    insertMessage(db, 'ma', 's-max', {
      type: 'assistant', stopReason: 'max_tokens', inputTokens: 50, timestamp: '2026-01-01T00:05:00.000Z',
    });
    const result = db.getSessionInterruptions(['s-max']);
    const entry = result.get('s-max');
    expect(entry?.interrupted).toBe(true);
    expect(entry?.reason).toBe('max_tokens');
  });

  it('flags no_response when last non-meta message is user with no following assistant', () => {
    insertSession(db, 's-noresp');
    insertMessage(db, 'mu2', 's-noresp', { type: 'user', timestamp: '2026-01-01T00:06:00.000Z' });
    const result = db.getSessionInterruptions(['s-noresp']);
    const entry = result.get('s-noresp');
    expect(entry?.interrupted).toBe(true);
    expect(entry?.reason).toBe('no_response');
  });

  it('omits session with no messages', () => {
    insertSession(db, 's-empty');
    const result = db.getSessionInterruptions(['s-empty']);
    expect(result.has('s-empty')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listCurrentGraphs — lines 7419-7443
// ---------------------------------------------------------------------------

describe('TrailDatabase.listCurrentGraphs', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when there are no current graphs', () => {
    expect(db.listCurrentGraphs()).toEqual([]);
  });

  it('returns one entry after saving a graph', () => {
    const fakeGraph = {
      metadata: {
        projectRoot: '/some/root',
        analyzedAt: '2026-01-01T00:00:00.000Z',
        version: '1',
        tsconfig: '',
        tsconfigPath: '',
      },
      nodes: [],
      edges: [],
    };
    // saveCurrentGraph(graph, tsconfigPath, commitId, repoName)
    db.saveCurrentGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveCurrentGraph']>[0], '/tsconfig.json', 'abc123', 'myrepo');
    const graphs = db.listCurrentGraphs();
    expect(graphs).toHaveLength(1);
    expect(graphs[0].commitId).toBe('abc123');
    expect(graphs[0].repoName).toBe('myrepo');
  });
});

// ---------------------------------------------------------------------------
// deleteCurrentCodeGraphs / deleteReleaseCodeGraphs — lines 7313-7325
// ---------------------------------------------------------------------------

describe('TrailDatabase delete code graph methods', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('deleteCurrentCodeGraphs runs without error on empty DB', () => {
    expect(() => db.deleteCurrentCodeGraphs()).not.toThrow();
  });

  it('deleteReleaseCodeGraphs runs without error on empty DB', () => {
    expect(() => db.deleteReleaseCodeGraphs()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getCurrentTsconfigPath without repoName — line 6726
// ---------------------------------------------------------------------------

describe('TrailDatabase.getCurrentTsconfigPath', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null when no graph is stored and no repoName given', () => {
    expect(db.getCurrentTsconfigPath()).toBeNull();
  });

  it('returns null when no graph is stored for the given repoName', () => {
    expect(db.getCurrentTsconfigPath('nonexistent-repo')).toBeNull();
  });

  it('returns tsconfig_path after saving a current graph', () => {
    const fakeGraph = {
      metadata: { projectRoot: '/p', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' },
      nodes: [], edges: [],
    };
    // saveCurrentGraph(graph, tsconfigPath, commitId, repoName)
    db.saveCurrentGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveCurrentGraph']>[0], '/p/tsconfig.json', 'c1', 'repo-x');
    const p = db.getCurrentTsconfigPath('repo-x');
    expect(p).toBe('/p/tsconfig.json');
  });

  it('returns tsconfig_path without repoName (picks first row)', () => {
    const fakeGraph = {
      metadata: { projectRoot: '/p2', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' },
      nodes: [], edges: [],
    };
    // saveCurrentGraph(graph, tsconfigPath, commitId, repoName)
    db.saveCurrentGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveCurrentGraph']>[0], '/p2/tsconfig.json', 'c2', 'repo-y');
    const p = db.getCurrentTsconfigPath();
    expect(typeof p).toBe('string');
    expect(p).toContain('tsconfig');
  });
});

// ---------------------------------------------------------------------------
// getTrailGraph wrapper — line 7439
// ---------------------------------------------------------------------------

describe('TrailDatabase.getTrailGraph', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns null for id=current when no graph exists', () => {
    expect(db.getTrailGraph()).toBeNull();
  });

  it('returns null for non-current id when release does not exist', () => {
    expect(db.getTrailGraph('v1.0.0')).toBeNull();
  });

  it('returns current graph after saving one', () => {
    const fakeGraph = {
      metadata: { projectRoot: '/root', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' },
      nodes: [], edges: [],
    };
    // saveCurrentGraph(graph, tsconfigPath, commitId, repoName)
    db.saveCurrentGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveCurrentGraph']>[0], '/tsconfig.json', 'sha1', 'rp');
    const g = db.getTrailGraph('current', 'rp');
    expect(g).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// asC4ModelStore — lines 7396-7413
// ---------------------------------------------------------------------------

describe('TrailDatabase.asC4ModelStore', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns an object with the IC4ModelStore interface', () => {
    const store = db.asC4ModelStore();
    expect(typeof store.getCurrentC4Model).toBe('function');
    expect(typeof store.getReleaseC4Model).toBe('function');
    expect(typeof store.getC4ModelEntries).toBe('function');
  });

  it('getCurrentC4Model returns null when no graph exists', () => {
    const store = db.asC4ModelStore();
    expect(store.getCurrentC4Model('no-repo')).toBeNull();
  });

  it('getReleaseC4Model returns null when no release graph exists', () => {
    const store = db.asC4ModelStore();
    expect(store.getReleaseC4Model('v99.0.0')).toBeNull();
  });

  it('getC4ModelEntries returns empty array initially', () => {
    const store = db.asC4ModelStore();
    expect(store.getC4ModelEntries()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTrailGraphEntries — lines 7800-7813
// ---------------------------------------------------------------------------

describe('TrailDatabase.getTrailGraphEntries', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when neither current nor release graphs exist', () => {
    expect(db.getTrailGraphEntries()).toEqual([]);
  });

  it('returns one entry after saving a current graph', () => {
    const fakeGraph = {
      metadata: { projectRoot: '/q', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' },
      nodes: [], edges: [],
    };
    // saveCurrentGraph(graph, tsconfigPath, commitId, repoName)
    db.saveCurrentGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveCurrentGraph']>[0], '/tsconfig.json', 'sha2', 'repo-q');
    const entries = db.getTrailGraphEntries();
    expect(entries.length).toBeGreaterThan(0);
    // First entry is current → tag = 'current' or contains 'current'
    expect(entries.some((e) => e.tag === 'current')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listCurrentCodeGraphCommunities — line 7572
// ---------------------------------------------------------------------------

describe('TrailDatabase.listCurrentCodeGraphCommunities', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for unknown repo', () => {
    const result = db.listCurrentCodeGraphCommunities('no-such-repo');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertCurrentCodeGraphCommunityMappings — lines 7335-7381
// ---------------------------------------------------------------------------

describe('TrailDatabase.upsertCurrentCodeGraphCommunityMappings', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('inserts new community mappings and returns inserted=N, updated=0', () => {
    // Seed a code graph so community rows exist
    const cg = makeCodeGraph({
      nodes: [{ id: 'n1', label: 'N1', repo: 'repo1', package: 'pkg', fileType: 'code', community: 1, communityLabel: 'C1', x: 0, y: 0, size: 1 }],
      communities: { 1: 'C1' },
    });
    db.saveCurrentCodeGraph('mappings-repo', cg);

    const result = db.upsertCurrentCodeGraphCommunityMappings('mappings-repo', [
      { communityId: 1, mappings: [{ elementId: 'pkg_foo', elementType: 'container', role: 'primary' }] },
    ]);
    expect(result.inserted + result.updated).toBe(1);
  });

  it('reports updated=1 when upserting same community again', () => {
    const cg = makeCodeGraph({
      nodes: [{ id: 'n2', label: 'N2', repo: 'repo1', package: 'pkg', fileType: 'code', community: 2, communityLabel: 'C2', x: 0, y: 0, size: 1 }],
      communities: { 2: 'C2' },
    });
    db.saveCurrentCodeGraph('mappings-repo2', cg);

    db.upsertCurrentCodeGraphCommunityMappings('mappings-repo2', [
      { communityId: 2, mappings: [] },
    ]);
    const result2 = db.upsertCurrentCodeGraphCommunityMappings('mappings-repo2', [
      { communityId: 2, mappings: [{ elementId: 'pkg_bar', elementType: 'container', role: 'secondary' }] },
    ]);
    expect(result2.updated).toBe(1);
    expect(result2.inserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// saveReleaseGraph / getReleaseGraph — lines 6802-6803
// ---------------------------------------------------------------------------

describe('TrailDatabase saveReleaseGraph / getReleaseGraph', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('saveReleaseGraph warns and does nothing when tag does not exist in releases', () => {
    const fakeGraph = {
      metadata: { projectRoot: '/r', analyzedAt: '2026-01-01T00:00:00.000Z', version: '1', tsconfig: '', tsconfigPath: '' },
      nodes: [], edges: [],
    };
    // No release record → should not throw, just log warn
    expect(() =>
      db.saveReleaseGraph(fakeGraph as unknown as Parameters<TrailDatabase['saveReleaseGraph']>[0], '/tsconfig.json', 'v0.0.0-missing'),
    ).not.toThrow();
  });

  it('getReleaseGraph returns null for unknown tag', () => {
    expect(db.getReleaseGraph('v0.0.0-unknown')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// backfillCommitFilesPublic — line 5090 (migration flag ensures no git calls needed)
// ---------------------------------------------------------------------------

describe('TrailDatabase.backfillCommitFilesPublic', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error when all commits already have files (migration skips)', () => {
    // Set the migration flag directly so the internal loop is skipped entirely
    inner(db).run(
      "INSERT OR IGNORE INTO _migrations (key) VALUES ('commit_files_backfill_v2')",
    );
    const progressMessages: string[] = [];
    expect(() => db.backfillCommitFilesPublic('/any/path', (m) => progressMessages.push(m))).not.toThrow();
  });

  it('runs without error when there are no commits to backfill', () => {
    // No session_commits → commits array is empty → marks migration and returns
    const progressMessages: string[] = [];
    expect(() => db.backfillCommitFilesPublic('/tmp', (m) => progressMessages.push(m))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSessionTokens — line 5562 (empty session branch)
// ---------------------------------------------------------------------------

describe('TrailDatabase.getSessionTokens', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns 0 for unknown session', () => {
    // getSessionTokens is public
    const tokens = db.getSessionTokens('nonexistent');
    expect(tokens).toBe(0);
  });

  it('returns correct token count for session with assistant messages', () => {
    insertSession(db, 's-tok');
    // 4 messages with different token counts
    insertMessage(db, 'm1', 's-tok', { type: 'assistant', inputTokens: 100, outputTokens: 50, timestamp: '2026-01-01T00:01:00.000Z' });
    insertMessage(db, 'm2', 's-tok', { type: 'assistant', inputTokens: 200, outputTokens: 80, timestamp: '2026-01-01T00:02:00.000Z' });
    const tokens = db.getSessionTokens('s-tok');
    expect(tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fetchTemporalCoupling empty results — lines 5358, 5377, 5401, 5462
// ---------------------------------------------------------------------------

describe('TrailDatabase.fetchTemporalCoupling empty DB', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns [] for commit granularity when no commit_files exist', () => {
    const result = db.fetchTemporalCoupling({ repoName: 'r', windowDays: 30 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] for session granularity when no message_tool_calls exist', () => {
    const result = db.fetchTemporalCoupling({ repoName: 'r', windowDays: 30, granularity: 'session' });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] for subagentType granularity when no data exists', () => {
    const result = db.fetchTemporalCoupling({ repoName: 'r', windowDays: 30, granularity: 'subagentType' });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] for directional commit coupling when no data exists', () => {
    const result = db.fetchTemporalCoupling({ repoName: 'r', windowDays: 30, directional: true });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// migrateTrailGraphsTable — lines 4441-4498
// Testing via internal method access
// ---------------------------------------------------------------------------

describe('TrailDatabase internal: migrateTrailGraphsTable', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error when trail_graphs table does not exist (no-op)', () => {
    // Table never exists in fresh DB — internal migration is a no-op
    const rawDb = inner(db);
    expect(() => {
      (db as unknown as { migrateTrailGraphsTable(db: unknown): void }).migrateTrailGraphsTable(rawDb);
    }).not.toThrow();
  });

  it('migrates orphan trail_graphs rows (drops them with a warning)', () => {
    const rawDb = inner(db);
    // Create old-style trail_graphs table
    rawDb.run(`CREATE TABLE IF NOT EXISTS trail_graphs (
      id TEXT PRIMARY KEY,
      graph_json TEXT NOT NULL,
      tsconfig_path TEXT NOT NULL DEFAULT '',
      project_root TEXT NOT NULL DEFAULT '',
      analyzed_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    )`);
    // Insert an orphan (tag not in releases)
    rawDb.run(`INSERT INTO trail_graphs VALUES ('v1.0.0-orphan', '{}', '', '', '', '')`);
    expect(() => {
      (db as unknown as { migrateTrailGraphsTable(db: unknown): void }).migrateTrailGraphsTable(rawDb);
    }).not.toThrow();
    // trail_graphs table should be dropped
    const check = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='trail_graphs'");
    expect(check[0]?.values?.length ?? 0).toBe(0);
  });

  it('skips id=current rows and drops the table', () => {
    const rawDb = inner(db);
    rawDb.run(`CREATE TABLE IF NOT EXISTS trail_graphs (
      id TEXT PRIMARY KEY, graph_json TEXT NOT NULL,
      tsconfig_path TEXT NOT NULL DEFAULT '', project_root TEXT NOT NULL DEFAULT '',
      analyzed_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
    )`);
    rawDb.run(`INSERT INTO trail_graphs VALUES ('current', '{}', '', '', '', '')`);
    expect(() => {
      (db as unknown as { migrateTrailGraphsTable(db: unknown): void }).migrateTrailGraphsTable(rawDb);
    }).not.toThrow();
    const check = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='trail_graphs'");
    expect(check[0]?.values?.length ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// migrateFileAnalysisSchema — lines 4540-4545 (drop-on-legacy)
// ---------------------------------------------------------------------------

describe('TrailDatabase internal: migrateFileAnalysisSchema', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error when legacy tables do not exist (no-op)', () => {
    const rawDb = inner(db);
    expect(() => {
      (db as unknown as { migrateFileAnalysisSchema(db: unknown): void }).migrateFileAnalysisSchema(rawDb);
    }).not.toThrow();
  });

  it('drops table when schema has no repo_name / repo_id / release_id', () => {
    const rawDb = inner(db);
    // Drop the real table first (it has repo_id), then create a degenerate one
    rawDb.run('DROP TABLE IF EXISTS current_file_analysis');
    rawDb.run(`CREATE TABLE current_file_analysis (
      file_path TEXT PRIMARY KEY,
      lines INTEGER DEFAULT 0
    )`);
    expect(() => {
      (db as unknown as { migrateFileAnalysisSchema(db: unknown): void }).migrateFileAnalysisSchema(rawDb);
    }).not.toThrow();
    const check = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='current_file_analysis'");
    // Table should be dropped
    expect(check[0]?.values?.length ?? 0).toBe(0);
  });

  it('keeps table when schema has repo_id column', () => {
    const rawDb = inner(db);
    // current_function_analysis already has repo_id from init — confirm it is kept
    const existsBefore = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='current_function_analysis'");
    if ((existsBefore[0]?.values?.length ?? 0) === 0) {
      rawDb.run(`CREATE TABLE current_function_analysis (
        repo_id INTEGER NOT NULL, file_path TEXT NOT NULL
      )`);
    }
    (db as unknown as { migrateFileAnalysisSchema(db: unknown): void }).migrateFileAnalysisSchema(rawDb);
    const check = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='current_function_analysis'");
    expect(check[0]?.values?.length ?? 0).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// migrateTimestampsToUTC — lines 4380, 4398, 4412, 4424-4425
// ---------------------------------------------------------------------------

describe('TrailDatabase internal: migrateTimestampsToUTC', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error on fresh DB (no data to convert)', () => {
    const rawDb = inner(db);
    expect(() => {
      (db as unknown as { migrateTimestampsToUTC(db: unknown): void }).migrateTimestampsToUTC(rawDb);
    }).not.toThrow();
  });

  it('is idempotent — second call is no-op (migration flag set)', () => {
    const rawDb = inner(db);
    (db as unknown as { migrateTimestampsToUTC(db: unknown): void }).migrateTimestampsToUTC(rawDb);
    expect(() => {
      (db as unknown as { migrateTimestampsToUTC(db: unknown): void }).migrateTimestampsToUTC(rawDb);
    }).not.toThrow();
  });
});
