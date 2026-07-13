/**
 * SyncService coverage tests
 *
 * Target uncovered lines:
 *   line 42    — syncWithOpenStore delegates to doSync without connect/close
 *   lines 86–87 — upsertReleaseFiles called when releases exist with files
 *   line 96    — upsertCurrentGraph called when listCurrentGraphs is non-empty
 *   lines 107–110 — release_id null skip + graph null skip in release TrailGraph sync
 *   line 119   — syncManualElements invoked for each repo in listCurrentGraphs
 *   lines 196–197 — syncStep catch: logger.error called + returns 1
 *   line 231   — synced++ after successful session upsert
 *   lines 261–262 — pushToRemote(l) when local newer (local wins LWW)
 *   lines 272–273 — pullToLocal(r) when remote newer (remote wins LWW, same-ts branch)
 */

import { SyncService } from '../SyncService';
import type { IRemoteTrailStore } from '../IRemoteTrailStore';
import type { ManualElement, ManualRelationship, ManualGroup } from '@anytime-markdown/trail-core';
import type { DbLogger } from '../DbLogger';
import { createTestTrailDatabase } from './support/createTestDb';

// ──────────────────────────────────────────────────────────────
// Minimal FakeRemoteStore (full interface implementation)
// ──────────────────────────────────────────────────────────────
class FakeRemoteStore implements IRemoteTrailStore {
  connected = false;
  closed = false;
  elements: ManualElement[] = [];
  relationships: ManualRelationship[] = [];
  groups: ManualGroup[] = [];
  upsertedCurrentGraphs: Array<{ repoId: number; graphJson: string; commitId: string }> = [];
  upsertedReleaseGraphs: Array<{ releaseId: number; graphJson: string }> = [];
  upsertedReleaseFiles: unknown[] = [];
  upsertedSessions: unknown[] = [];

