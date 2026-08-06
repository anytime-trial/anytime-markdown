/**
 * 会話取込がメインスレッドだけを対象にするための SQL 条件。
 *
 * trail.messages にはサブエージェント（Task/Agent ツールで起動した子）の往復も
 * 同じ session_id で入っており、`is_sidechain = 1` でのみ区別できる。2026-08-06
 * 実測で assistant 556,431 件中 155,195 件・user 352,212 件中 107,222 件が
 * sidechain だった。これを知識グラフへ入れると、エピソードの 34.5%・会話由来
 * エッジの 31.4% を占めながら、専有して供給するエンティティ 5,919 件の 77% が
 * File / Commit / Bug / Task の言及ノートで、Decision は 14 件・Rule は 25 件
 * しかなかった。判断はメインスレッドで下るため、調査の中間過程は取り込まない。
 *
 * 除外してよい根拠として、価値が確立している経路は別系統で守られている:
 * code-reviewer subagent の findings は review_session_incremental が
 * `ingest/review/parseReviewSession.ts` 経由で memory_reviews へ入れる。
 * **そちらは sidechain を読む必要があるため、この条件を適用してはならない。**
 *
 * @param alias 条件を置くクエリでの messages テーブル別名（省略時は無修飾）
 */
export function mainThreadOnlySql(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}is_sidechain = 0`;
}
