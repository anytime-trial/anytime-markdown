import type { TrailDatabase } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';

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

  private async doSync(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncResult> {
    onProgress?.({ message: 'Fetching local sessions...' });
    const localSessions = this.trailDb.getSessions();

    onProgress?.({ message: 'Fetching remote state...' });
    const remoteSyncedAt = await this.store.getExistingSyncedAt();

    const toSync = localSessions.filter((s) => {
      const remoteImportedAt = remoteSyncedAt.get(s.id);
      return remoteImportedAt === undefined || s.imported_at > remoteImportedAt;
    });

    if (toSync.length === 0) {
      return { synced: 0, skipped: localSessions.length, errors: 0 };
    }

    const increment = 100 / toSync.length;
    let synced = 0;
    let errors = 0;

    for (const session of toSync) {
      try {
        onProgress?.({
          message: `Syncing ${session.slug || session.id.slice(0, 8)}...`,
          increment,
        });
        await this.store.upsertSessions([session]);

        const messages = this.trailDb.getMessages(session.id);
        await this.store.upsertMessages(messages);

        const commits = this.trailDb.getSessionCommits(session.id);
        await this.store.upsertCommits(commits);

        synced++;
      } catch {
        errors++;
      }
    }

    return {
      synced,
      skipped: localSessions.length - toSync.length,
      errors,
    };
  }
}
