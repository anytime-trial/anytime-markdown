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

    // Sync daily_costs 全件上書き — セッション更新の有無によらず常に実行
    try {
      onProgress?.({ message: 'Syncing daily costs...' });
      const dailyCosts = this.trailDb.getAllDailyCosts();
      await this.store.upsertDailyCosts(dailyCosts);
    } catch (e) {
      TrailLogger.error('Failed to sync daily costs', e);
      errors++;
    }

    // Sync message_tool_calls
    try {
      onProgress?.({ message: 'Syncing message tool calls...' });
      const toolCallRows = this.trailDb.getAllMessageToolCalls();
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
      const releases = this.trailDb.getReleases();
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
      const currents = this.trailDb.listCurrentGraphs();
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
}
