import type { IRemoteTrailStore } from '../../IRemoteTrailStore';
import type { SessionRow, MessageRow } from '../../TrailDatabase';
import type { ManualElement, ManualRelationship, ManualGroup } from '@anytime-markdown/trail-activity';

type SessionCostRow = {
  session_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  estimated_cost_usd: number;
};

type ToolCallRow = { id: number; session_id: string; message_uuid: string; call_index: number };

/** `fn` を同期実行し、戻り値を resolve・例外を reject に写す（await の無い async 関数と同じ意味）。 */
function settle(fn: () => void): Promise<void> {
  return new Promise((resolve) => { fn(); resolve(); });
}

/**
 * IRemoteTrailStore のテスト用 fake。リモートへ実際に届いた行を記録し、
 * 障害注入 (セッション upsert の失敗・メッセージの部分失敗) を行う。
 *
 * 参照整合の検証に使うため、`sessionRows` / `messageRows` は「リモートに存在する親」を表す。
 */
export class FakeRemoteStore implements IRemoteTrailStore {
  elements: ManualElement[] = [];
  relationships: ManualRelationship[] = [];
  groups: ManualGroup[] = [];
  commitRows: unknown[] = [];

  sessionRows: SessionRow[] = [];
  messageRows: MessageRow[] = [];
  sessionCostRows: SessionCostRow[] = [];
  toolCallRows: ToolCallRow[] = [];

  /** リモートに存在する release（release_id → 一意キー repo:tag）。unsafeClearAll では消えず、unsafePruneReleases で刈る。 */
  releases = new Map<number, string>();
  get releaseIds(): ReadonlySet<number> { return new Set(this.releases.keys()); }
  /** リモートの release graph（release_id → 内容とバージョン）。 */
  releaseGraphs = new Map<number, { graphJson: string; version: string }>();
  /** upsertReleaseGraph が呼ばれた release_id（送信量の検証用）。 */
  releaseGraphUpserts: number[] = [];

  /** upsertMessages 呼び出し時に throw する例外（セッション単位の失敗を再現する）。 */
  messageFailure: Error | null = null;
  /** upsertSessions が throw するセッション ID（一過性 HTTP 失敗を再現する）。 */
  failingSessionIds = new Set<string>();
  /** 1 セッションあたりリモートへ届くメッセージ数の上限（チャンク部分失敗を再現する）。 */
  maxMessagesPerSession: number | null = null;

  async connect(): Promise<void> { /* no-op: 接続を持たない fake なので何もしない */ }
  async close(): Promise<void> { /* no-op: 接続を持たない fake なので何もしない */ }
  async unsafeClearAll(): Promise<void> {
    this.sessionRows = [];
    this.messageRows = [];
  }
  async getExistingSessionIds(): Promise<readonly string[]> { return []; }
  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> { return new Map(); }
  async upsertRepos(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearRepos(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }

  async upsertSessions(rows: readonly SessionRow[]): Promise<void> {
    for (const row of rows) {
      if (this.failingSessionIds.has(row.id)) {
        throw new Error(`Supabase upsert sessions failed: injected transient error (${row.id})`);
      }
      this.sessionRows.push(row);
    }
  }

  async upsertMessages(rows: readonly MessageRow[]): Promise<readonly string[]> {
    if (this.messageFailure) throw this.messageFailure;
    const accepted = this.maxMessagesPerSession === null
      ? [...rows]
      : rows.slice(0, this.maxMessagesPerSession);
    this.messageRows.push(...accepted);
    return accepted.map((r) => r.uuid);
  }

  async upsertCommits(rows: readonly unknown[]): Promise<void> {
    this.commitRows.push(...rows);
  }
  async upsertCommitFiles(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  /** 本番の trail_releases と同じく release_id で upsert し、UNIQUE (repo_id, tag) 違反は throw する。 */
  upsertReleases(rows: readonly { release_id?: number | null; repo_name?: string; tag: string }[]): Promise<void> {
    return settle(() => {
      for (const r of rows) {
        if (r.release_id == null) continue;
        const key = `${r.repo_name ?? ''}:${r.tag}`;
        const holder = [...this.releases].find(([id, k]) => k === key && id !== r.release_id);
        if (holder) throw new Error(`duplicate key value violates unique constraint (repo_id, tag)=(${key}) held by ${holder[0]}`);
        this.releases.set(r.release_id, key);
      }
    });
  }
  unsafePruneReleases(keepReleaseIds: ReadonlySet<number>): Promise<void> {
    return settle(() => {
      for (const id of [...this.releases.keys()]) {
        if (keepReleaseIds.has(id)) continue;
        this.releases.delete(id);
        this.releaseGraphs.delete(id); // CASCADE
      }
    });
  }
  async upsertReleaseFiles(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertSessionCosts(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }

  async upsertAllSessionCosts(rows: readonly SessionCostRow[]): Promise<void> {
    this.sessionCostRows.push(...rows);
  }

  async upsertDailyCounts(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentGraph(_repoId: number, _graphJson: string, _commitId: string): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  getReleaseGraphVersions(): Promise<ReadonlyMap<number, string>> {
    return Promise.resolve(new Map([...this.releaseGraphs].map(([id, g]) => [id, g.version])));
  }
  /** 本番の FK（trail_release_graphs → trail_releases）と同じく、親の無い graph は throw する。 */
  upsertReleaseGraph(releaseId: number, graphJson: string, version: string): Promise<void> {
    return settle(() => {
      if (!this.releases.has(releaseId)) throw new Error(`insert violates foreign key constraint (release_id=${releaseId})`);
      this.releaseGraphUpserts.push(releaseId);
      this.releaseGraphs.set(releaseId, { graphJson, version });
    });
  }
  unsafeDeleteReleaseGraphs(releaseIds: readonly number[]): Promise<void> {
    for (const id of releaseIds) this.releaseGraphs.delete(id);
    return Promise.resolve();
  }
  async unsafeClearMessageToolCalls(): Promise<void> { this.toolCallRows = []; }

  async upsertMessageToolCalls(rows: readonly ToolCallRow[]): Promise<void> {
    this.toolCallRows.push(...rows);
  }

  async unsafeClearCurrentCoverage(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentCoverage(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearReleaseCoverage(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseCoverage(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentFileAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentFileAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentCodeGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentCodeGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentCodeGraphCommunities(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearReleaseCodeGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseCodeGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseCodeGraphCommunities(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }

  async listManualElements(): Promise<readonly ManualElement[]> { return this.elements; }
  async upsertManualElement(_repoId: number, e: ManualElement): Promise<void> { this.elements.push(e); }
  async deleteManualElement(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async listManualRelationships(): Promise<readonly ManualRelationship[]> { return this.relationships; }
  async upsertManualRelationship(_repoId: number, r: ManualRelationship): Promise<void> { this.relationships.push(r); }
  async deleteManualRelationship(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async listManualGroups(): Promise<readonly ManualGroup[]> { return this.groups; }
  async upsertManualGroup(_repoId: number, g: ManualGroup): Promise<void> { this.groups.push(g); }
  async deleteManualGroup(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async refreshMaterializedViews(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
}
