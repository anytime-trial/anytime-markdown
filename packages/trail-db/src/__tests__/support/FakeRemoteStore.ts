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

  async connect(): Promise<void> {}
  async close(): Promise<void> {}
  async unsafeClearAll(): Promise<void> {
    this.sessionRows = [];
    this.messageRows = [];
  }
  async getExistingSessionIds(): Promise<readonly string[]> { return []; }
  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> { return new Map(); }
  async upsertRepos(): Promise<void> {}
  async unsafeClearRepos(): Promise<void> {}

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
  async upsertCommitFiles(): Promise<void> {}
  async upsertReleases(): Promise<void> {}
  async upsertReleaseFiles(): Promise<void> {}
  async upsertSessionCosts(): Promise<void> {}

  async upsertAllSessionCosts(rows: readonly SessionCostRow[]): Promise<void> {
    this.sessionCostRows.push(...rows);
  }

  async upsertDailyCounts(): Promise<void> {}
  async unsafeClearCurrentGraphs(): Promise<void> {}
  async unsafeClearReleaseGraphs(): Promise<void> {}
  async upsertCurrentGraph(): Promise<void> {}
  async upsertReleaseGraph(): Promise<void> {}
  async unsafeClearMessageToolCalls(): Promise<void> { this.toolCallRows = []; }

  async upsertMessageToolCalls(rows: readonly ToolCallRow[]): Promise<void> {
    this.toolCallRows.push(...rows);
  }

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

  async listManualElements(): Promise<readonly ManualElement[]> { return this.elements; }
  async upsertManualElement(_repoId: number, e: ManualElement): Promise<void> { this.elements.push(e); }
  async deleteManualElement(): Promise<void> {}
  async listManualRelationships(): Promise<readonly ManualRelationship[]> { return this.relationships; }
  async upsertManualRelationship(_repoId: number, r: ManualRelationship): Promise<void> { this.relationships.push(r); }
  async deleteManualRelationship(): Promise<void> {}
  async listManualGroups(): Promise<readonly ManualGroup[]> { return this.groups; }
  async upsertManualGroup(_repoId: number, g: ManualGroup): Promise<void> { this.groups.push(g); }
  async deleteManualGroup(): Promise<void> {}
  async refreshMaterializedViews(): Promise<void> {}
}
