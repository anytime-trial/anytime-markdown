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

    // FK 親テーブル: 子テーブルより先に trail_repos を upsert する (repo_id 正規化)。
    onProgress?.({ message: 'Syncing repos...' });
    await this.store.upsertRepos(this.trailDb.getAllRepos());

    onProgress?.({ message: 'Fetching local sessions...' });
    const localSessions = this.trailDb.getSessions();

    // 意図的な制約: web アプリはデモ用途であり、メッセージにプロンプト等の個人データが
    // 含まれるため、Supabase への同期は直近 7 日間のみに限定している。
    // token チャートの 30D/90D 表示は現状この制約の範囲内となる。
    const messageCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 参照整合ゲート: 子テーブル (session_costs / message_tool_calls) は「リモートに親が
    // 実際に入った行」だけを送る。セッション/メッセージの upsert は一過性の HTTP エラーで
    // 個別に失敗しうる (per-session catch) ため、ローカル DB 全件を無条件に push すると
    // 落ちた親を参照する子行が FK 違反を起こし、子テーブル同期が丸ごと巻き添えで死ぬ。
    const { synced, errors: sessionErrors, syncedSessionIds, syncedMessageUuids } =
      await this.syncSessions(localSessions, messageCutoff, onProgress);
    let errors = sessionErrors;

    errors += await this.syncStep('Syncing session costs...', onProgress, async () => {
      const rows = this.trailDb.getAllSessionCosts();
      const eligible = rows.filter((r) => syncedSessionIds.has(r.session_id));
      this.logDroppedByGate('session_costs', rows.length, eligible.length);
      await this.store.upsertAllSessionCosts(eligible);
    }, 'Failed to sync session costs');

    errors += await this.syncStep('Syncing daily counts...', onProgress, async () => {
      await this.store.upsertDailyCounts(this.trailDb.getAllDailyCounts());
    }, 'Failed to sync daily counts');

    errors += await this.syncStep('Syncing message tool calls...', onProgress, async () => {
      await this.store.unsafeClearMessageToolCalls();
      const toolCallRows = this.trailDb.getAllMessageToolCalls(messageCutoff);
      // message_uuid / session_id 双方が FK 親のため両方の到達を確認する。
      const eligible = toolCallRows.filter(
        (r) => syncedMessageUuids.has(r.message_uuid) && syncedSessionIds.has(r.session_id),
      );
      this.logDroppedByGate('message_tool_calls', toolCallRows.length, eligible.length);
      if (eligible.length > 0) await this.store.upsertMessageToolCalls(eligible);
    }, 'Failed to sync message_tool_calls');

    errors += await this.syncStep('Syncing releases...', onProgress, async () => {
      const releases = this.trailDb.getReleases();
      if (releases.length > 0) await this.store.upsertReleases(releases);
      await this.forEachIsolated('release_files', releases, (r) => `release ${r.tag}`, async (release) => {
        const files = this.trailDb.getReleaseFiles(release.tag);
        if (files.length > 0) await this.store.upsertReleaseFiles(files);
      });
    }, 'Failed to sync releases');

    errors += await this.syncStep(null, onProgress, async () => {
      const currents = this.trailDb.listCurrentGraphs();
      onProgress?.({ message: `Syncing ${currents.length} current TrailGraphs (wash-away)...` });
      await this.store.unsafeClearCurrentGraphs();
      await this.forEachIsolated('current TrailGraphs', currents, (r) => `repo ${r.repoId}`, async (row) => {
        await this.store.upsertCurrentGraph(row.repoId, JSON.stringify(row.graph), row.commitId);
      });
    }, 'Failed to sync current TrailGraphs');

    errors += await this.syncStep(null, onProgress, async () => {
      // release_graphs は release_id キー。getTrailGraphIds は tag を返すため、release_id を
      // 持つ getReleases() から引き直して upsert する (graph 不在の release は skip)。
      const releases = this.trailDb.getReleases();
      onProgress?.({ message: `Syncing ${releases.length} release TrailGraphs (wash-away)...` });
      await this.store.unsafeClearReleaseGraphs();
      await this.forEachIsolated('release TrailGraphs', releases, (r) => `release ${r.tag}`, async (rel) => {
        if (rel.release_id == null) return;
        const graph = this.trailDb.getTrailGraph(rel.tag);
        if (!graph) return;
        await this.store.upsertReleaseGraph(rel.release_id, JSON.stringify(graph));
      });
    }, 'Failed to sync release TrailGraphs');

    errors += await this.syncStep(null, onProgress, async () => {
      // manual C4 は store 側 repo_id・local 側 repo_name で扱うため両方を渡す。
      const repos = new Map<number, string>();
      for (const r of this.trailDb.listCurrentGraphs()) repos.set(r.repoId, r.repoName);
      await this.forEachIsolated(
        'manual C4 elements',
        [...repos],
        ([repoId]) => `repo ${repoId}`,
        ([repoId, repoName]) => this.syncManualElements(repoId, repoName),
      );
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

  /**
   * 逐次同期（1 件 = 1 リクエスト）をアイテム単位で隔離する。
   *
   * 旧実装は for ループ内の throw がステップ全体を中断していたため、release graph 1 件が
   * ゲートウェイの 5xx で落ちただけで残り全件が未同期のまま残った（87 件中 9 件）。
   * ここでは全件を試行し、失敗があればまとめて throw して syncStep 側の errors に計上する。
   */
  private async forEachIsolated<T>(
    label: string,
    items: readonly T[],
    describe: (item: T) => string,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    let failed = 0;
    for (const item of items) {
      try {
        await fn(item);
      } catch (e) {
        this.logger.error(`${label}: failed for ${describe(item)}`, e);
        failed++;
      }
    }
    if (failed > 0) {
      throw new Error(`${label} failed for ${failed}/${items.length} items (see log for details)`);
    }
  }

  /** 参照整合ゲートで落とした子行を必ず可視化する（silent truncation を作らない）。 */
  private logDroppedByGate(table: string, total: number, eligible: number): void {
    const dropped = total - eligible;
    if (dropped > 0) {
      this.logger.warn(
        `${table}: skipped ${dropped}/${total} rows whose parent row did not reach the remote (FK guard). ` +
        'These rows will be synced on the next successful run.',
      );
    }
  }

  /** セッションのコミットとコミットファイルをリモートへ送る。 */
  private async syncSessionCommits(sessionId: string): Promise<void> {
    const commits = this.trailDb.getSessionCommits(sessionId);
    await this.store.upsertCommits(commits);
    if (commits.length === 0) return;
    const commitFiles = this.trailDb.getCommitFiles(commits.map((c) => c.commit_hash));
    if (commitFiles.length > 0) await this.store.upsertCommitFiles(commitFiles);
  }

  /**
   * セッションのメッセージをリモートへ送り、実際に届いた uuid を `syncedMessageUuids` へ積む。
   * 部分失敗（一部チャンクのみ到達）は store が握るため、ここでは件数差で検知して報告する。
   * 戻り値は部分失敗があったか（呼び出し元の errors カウント用）。
   */
  private async syncSessionMessages(
    sessionId: string,
    label: string,
    messageCutoff: string,
    syncedMessageUuids: Set<string>,
  ): Promise<boolean> {
    // カットオフを SQL 側に押し込み、古いメッセージを DB から取得しない。
    const messages = this.trailDb.getMessages(sessionId, { since: messageCutoff });
    if (messages.length === 0) return false;

    const persisted = await this.store.upsertMessages(messages);
    for (const uuid of persisted) syncedMessageUuids.add(uuid);
    if (persisted.length === messages.length) return false;

    this.logger.warn(
      `Session ${label}: ${messages.length - persisted.length}/${messages.length} messages failed to sync`,
    );
    return true;
  }

  private async syncSessions(
    localSessions: ReturnType<TrailDatabase['getSessions']>,
    messageCutoff: string,
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<{
    synced: number;
    errors: number;
    syncedSessionIds: ReadonlySet<string>;
    syncedMessageUuids: ReadonlySet<string>;
  }> {
    let synced = 0;
    let errors = 0;
    // リモートに実在する親のみを集める。子テーブル同期のフィルタに使う。
    const syncedSessionIds = new Set<string>();
    const syncedMessageUuids = new Set<string>();
    if (localSessions.length === 0) {
      return { synced, errors, syncedSessionIds, syncedMessageUuids };
    }

    const increment = 100 / localSessions.length;
    for (const session of localSessions) {
      const label = session.slug || session.id.slice(0, 8);
      try {
        onProgress?.({ message: `Syncing ${label}...`, increment });

        await this.store.upsertSessions([session]);
        // ここを通過した時点でセッション行はリモートに存在する（session_costs の FK 親）。
        syncedSessionIds.add(session.id);

        await this.syncSessionCommits(session.id);
        const partialMessages = await this.syncSessionMessages(
          session.id, label, messageCutoff, syncedMessageUuids,
        );
        if (partialMessages) errors++;

        synced++;
      } catch (e) {
        this.logger.error(`Failed to sync session ${label}`, e);
        errors++;
      }
    }
    return { synced, errors, syncedSessionIds, syncedMessageUuids };
  }

  // store 側は repo_id キー (正規化済 Supabase)、local 側は repo_name キー (内部で repo_id 解決) で扱う。
  async syncManualElements(repoId: number, repoName: string): Promise<void> {
    const [localElements, remoteElements] = await Promise.all([
      Promise.resolve(this.trailDb.getManualElements(repoName)),
      this.store.listManualElements(repoId),
    ]);
    await this.mergeManualItems(
      localElements,
      remoteElements,
      (item) => this.store.upsertManualElement(repoId, item),
      (item) => this.trailDb.insertManualElementRaw(repoName, item),
    );

    const [localRels, remoteRels] = await Promise.all([
      Promise.resolve(this.trailDb.getManualRelationships(repoName)),
      this.store.listManualRelationships(repoId),
    ]);
    await this.mergeManualItems(
      localRels,
      remoteRels,
      (item) => this.store.upsertManualRelationship(repoId, item),
      (item) => this.trailDb.insertManualRelationshipRaw(repoName, item),
    );

    const [localGroups, remoteGroups] = await Promise.all([
      Promise.resolve(this.trailDb.getManualGroups(repoName)),
      this.store.listManualGroups(repoId),
    ]);
    await this.mergeManualItems(
      localGroups,
      remoteGroups,
      (item) => this.store.upsertManualGroup(repoId, item),
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
