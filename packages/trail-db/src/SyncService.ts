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

    if (localSessions.length > 0) {
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
          if (messages.length > 0) {
            await this.store.upsertMessages(messages);
          }

          synced++;
        } catch (e) {
          const id = session.slug || session.id.slice(0, 8);
          this.logger.error(`Failed to sync session ${id}`, e);
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
      this.logger.error('Failed to sync session costs', e);
      errors++;
    }

    // Sync daily_counts 全件上書き — セッション更新の有無によらず常に実行
    try {
      onProgress?.({ message: 'Syncing daily counts...' });
      const dailyCounts = this.trailDb.getAllDailyCounts();
      await this.store.upsertDailyCounts(dailyCounts);
    } catch (e) {
      this.logger.error('Failed to sync daily counts', e);
      errors++;
    }

    // Sync message_tool_calls（洗い替え: clear → upsert）
    try {
      onProgress?.({ message: 'Syncing message tool calls...' });
      await this.store.unsafeClearMessageToolCalls();
      const toolCallRows = this.trailDb.getAllMessageToolCalls(messageCutoff);
      if (toolCallRows.length > 0) {
        await this.store.upsertMessageToolCalls(toolCallRows);
      }
    } catch (e) {
      this.logger.error('Failed to sync message_tool_calls', e);
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
      }
    } catch (e) {
      this.logger.error('Failed to sync releases', e);
      errors++;
    }

    // Sync current TrailGraphs per repository (wash-away: delete all → upsert all)
    try {
      const currents = this.trailDb.listCurrentGraphs();
      onProgress?.({ message: `Syncing ${currents.length} current TrailGraphs (wash-away)...` });
      await this.store.unsafeClearCurrentGraphs();
      for (const row of currents) {
        await this.store.upsertCurrentGraph(row.repoName, JSON.stringify(row.graph), row.commitId);
      }
    } catch (e) {
      this.logger.error('Failed to sync current TrailGraphs', e);
      errors++;
    }

    // Sync historical TrailGraphs per release (wash-away)
    try {
      const graphIds = this.trailDb.getTrailGraphIds();
      const releaseIds = graphIds.filter((id) => id !== 'current');
      onProgress?.({ message: `Syncing ${releaseIds.length} release TrailGraphs (wash-away)...` });
      await this.store.unsafeClearReleaseGraphs();
      for (const id of releaseIds) {
        const graph = this.trailDb.getTrailGraph(id);
        if (!graph) continue;
        await this.store.upsertReleaseGraph(id, JSON.stringify(graph));
      }
    } catch (e) {
      this.logger.error('Failed to sync release TrailGraphs', e);
      errors++;
    }

    // Sync manual C4 elements (two-way merge) per repository
    try {
      const repoNames = [...new Set(this.trailDb.listCurrentGraphs().map(r => r.repoName))];
      for (const repoName of repoNames) {
        await this.syncManualElements(repoName);
      }
    } catch (e) {
      this.logger.error('Failed to sync manual C4 elements', e);
      errors++;
    }

    // Sync current_coverage（洗い替え）
    try {
      onProgress?.({ message: 'Syncing current coverage...' });
      const coverageRows = this.trailDb.getAllCurrentCoverage();
      await this.store.unsafeClearCurrentCoverage();
      if (coverageRows.length > 0) {
        await this.store.upsertCurrentCoverage(coverageRows);
      }
    } catch (e) {
      this.logger.error('Failed to sync current coverage', e);
      errors++;
    }

    // Sync release_coverage（洗い替え）
    try {
      onProgress?.({ message: 'Syncing release coverage...' });
      const releaseCoverageRows = this.trailDb.getAllReleaseCoverage();
      await this.store.unsafeClearReleaseCoverage();
      if (releaseCoverageRows.length > 0) {
        await this.store.upsertReleaseCoverage(releaseCoverageRows);
      }
    } catch (e) {
      this.logger.error('Failed to sync release coverage', e);
      errors++;
    }

    // Sync current_code_graphs（洗い替え）
    try {
      onProgress?.({ message: 'Syncing current code graphs...' });
      const graphRows = this.trailDb.getAllCurrentCodeGraphRaws();
      const communityRows = this.trailDb.getAllCurrentCodeGraphCommunityRaws();
      await this.store.unsafeClearCurrentCodeGraphs();
      if (graphRows.length > 0) {
        await this.store.upsertCurrentCodeGraphs(graphRows);
      }
      if (communityRows.length > 0) {
        await this.store.upsertCurrentCodeGraphCommunities(communityRows);
      }
    } catch (e) {
      this.logger.error('Failed to sync current code graphs', e);
      errors++;
    }

    // Sync release_code_graphs（洗い替え）
    try {
      onProgress?.({ message: 'Syncing release code graphs...' });
      const releaseGraphRows = this.trailDb.getAllReleaseCodeGraphRaws();
      const releaseCommunityRows = this.trailDb.getAllReleaseCodeGraphCommunityRaws();
      await this.store.unsafeClearReleaseCodeGraphs();
      if (releaseGraphRows.length > 0) {
        await this.store.upsertReleaseCodeGraphs(releaseGraphRows);
      }
      if (releaseCommunityRows.length > 0) {
        await this.store.upsertReleaseCodeGraphCommunities(releaseCommunityRows);
      }
    } catch (e) {
      this.logger.error('Failed to sync release code graphs', e);
      errors++;
    }

    // Sync current_file_analysis（洗い替え）
    try {
      onProgress?.({ message: 'Syncing current file analysis...' });
      const rows = this.trailDb.getAllCurrentFileAnalysis();
      await this.store.unsafeClearCurrentFileAnalysis();
      if (rows.length > 0) {
        await this.store.upsertCurrentFileAnalysis(rows);
      }
    } catch (e) {
      this.logger.error('Failed to sync current file analysis', e);
      errors++;
    }

    // Sync release_file_analysis（洗い替え）
    try {
      onProgress?.({ message: 'Syncing release file analysis...' });
      const rows = this.trailDb.getAllReleaseFileAnalysis();
      await this.store.unsafeClearReleaseFileAnalysis();
      if (rows.length > 0) {
        await this.store.upsertReleaseFileAnalysis(rows);
      }
    } catch (e) {
      this.logger.error('Failed to sync release file analysis', e);
      errors++;
    }

    // Sync current_function_analysis（洗い替え）
    try {
      onProgress?.({ message: 'Syncing current function analysis...' });
      const rows = this.trailDb.getAllCurrentFunctionAnalysis();
      await this.store.unsafeClearCurrentFunctionAnalysis();
      if (rows.length > 0) {
        await this.store.upsertCurrentFunctionAnalysis(rows);
      }
    } catch (e) {
      this.logger.error('Failed to sync current function analysis', e);
      errors++;
    }

    // Sync release_function_analysis（洗い替え）
    try {
      onProgress?.({ message: 'Syncing release function analysis...' });
      const rows = this.trailDb.getAllReleaseFunctionAnalysis();
      await this.store.unsafeClearReleaseFunctionAnalysis();
      if (rows.length > 0) {
        await this.store.upsertReleaseFunctionAnalysis(rows);
      }
    } catch (e) {
      this.logger.error('Failed to sync release function analysis', e);
      errors++;
    }

    // Phase 5d/5e: messages の wash-away & insert 完了後に Materialized View を並列 refresh する。
    // CONCURRENTLY refresh のため import 中もアプリは古いデータで動作可能。
    try {
      onProgress?.({ message: 'Refreshing materialized views...' });
      await this.store.refreshMaterializedViews();
    } catch (e) {
      this.logger.error('Failed to refresh materialized views', e);
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

    const [localGroups, remoteGroups] = await Promise.all([
      Promise.resolve(this.trailDb.getManualGroups(repoName)),
      this.store.listManualGroups(repoName),
    ]);
    const localGroupMap = new Map(localGroups.map(g => [g.id, g]));
    const remoteGroupMap = new Map(remoteGroups.map(g => [g.id, g]));
    const allGroupIds = new Set([...localGroupMap.keys(), ...remoteGroupMap.keys()]);

    for (const id of allGroupIds) {
      const l = localGroupMap.get(id);
      const r = remoteGroupMap.get(id);
      if (l && !r) await this.store.upsertManualGroup(repoName, l);
      else if (!l && r) this.trailDb.insertManualGroupRaw(repoName, r);
      else if (l && r && l.updatedAt !== r.updatedAt) {
        if (l.updatedAt > r.updatedAt) await this.store.upsertManualGroup(repoName, l);
        else this.trailDb.insertManualGroupRaw(repoName, r);
      }
    }
  }
}
