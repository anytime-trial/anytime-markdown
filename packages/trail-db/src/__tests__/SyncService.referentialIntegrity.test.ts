import { SyncService } from '../SyncService';
import { FakeRemoteStore } from './support/FakeRemoteStore';
import { createTestTrailDatabase } from './support/createTestDb';

type InnerDb = { run(sql: string, params?: unknown[]): void };

const recentIso = (hoursAgo: number): string =>
  new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

function insertSession(inner: InnerDb, id: string, repoId: number): void {
  inner.run(
    `INSERT OR IGNORE INTO sessions (
      id, slug, repo_id, version, entrypoint, model, start_time, end_time,
      message_count, file_path, file_size, imported_at
    ) VALUES (?, ?, ?, '0', '', '', ?, ?, 0, '', 0, ?)`,
    [id, id, repoId, recentIso(3), recentIso(1), recentIso(1)],
  );
}

function insertMessage(inner: InnerDb, uuid: string, sessionId: string): void {
  inner.run(
    `INSERT OR IGNORE INTO messages (uuid, session_id, type, timestamp, text_content)
     VALUES (?, ?, 'assistant', ?, 'x')`,
    [uuid, sessionId, recentIso(1)],
  );
}

function insertSessionCost(inner: InnerDb, sessionId: string): void {
  inner.run(
    `INSERT OR IGNORE INTO session_costs (
      session_id, model, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, estimated_cost_usd
    ) VALUES (?, 'claude-opus-4-8', 10, 20, 30, 40, 0.5)`,
    [sessionId],
  );
}

function insertToolCall(inner: InnerDb, id: number, sessionId: string, messageUuid: string): void {
  inner.run(
    `INSERT OR IGNORE INTO message_tool_calls (
      id, session_id, message_uuid, turn_index, call_index, tool_name, timestamp
    ) VALUES (?, ?, ?, 0, 0, 'Read', ?)`,
    [id, sessionId, messageUuid, recentIso(1)],
  );
}

describe('SyncService 参照整合ゲート', () => {
  it('セッションの upsert が失敗した分の session_costs をリモートへ送らない', async () => {
    const localDb = await createTestTrailDatabase();
    const inner = (localDb as unknown as { ensureDb(): InnerDb }).ensureDb();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    insertSession(inner, 's1', repoId);
    insertSession(inner, 's2', repoId);
    insertSessionCost(inner, 's1');
    insertSessionCost(inner, 's2');

    const store = new FakeRemoteStore();
    // s2 のセッション行だけが一過性エラーでリモートに入らない状況を再現する。
    store.failingSessionIds.add('s2');

    const result = await new SyncService(localDb, store).sync();

    expect(store.sessionRows.map((r) => r.id)).toEqual(['s1']);
    expect(store.sessionCostRows.map((r) => r.session_id)).toEqual(['s1']);
    expect(result.errors).toBeGreaterThan(0);
    localDb.close();
  });

  it('リモートへ入らなかったメッセージの message_tool_calls をリモートへ送らない', async () => {
    const localDb = await createTestTrailDatabase();
    const inner = (localDb as unknown as { ensureDb(): InnerDb }).ensureDb();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    insertSession(inner, 's1', repoId);
    insertMessage(inner, 'm1', 's1');
    insertMessage(inner, 'm2', 's1');
    insertToolCall(inner, 1, 's1', 'm1');
    insertToolCall(inner, 2, 's1', 'm2');

    const store = new FakeRemoteStore();
    // メッセージのチャンク部分失敗 (m1 のみ到達) を再現する。
    store.maxMessagesPerSession = 1;

    await new SyncService(localDb, store).sync();

    expect(store.messageRows.map((r) => r.uuid)).toEqual(['m1']);
    expect(store.toolCallRows.map((r) => r.message_uuid)).toEqual(['m1']);
    localDb.close();
  });

  it('TrailGraph の 1 件が失敗しても残りの repo を送り切る（ループのエラー隔離）', async () => {
    const localDb = await createTestTrailDatabase();
    const repoA = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    const repoB = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-b');
    const graph = {
      elements: [], relationships: [], groups: [],
      metadata: { projectRoot: '/repo', analyzedAt: '2026-07-12T00:00:00.000Z' },
    } as never;
    localDb.saveCurrentGraph(graph, 'tsconfig.json', 'commit-a', 'repo-a');
    localDb.saveCurrentGraph(graph, 'tsconfig.json', 'commit-b', 'repo-b');

    const store = new FakeRemoteStore();
    const synced: number[] = [];
    store.upsertCurrentGraph = async (repoId: number) => {
      // repo-a だけがゲートウェイ 5xx 相当で恒久的に失敗する状況を再現する。
      if (repoId === repoA) throw new Error('gateway error');
      synced.push(repoId);
    };

    const result = await new SyncService(localDb, store).sync();

    // 1 件目の失敗でループを中断せず、2 件目を送り切る。失敗は errors に計上される。
    expect(synced).toEqual([repoB]);
    expect(result.errors).toBeGreaterThan(0);
    localDb.close();
  });

  it('全て成功したときは costs / tool_calls を取りこぼさない', async () => {
    const localDb = await createTestTrailDatabase();
    const inner = (localDb as unknown as { ensureDb(): InnerDb }).ensureDb();
    const repoId = (localDb as unknown as { repoIdForName(n: string): number }).repoIdForName('repo-a');
    insertSession(inner, 's1', repoId);
    insertMessage(inner, 'm1', 's1');
    insertToolCall(inner, 1, 's1', 'm1');
    insertSessionCost(inner, 's1');

    const store = new FakeRemoteStore();

    const result = await new SyncService(localDb, store).sync();

    expect(store.sessionCostRows).toHaveLength(1);
    expect(store.toolCallRows).toHaveLength(1);
    expect(result.errors).toBe(0);
    localDb.close();
  });
});
