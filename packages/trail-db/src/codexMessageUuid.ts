/**
 * Codex メッセージの uuid 採番。
 *
 * `messages.uuid` は全セッション横断の PRIMARY KEY で、INSERT は `INSERT OR REPLACE`。
 * Codex の正規化は seq をセッションごとに 0 から振り直すため、sessionId を含めないと
 * 別セッション同士で uuid が衝突し、後から取り込んだセッションが先行セッションの行を
 * 上書きして奪う（実測: 243 セッション中 23 件しか messages を保持できていなかった）。
 *
 * 取り込み経路（TrailDatabase.normalizeCodexRecords）と commit 突合経路
 * （JsonlSessionReader）の双方が同じ uuid を導出する必要があるため、ここに集約する。
 * 片方だけ変えると message_commits.message_uuid が実在しない uuid を指し、
 * FK が OFF のため orphan 行として静かに蓄積する。
 */
export function codexMessageUuid(sessionId: string, seq: number): string {
  return `codex-${sessionId}-${seq}`;
}

/**
 * Codex rollout の `session_meta` から sessionId を取り出す。
 * 見つからない場合はファイル名由来の fallback を使う前提で null を返す。
 */
export function extractCodexSessionId(
  records: readonly { type?: string; payload?: Record<string, unknown> }[],
): string | null {
  for (const record of records) {
    if (record.type !== 'session_meta' || !record.payload) continue;
    const id = record.payload.id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}