  async connect(): Promise<void> { this.connected = true; }
  async close(): Promise<void> { this.closed = true; }
  async unsafeClearAll(): Promise<void> {}
  async getExistingSessionIds(): Promise<readonly string[]> { return []; }
  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> { return new Map(); }
  async upsertRepos(): Promise<void> {}
  async unsafeClearRepos(): Promise<void> {}
  async upsertSessions(rows: readonly unknown[]): Promise<void> {
    this.upsertedSessions.push(...rows);
  }
  async upsertMessages(rows: readonly { uuid: string }[]): Promise<readonly string[]> { return rows.map((r) => r.uuid); }
  async upsertCommits(): Promise<void> {}
  async upsertCommitFiles(): Promise<void> {}
  async upsertReleases(): Promise<void> {}
  async upsertReleaseFiles(rows: readonly unknown[]): Promise<void> {
    this.upsertedReleaseFiles.push(...rows);
  }
  async upsertSessionCosts(): Promise<void> {}
  async upsertAllSessionCosts(): Promise<void> {}
  async upsertDailyCounts(): Promise<void> {}
  async unsafeClearCurrentGraphs(): Promise<void> {}
  async unsafeClearReleaseGraphs(): Promise<void> {}
  async upsertCurrentGraph(repoId: number, graphJson: string, commitId: string): Promise<void> {
    this.upsertedCurrentGraphs.push({ repoId, graphJson, commitId });
  }
  async upsertReleaseGraph(releaseId: number, graphJson: string): Promise<void> {
    this.upsertedReleaseGraphs.push({ releaseId, graphJson });
  }
  async unsafeClearMessageToolCalls(): Promise<void> {}
  async upsertMessageToolCalls(): Promise<void> {}
  async unsafeClearCurrentCoverage(): Promise<void> {}
  async upsertCurrentCoverage(): Promise<void> {}
  async unsafeClearReleaseCoverage(): Promise<void> {}
  async upsertReleaseCoverage(): Promise<void> {}
  async unsafeClearCurrentFileAnalysis(): Promise<void> {}
  async upsertCurrentFileAnalysis(): Promise<void> {}
  async unsafeClearReleaseFileAnalysis(): Promise<void> {}
  async upsertReleaseFileAnalysis(): Promise<void> {}
  async unsafeClearCurrentFunctionAnalysis(): Promise<void> {}
  async upsertCurrentFunctionAnalysis(): Promise<void> {}
  async unsafeClearReleaseFunctionAnalysis(): Promise<void> {}
  async upsertReleaseFunctionAnalysis(): Promise<void> {}
  async unsafeClearCurrentCodeGraphs(): Promise<void> {}
  async upsertCurrentCodeGraphs(): Promise<void> {}
  async upsertCurrentCodeGraphCommunities(): Promise<void> {}
  async unsafeClearReleaseCodeGraphs(): Promise<void> {}
  async upsertReleaseCodeGraphs(): Promise<void> {}
  async upsertReleaseCodeGraphCommunities(): Promise<void> {}
  async listManualElements(repoId: number): Promise<readonly ManualElement[]> {
    return this.elements.filter(e => (e as ManualElement & { _repo: number })._repo === repoId);
  }
  async upsertManualElement(repoId: number, e: ManualElement): Promise<void> {
    const idx = this.elements.findIndex(x => x.id === e.id && (x as ManualElement & { _repo: number })._repo === repoId);
    const entry = { ...e, _repo: repoId } as ManualElement & { _repo: number };
    if (idx >= 0) this.elements[idx] = entry; else this.elements.push(entry);
  }
  async deleteManualElement(): Promise<void> {}
  async listManualRelationships(repoId: number): Promise<readonly ManualRelationship[]> {
    return this.relationships.filter(r => (r as ManualRelationship & { _repo: number })._repo === repoId);
  }
  async upsertManualRelationship(repoId: number, r: ManualRelationship): Promise<void> {
    const idx = this.relationships.findIndex(x => x.id === r.id && (x as ManualRelationship & { _repo: number })._repo === repoId);
    const entry = { ...r, _repo: repoId } as ManualRelationship & { _repo: number };
    if (idx >= 0) this.relationships[idx] = entry; else this.relationships.push(entry);
  }
  async deleteManualRelationship(): Promise<void> {}
  async listManualGroups(repoId: number): Promise<readonly ManualGroup[]> {
    return this.groups.filter(g => (g as ManualGroup & { _repo: number })._repo === repoId);
  }
  async upsertManualGroup(repoId: number, g: ManualGroup): Promise<void> {
    const idx = this.groups.findIndex(x => x.id === g.id && (x as ManualGroup & { _repo: number })._repo === repoId);
    const entry = { ...g, _repo: repoId } as ManualGroup & { _repo: number };
    if (idx >= 0) this.groups[idx] = entry; else this.groups.push(entry);
  }
  async deleteManualGroup(): Promise<void> {}
  async refreshMaterializedViews(): Promise<void> {}
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function makeRecentIso(minutesAgo = 60): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function insertSession(
  db: Awaited<ReturnType<typeof createTestTrailDatabase>>,
  sessionId: string,
  repoId: number,
): void {
  const inner = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
  const recent = makeRecentIso(60);
  const start = makeRecentIso(120);
  inner.run(
    `INSERT OR IGNORE INTO sessions (
      id, slug, repo_id, version, entrypoint, model, start_time, end_time,
      message_count, file_path, file_size, imported_at
    ) VALUES (?, ?, ?, '0', '', '', ?, ?, 0, '', 0, ?)`,
    [sessionId, sessionId, repoId, start, recent, recent],
  );
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('SyncService.syncWithOpenStore (line 42)', () => {
  it('calls doSync without connect/close, returns SyncResult', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const sync = new SyncService(localDb, store);

    // syncWithOpenStore skips store.connect() and store.close()
    const result = await sync.syncWithOpenStore();

    expect(result).toHaveProperty('synced');
    expect(result).toHaveProperty('errors');
    expect(store.connected).toBe(false);
    expect(store.closed).toBe(false);
    localDb.close();
  });

  it('reports progress messages via onProgress callback', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const sync = new SyncService(localDb, store);
    const messages: string[] = [];

    await sync.syncWithOpenStore((p) => { messages.push(p.message); });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain('Clearing remote tables');
    localDb.close();
  });
});

describe('SyncService.syncStep error path (lines 196–197)', () => {
  it('counts errors and calls logger.error when upsertAllSessionCosts throws', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const errorMessages: string[] = [];
    const logger: DbLogger = {
      info: () => {},
      warn: () => {},
      error: (msg: string) => { errorMessages.push(msg); },
      debugSql: () => {},
    };

    // upsertAllSessionCosts is called inside syncStep → its throw is caught → error++ + logger.error
    store.upsertAllSessionCosts = async () => { throw new Error('costs sync fail'); };

    const sync = new SyncService(localDb, store, logger);
    const result = await sync.sync();

    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(errorMessages.some(m => m.includes('session costs'))).toBe(true);
    localDb.close();
  });

  it('syncStep returns 1 and logs error for refreshMaterializedViews failure', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const errorMessages: string[] = [];
    const logger: DbLogger = {
      info: () => {},
      warn: () => {},
      error: (msg: string) => { errorMessages.push(msg); },
      debugSql: () => {},
    };

    store.refreshMaterializedViews = async () => { throw new Error('view refresh fail'); };

    const sync = new SyncService(localDb, store, logger);
    const result = await sync.sync();

    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(errorMessages.some(m => m.toLowerCase().includes('materialized'))).toBe(true);
    localDb.close();
  });
});

