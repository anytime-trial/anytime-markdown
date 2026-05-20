import type { TrailDatabase } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';
import { type DbLogger, noopDbLogger } from './DbLogger';

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
  private readonly logger: DbLogger;

  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly store: IRemoteTrailStore,
    logger?: DbLogger,
  ) {
    this.logger = logger ?? noopDbLogger;
  }

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
    await this.store.unsafeClearAll();

    onProgress?.({ message: 'Fetching local sessions...' });
    const localSessions = this.trailDb.getSessions();

    // 意図的な制約: web アプリはデモ用途であり、メッセージにプロンプト等の個人データが
    // 含まれるため、Supabase への同期は直近 7 日間のみに限定している。
    // token チャートの 30D/90D 表示は現状この制約の範囲内となる。
    const messageCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let synced = 0;
    let errors = 0;

    ({ synced, errors } = await this.syncSessions(localSessions, messageCutoff, onProgress));

    errors += await this.syncStep('Syncing session costs...', onProgress, async () => {
      await this.store.upsertAllSessionCosts(this.trailDb.getAllSessionCosts());
    }, 'Failed to sync session costs');

    errors += await this.syncStep('Syncing daily counts...', onProgress, async () => {
      await this.store.upsertDailyCounts(this.trailDb.getAllDailyCounts());
    }, 'Failed to sync daily counts');

    errors += await this.syncStep('Syncing message tool calls...', onProgress, async () => {
      await this.store.unsafeClearMessageToolCalls();
      const toolCallRows = this.trailDb.getAllMessageToolCalls(messageCutoff);
      if (toolCallRows.length > 0) await this.store.upsertMessageToolCalls(toolCallRows);
    }, 'Failed to sync message_tool_calls');

    errors += await this.syncStep('Syncing releases...', onProgress, async () => {
      const releases = this.trailDb.getReleases();
      if (releases.length > 0) await this.store.upsertReleases(releases);
      for (const release of releases) {
        const files = this.trailDb.getReleaseFiles(release.tag);
        if (files.length > 0) await this.store.upsertReleaseFiles(files);
      }
    }, 'Failed to sync releases');

    errors += await this.syncStep(null, onProgress, async () => {
      const currents = this.trailDb.listCurrentGraphs();
      onProgress?.({ message: `Syncing ${currents.length} current TrailGraphs (wash-away)...` });
      await this.store.unsafeClearCurrentGraphs();
      for (const row of currents) {
        await this.store.upsertCurrentGraph(row.repoName, JSON.stringify(row.graph), row.commitId);
      }
    }, 'Failed to sync current TrailGraphs');

    errors += await this.syncStep(null, onProgress, async () => {
      const graphIds = this.trailDb.getTrailGraphIds();
      const releaseIds = graphIds.filter((id) => id !== 'current');
      onProgress?.({ message: `Syncing ${releaseIds.length} release TrailGraphs (wash-away)...` });
      await this.store.unsafeClearReleaseGraphs();
      for (const id of releaseIds) {
        const graph = this.trailDb.getTrailGraph(id);
        if (!graph) continue;
        await this.store.upsertReleaseGraph(id, JSON.stringify(graph));
      }
    }, 'Failed to sync release TrailGraphs');

    errors += await this.syncStep(null, onProgress, async () => {
      const repoNames = [...new Set(this.trailDb.listCurrentGraphs().map(r => r.repoName))];
      for (const repoName of repoNames) {
        await this.syncManualElements(repoName);
      }
    }, 'Failed to sync manual C4 elements');

    errors += await this.syncStep('Syncing current coverage...', onProgress, async () => {
      const rows = this.trailDb.getAllCurrentCoverage();
      await this.store.unsafeClearCurrentCoverage();
      if (rows.length > 0) await this.store.upsertCurrentCoverage(rows);
    }, 'Failed to sync current coverage');

    errors += await this.syncStep('Syncing release coverage...', onProgress, async () => {
      const rows = this.trailDb.getAllReleaseCoverage();
      await this.store.unsafeClearReleaseCoverage();
      if (rows.length > 0) await this.store.upsertReleaseCoverage(rows);
    }, 'Failed to sync release coverage');

    errors += await this.syncStep('Syncing current code graphs...', onProgress, async () => {
      const graphRows = this.trailDb.getAllCurrentCodeGraphRaws();
      const communityRows = this.trailDb.getAllCurrentCodeGraphCommunityRaws();
      await this.store.unsafeClearCurrentCodeGraphs();
      if (graphRows.length > 0) await this.store.upsertCurrentCodeGraphs(graphRows);
      if (communityRows.length > 0) await this.store.upsertCurrentCodeGraphCommunities(communityRows);
    }, 'Failed to sync current code graphs');

    errors += await this.syncStep('Syncing release code graphs...', onProgress, async () => {
      const releaseGraphRows = this.trailDb.getAllReleaseCodeGraphRaws();
      const releaseCommunityRows = this.trailDb.getAllReleaseCodeGraphCommunityRaws();
      await this.store.unsafeClearReleaseCodeGraphs();
      if (releaseGraphRows.length > 0) await this.store.upsertReleaseCodeGraphs(releaseGraphRows);
      if (releaseCommunityRows.length > 0) await this.store.upsertReleaseCodeGraphCommunities(releaseCommunityRows);
    }, 'Failed to sync release code graphs');

    errors += await this.syncStep('Syncing current file analysis...', onProgress, async () => {
      const rows = this.trailDb.getAllCurrentFileAnalysis();
      await this.store.unsafeClearCurrentFileAnalysis();
      if (rows.length > 0) await this.store.upsertCurrentFileAnalysis(rows);
    }, 'Failed to sync current file analysis');

    errors += await this.syncStep('Syncing release file analysis...', onProgress, async () => {
      const rows = this.trailDb.getAllReleaseFileAnalysis();
      await this.store.unsafeClearReleaseFileAnalysis();
      if (rows.length > 0) await this.store.upsertReleaseFileAnalysis(rows);
    }, 'Failed to sync release file analysis');

    errors += await this.syncStep('Syncing current function analysis...', onProgress, async () => {
      const rows = this.trailDb.getAllCurrentFunctionAnalysis();
      await this.store.unsafeClearCurrentFunctionAnalysis();
      if (rows.length > 0) await this.store.upsertCurrentFunctionAnalysis(rows);
    }, 'Failed to sync current function analysis');

    errors += await this.syncStep('Syncing release function analysis...', onProgress, async () => {
      const rows = this.trailDb.getAllReleaseFunctionAnalysis();
      await this.store.unsafeClearReleaseFunctionAnalysis();
      if (rows.length > 0) await this.store.upsertReleaseFunctionAnalysis(rows);
    }, 'Failed to sync release function analysis');

    // Phase 5d/5e: messages の wash-away & insert 完了後に Materialized View を並列 refresh する。
    // CONCURRENTLY refresh のため import 中もアプリは古いデータで動作可能。
    errors += await this.syncStep('Refreshing materialized views...', onProgress, async () => {
      await this.store.refreshMaterializedViews();
    }, 'Failed to refresh materialized views');

    return { synced, skipped: 0, errors };
  }

  /** Run a named sync step; returns 1 on error, 0 on success. */
  private async syncStep(
    message: string | null,
    onProgress: ((p: SyncProgress) => void) | undefined,
    fn: () => Promise<void>,
    errorLabel: string,
  ): Promise<number> {
    if (message) onProgress?.({ message });
    try {
      await fn();
      return 0;
    } catch (e) {
      this.logger.error(errorLabel, e);
      return 1;
    }
  }

  private async syncSessions(
    localSessions: ReturnType<TrailDatabase['getSessions']>,
    messageCutoff: string,
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;
    if (localSessions.length === 0) return { synced, errors };

    const increment = 100 / localSessions.length;
    for (const session of localSessions) {
      try {
        onProgress?.({
          message: `Syncing ${session.slug || session.id.slice(0, 8)}...`,
          increment,
        });
        await this.store.upsertSessions([session]);

        const commits = this.trailDb.getSessionCommits(session.id);
        await this.store.upsertCommits(commits);
        if (commits.length > 0) {
          const commitFiles = this.trailDb.getCommitFiles(commits.map((c) => c.commit_hash));
          if (commitFiles.length > 0) await this.store.upsertCommitFiles(commitFiles);
        }

        const messages = this.trailDb
          .getMessages(session.id)
          .filter((m) => m.timestamp >= messageCutoff);
        if (messages.length > 0) await this.store.upsertMessages(messages);

        synced++;
      } catch (e) {
        const id = session.slug || session.id.slice(0, 8);
        this.logger.error(`Failed to sync session ${id}`, e);
        errors++;
      }
    }
    return { synced, errors };
  }

  async syncManualElements(repoName: string): Promise<void> {
    const [localElements, remoteElements] = await Promise.all([
      Promise.resolve(this.trailDb.getManualElements(repoName)),
      this.store.listManualElements(repoName),
    ]);
    await this.mergeManualItems(
      localElements,
      remoteElements,
      (item) => this.store.upsertManualElement(repoName, item),
      (item) => this.trailDb.insertManualElementRaw(repoName, item),
    );

    const [localRels, remoteRels] = await Promise.all([
      Promise.resolve(this.trailDb.getManualRelationships(repoName)),
      this.store.listManualRelationships(repoName),
    ]);
    await this.mergeManualItems(
      localRels,
      remoteRels,
      (item) => this.store.upsertManualRelationship(repoName, item),
      (item) => this.trailDb.insertManualRelationshipRaw(repoName, item),
    );

    const [localGroups, remoteGroups] = await Promise.all([
      Promise.resolve(this.trailDb.getManualGroups(repoName)),
      this.store.listManualGroups(repoName),
    ]);
    await this.mergeManualItems(
      localGroups,
      remoteGroups,
      (item) => this.store.upsertManualGroup(repoName, item),
      (item) => this.trailDb.insertManualGroupRaw(repoName, item),
    );
  }

  /** Two-way last-write-wins merge for any manual item type that has an `id` and `updatedAt`. */
  private async mergeManualItems<T extends { id: string; updatedAt: string }>(
    localItems: readonly T[],
    remoteItems: readonly T[],
    pushToRemote: (item: T) => Promise<void>,
    pullToLocal: (item: T) => void,
  ): Promise<void> {
    const localMap = new Map(localItems.map(x => [x.id, x]));
    const remoteMap = new Map(remoteItems.map(x => [x.id, x]));
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
      const l = localMap.get(id);
      const r = remoteMap.get(id);
      if (l && !r) {
        await pushToRemote(l);
      } else if (!l && r) {
        pullToLocal(r);
      } else if (l && r && l.updatedAt !== r.updatedAt) {
        if (l.updatedAt > r.updatedAt) await pushToRemote(l);
        else pullToLocal(r);
      }
    }
  }
}
