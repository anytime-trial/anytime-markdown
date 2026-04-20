import type { TrailDatabase } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';
import { TrailLogger } from '../utils/TrailLogger';

export interface SyncProgress {
  message: string;
  increment?: number;
}

export interface SyncResult {
  readonly synced: number;
  readonly skipped: number;
  readonly errors: number;
}

export class SyncService {
  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly store: IRemoteTrailStore,
  ) {}

  async sync(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncResult> {
    await this.store.connect();
    try {
      return await this.doSync(onProgress);
    } finally {
      await this.store.close();
    }
  }

  /** Store が既に接続済みの場合に connect/close をスキップして同期する */
  async syncWithOpenStore(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncResult> {
    return this.doSync(onProgress);
  }

  private async doSync(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncResult> {
    onProgress?.({ message: 'Clearing remote tables...' });
    await this.store.clearAll();

    onProgress?.({ message: 'Fetching local sessions...' });
    const localSessions = this.trailDb.getSessions();

    const messageCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let synced = 0;
    let errors = 0;

    if (localSessions.length > 0) {
      const increment = 100 / localSessions.length;

      for (const session of localSessions) {
        try {
          onProgress?.({
            message: `Syncing ${session.slug || session.id.slice(0, 8)}...`,
            increment,
          });
          await this.store.upsertSessions([session]);

          const messages = this.trailDb
            .getMessages(session.id)
            .filter((m) => m.timestamp >= messageCutoff);
          if (messages.length > 0) {
            await this.store.upsertMessages(messages);
          }

          const commits = this.trailDb.getSessionCommits(session.id);
          await this.store.upsertCommits(commits);

          synced++;
        } catch (e) {
          const id = session.slug || session.id.slice(0, 8);
          TrailLogger.error(`Failed to sync session ${id}`, e);
          errors++;
        }
      }
    }

    // Sync session_costs 全件上書き — セッション更新の有無によらず常に実行
    try {
      onProgress?.({ message: 'Syncing session costs...' });
      const allSessionCosts = this.trailDb.getAllSessionCosts();
      await this.store.upsertAllSessionCosts(allSessionCosts);
    } catch (e) {
      TrailLogger.error('Failed to sync session costs', e);
      errors++;
    }

    // Sync daily_counts 全件上書き — セッション更新の有無によらず常に実行
    try {
      onProgress?.({ message: 'Syncing daily counts...' });
      const dailyCounts = this.trailDb.getAllDailyCounts();
      await this.store.upsertDailyCounts(dailyCounts);
    } catch (e) {
      TrailLogger.error('Failed to sync daily counts', e);
      errors++;
    }

    // Sync message_tool_calls（洗い替え: clear → upsert）
    try {
      onProgress?.({ message: 'Syncing message tool calls...' });
      await this.store.clearMessageToolCalls();
      const toolCallRows = this.trailDb.getAllMessageToolCalls(messageCutoff);
      if (toolCallRows.length > 0) {
        await this.store.upsertMessageToolCalls(toolCallRows);
      }
    } catch (e) {
      TrailLogger.error('Failed to sync message_tool_calls', e);
      errors++;
    }

    // Sync releases, release files and features
    try {
      onProgress?.({ message: 'Syncing releases...' });
      const releases = this.trailDb.getReleases().filter((r) => r.repo_name === 'anytime-markdown');
      if (releases.length > 0) await this.store.upsertReleases(releases);
      for (const release of releases) {
        const files = this.trailDb.getReleaseFiles(release.tag);
        if (files.length > 0) await this.store.upsertReleaseFiles(files);
        const features = this.trailDb.getReleaseFeatures(release.tag);
        if (features.length > 0) await this.store.upsertReleaseFeatures(features);
      }
    } catch (e) {
      TrailLogger.error('Failed to sync releases', e);
      errors++;
    }

    // Sync current TrailGraphs per repository (wash-away: delete all → upsert all)
    try {
      const currents = this.trailDb.listCurrentGraphs().filter((row) => row.repoName === 'anytime-markdown');
      onProgress?.({ message: `Syncing ${currents.length} current TrailGraphs (wash-away)...` });
      await this.store.clearCurrentGraphs();
      for (const row of currents) {
        await this.store.upsertCurrentGraph(row.repoName, JSON.stringify(row.graph), row.commitId);
      }
    } catch (e) {
      TrailLogger.error('Failed to sync current TrailGraphs', e);
      errors++;
    }

    // Sync historical TrailGraphs per release (wash-away)
    try {
      const graphIds = this.trailDb.getTrailGraphIds();
      const releaseIds = graphIds.filter((id) => id !== 'current');
      onProgress?.({ message: `Syncing ${releaseIds.length} release TrailGraphs (wash-away)...` });
      await this.store.clearReleaseGraphs();
      for (const id of releaseIds) {
        const graph = this.trailDb.getTrailGraph(id);
        if (!graph) continue;
        await this.store.upsertReleaseGraph(id, JSON.stringify(graph));
      }
    } catch (e) {
      TrailLogger.error('Failed to sync release TrailGraphs', e);
      errors++;
    }

    return {
      synced,
      skipped: 0,
      errors,
    };
  }

  async syncManualElements(repoName: string): Promise<void> {
    const [localElements, remoteElements] = await Promise.all([
      Promise.resolve(this.trailDb.getManualElements(repoName)),
      this.store.listManualElements(repoName),
    ]);
    const localMap = new Map(localElements.map(e => [e.id, e]));
    const remoteMap = new Map(remoteElements.map(e => [e.id, e]));
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
      const l = localMap.get(id);
      const r = remoteMap.get(id);
      if (l && !r) {
        await this.store.upsertManualElement(repoName, l);
      } else if (!l && r) {
        this.trailDb.insertManualElementRaw(repoName, r);
      } else if (l && r && l.updatedAt !== r.updatedAt) {
        if (l.updatedAt > r.updatedAt) {
          await this.store.upsertManualElement(repoName, l);
        } else {
          this.trailDb.insertManualElementRaw(repoName, r);
        }
      }
    }

    const [localRels, remoteRels] = await Promise.all([
      Promise.resolve(this.trailDb.getManualRelationships(repoName)),
      this.store.listManualRelationships(repoName),
    ]);
    const localRelMap = new Map(localRels.map(r => [r.id, r]));
    const remoteRelMap = new Map(remoteRels.map(r => [r.id, r]));
    const allRelIds = new Set([...localRelMap.keys(), ...remoteRelMap.keys()]);

    for (const id of allRelIds) {
      const l = localRelMap.get(id);
      const r = remoteRelMap.get(id);
      if (l && !r) await this.store.upsertManualRelationship(repoName, l);
      else if (!l && r) this.trailDb.insertManualRelationshipRaw(repoName, r);
      else if (l && r && l.updatedAt !== r.updatedAt) {
        if (l.updatedAt > r.updatedAt) await this.store.upsertManualRelationship(repoName, l);
        else this.trailDb.insertManualRelationshipRaw(repoName, r);
      }
    }
  }
}