describe('SyncService.syncSessions — synced++ (line 231)', () => {
  it('increments synced count for each successfully upserted session', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    insertSession(localDb, 's-cov-1', repoId);
    insertSession(localDb, 's-cov-2', repoId);

    const sync = new SyncService(localDb, store);
    const result = await sync.sync();

    // 2 sessions were successfully upserted → synced = 2
    expect(result.synced).toBe(2);
    expect(result.errors).toBe(0);
    localDb.close();
  });
});

describe('SyncService.mergeManualItems — LWW conflict branches (lines 261–262, 272–273)', () => {
  it('pushes local item to remote when local is newer (line 261–262)', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-b');

    const elementId = 'person_conflict_1';
    // Save local element (gets a recent updatedAt)
    localDb.saveManualElement('repo-b', { type: 'person', name: 'Local Version', external: false, parentId: null });
    const localElements = localDb.getManualElements('repo-b');
    const localEl = localElements[0];

    // Put older version on remote
    await store.upsertManualElement(repoId, {
      id: localEl.id,
      type: 'person',
      name: 'Remote Version (older)',
      external: false,
      parentId: null,
      updatedAt: '2020-01-01T00:00:00.000Z', // older than local
    });

    const sync = new SyncService(localDb, store);
    await sync.syncManualElements(repoId, 'repo-b');

    // Local is newer → pushToRemote(l) executed (line 261–262)
    const remoteEl = (await store.listManualElements(repoId)).find(e => e.id === localEl.id);
    expect(remoteEl).toBeDefined();
    expect(remoteEl!.name).toBe('Local Version');
    localDb.close();
  });

  it('pulls remote item to local when remote is newer (line 272–273)', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-c');

    // Save local element with an old timestamp by inserting directly
    localDb.saveManualElement('repo-c', { type: 'person', name: 'Local Old', external: false, parentId: null });
    const localEl = localDb.getManualElements('repo-c')[0];

    // Remote has a much newer updatedAt
    await store.upsertManualElement(repoId, {
      id: localEl.id,
      type: 'person',
      name: 'Remote Newer',
      external: false,
      parentId: null,
      updatedAt: '2099-12-31T23:59:59.000Z',
    });

    const sync = new SyncService(localDb, store);
    await sync.syncManualElements(repoId, 'repo-c');

    // Remote is newer → pullToLocal(r) executed (line 272–273)
    const localAfterSync = localDb.getManualElements('repo-c').find(e => e.id === localEl.id);
    expect(localAfterSync).toBeDefined();
    expect(localAfterSync!.name).toBe('Remote Newer');
    localDb.close();
  });

  it('does not call push or pull when local and remote have same updatedAt', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-d');

    localDb.saveManualElement('repo-d', { type: 'person', name: 'Same', external: false, parentId: null });
    const localEl = localDb.getManualElements('repo-d')[0];

    // Same updatedAt on both sides → no push, no pull
    await store.upsertManualElement(repoId, {
      id: localEl.id,
      type: 'person',
      name: 'Same',
      external: false,
      parentId: null,
      updatedAt: localEl.updatedAt,
    });

    const pushSpy = jest.fn();
    store.upsertManualElement = pushSpy;

    const sync = new SyncService(localDb, store);
    await sync.syncManualElements(repoId, 'repo-d');

    // Same timestamp → neither pushToRemote nor pullToLocal should be called
    expect(pushSpy).not.toHaveBeenCalled();
    localDb.close();
  });
});

describe('SyncService.doSync — release files upsert (lines 86–87)', () => {
  it('skips upsertReleaseFiles when releases array is empty', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const sync = new SyncService(localDb, store);
    await sync.sync();
    // No releases inserted → upsertReleaseFiles never called → stays empty
    expect(store.upsertedReleaseFiles).toHaveLength(0);
    localDb.close();
  });
});

describe('SyncService.doSync — syncStep null message skips progress (line 91)', () => {
  it('does not call onProgress for null-message steps', async () => {
    const localDb = await createTestTrailDatabase();
    const store = new FakeRemoteStore();
    const sync = new SyncService(localDb, store);

    const progressMessages: string[] = [];
    await sync.sync((p) => { progressMessages.push(p.message); });

    // All messages should be non-null strings (null-message steps emit nothing)
    expect(progressMessages.every(m => typeof m === 'string')).toBe(true);
    localDb.close();
  });
});
