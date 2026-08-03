import type { IRemoteTrailStore } from '../../IRemoteTrailStore';
import type { SessionRow, MessageRow } from '../../TrailDatabase';
import type { ManualElement, ManualRelationship, ManualGroup } from '@anytime-markdown/trail-core';

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
  async upsertReleases(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseFiles(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertSessionCosts(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }

  async upsertAllSessionCosts(rows: readonly SessionCostRow[]): Promise<void> {
    this.sessionCostRows.push(...rows);
  }

  async upsertDailyCounts(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearReleaseGraphs(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentGraph(_repoId: number, _graphJson: string, _commitId: string): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseGraph(_releaseId: number, _graphJson: string): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
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
  async unsafeClearReleaseFileAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseFileAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearCurrentFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertCurrentFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async unsafeClearReleaseFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
  async upsertReleaseFunctionAnalysis(): Promise<void> { /* no-op: この fake は検証対象外の行を記録しない */ }
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
