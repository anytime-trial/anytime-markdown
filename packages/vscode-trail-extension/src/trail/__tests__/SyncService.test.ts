const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

import { TrailDatabase } from '../TrailDatabase';
import { SyncService } from '../SyncService';
import type { IRemoteTrailStore } from '../IRemoteTrailStore';
import type { ManualElement, ManualRelationship } from '@anytime-markdown/trail-core';
import { createTestTrailDatabase } from './support/createTestDb';

const createDb = createTestTrailDatabase;

class FakeRemoteStore implements IRemoteTrailStore {
  elements: ManualElement[] = [];
  relationships: ManualRelationship[] = [];

  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async unsafeClearAll(): Promise<void> {}
  async getExistingSessionIds(): Promise<readonly string[]> { return []; }
  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> { return new Map(); }
  async upsertSessions(): Promise<void> {}
  async upsertMessages(): Promise<void> {}
  async upsertCommits(): Promise<void> {}
  async upsertCommitFiles(): Promise<void> {}
  async upsertReleases(): Promise<void> {}
  async upsertReleaseFiles(): Promise<void> {}
  async upsertReleaseFeatures(): Promise<void> {}
  async upsertSessionCosts(): Promise<void> {}
  async upsertAllSessionCosts(): Promise<void> {}
  async upsertDailyCounts(): Promise<void> {}
  async unsafeClearCurrentGraphs(): Promise<void> {}
  async unsafeClearReleaseGraphs(): Promise<void> {}
  async upsertCurrentGraph(): Promise<void> {}
  async upsertReleaseGraph(): Promise<void> {}
  async unsafeClearMessageToolCalls(): Promise<void> {}
  async upsertMessageToolCalls(): Promise<void> {}

  async listManualElements(repoName: string): Promise<readonly ManualElement[]> {
    return this.elements.filter(e => (e as ManualElement & { _repo: string })._repo === repoName);
  }
  async upsertManualElement(repoName: string, e: ManualElement): Promise<void> {
    const idx = this.elements.findIndex(x => x.id === e.id && (x as ManualElement & { _repo: string })._repo === repoName);
    const entry = { ...e, _repo: repoName } as ManualElement & { _repo: string };
    if (idx >= 0) this.elements[idx] = entry;
    else this.elements.push(entry);
  }
  async deleteManualElement(repoName: string, elementId: string): Promise<void> {
    this.elements = this.elements.filter(e => !(e.id === elementId && (e as ManualElement & { _repo: string })._repo === repoName));
  }
  async listManualRelationships(repoName: string): Promise<readonly ManualRelationship[]> {
    return this.relationships.filter(r => (r as ManualRelationship & { _repo: string })._repo === repoName);
  }
  async upsertManualRelationship(repoName: string, r: ManualRelationship): Promise<void> {
    const idx = this.relationships.findIndex(x => x.id === r.id && (x as ManualRelationship & { _repo: string })._repo === repoName);
    const entry = { ...r, _repo: repoName } as ManualRelationship & { _repo: string };
    if (idx >= 0) this.relationships[idx] = entry;
    else this.relationships.push(entry);
  }
  async deleteManualRelationship(repoName: string, relId: string): Promise<void> {
    this.relationships = this.relationships.filter(r => !(r.id === relId && (r as ManualRelationship & { _repo: string })._repo === repoName));
  }
}

describe('SyncService.syncManualElements', () => {
  it('pushes local-only elements to remote', async () => {
    const localDb = await createDb();
    const remoteStore = new FakeRemoteStore();
    localDb.saveManualElement('repo-a', { type: 'person', name: 'Local', external: false, parentId: null });
    const sync = new SyncService(localDb, remoteStore);
    await sync.syncManualElements('repo-a');
    const remoteElems = await remoteStore.listManualElements('repo-a');
    expect(remoteElems).toHaveLength(1);
    localDb.close();
  });

  it('pulls remote-only elements to local', async () => {
    const localDb = await createDb();
    const remoteStore = new FakeRemoteStore();
    await remoteStore.upsertManualElement('repo-a', {
      id: 'person_1', type: 'person', name: 'Remote',
      external: false, parentId: null, updatedAt: '2026-04-20T00:00:00.000Z',
    });
    const sync = new SyncService(localDb, remoteStore);
    await sync.syncManualElements('repo-a');
    expect(localDb.getManualElements('repo-a')).toHaveLength(1);
    localDb.close();
  });

  it('resolves conflicts with last-write-wins (remote newer)', async () => {
    const localDb = await createDb();
    const remoteStore = new FakeRemoteStore();
    localDb.saveManualElement('repo-a', { type: 'person', name: 'Old', external: false, parentId: null });
    await remoteStore.upsertManualElement('repo-a', {
      id: 'person_1', type: 'person', name: 'New',
      external: false, parentId: null, updatedAt: '2099-01-01T00:00:00.000Z',
    });
    const sync = new SyncService(localDb, remoteStore);
    await sync.syncManualElements('repo-a');
    expect(localDb.getManualElements('repo-a')[0].name).toBe('New');
    localDb.close();
  });
});
